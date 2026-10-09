import { db } from "./db.js";
import { baseDomain, companyFromHost, dayBounds, dayKey, groupKey, trackDomain } from "./util.js";
import { MISC_APP_LABEL, normalizeApp } from "./misc-apps.js";
import { isNoiseApp, isUsefulSegment } from "./noise.js";
export type MatchConfidence = "high" | "suggested" | "manual" | "none";
export type MatchStatus = "pending" | "confirmed" | "pushed" | "ignored";
export type MatchGroup = {
  group_key: string;
  day: string;
  domain: string | null;
  app: string | null;
  duration_sec: number;
  titles: string[];
  urls: string[];
  task_id: number | null;
  task_title: string | null;
  confidence: MatchConfidence;
  status: MatchStatus;
  pushed_elapsed_id: number | null;
};

type TaskRow = {
  task_id: number;
  title: string;
  web_urls: string;
};

const CONF_RANK: Record<MatchConfidence, number> = {
  none: 0,
  suggested: 1,
  high: 2,
  manual: 3,
};

function scoreDomain(domain: string | null, webs: string[]): MatchConfidence {
  if (!domain || webs.length === 0) return "none";
  const d = domain.toLowerCase();
  const company = companyFromHost(d);
  const b = baseDomain(d);
  for (const w of webs) {
    const ww = w.toLowerCase();
    if (ww === d) return "high";
    // same Bitrix24 portal company
    if (company && companyFromHost(ww) === company) return "high";
  }
  // don't collapse all *.bitrix24.* into one suggested match
  if (company) return "none";
  for (const w of webs) {
    const ww = w.toLowerCase();
    if (b && (ww === b || baseDomain(ww) === b)) return "suggested";
  }
  return "none";
}

/** Cursor · my-proj → my-proj; match against task title tokens. */
function projectFromApp(app: string): string | null {
  const m = app.match(/^(?:Cursor|Code)\s*[·•\-—]\s*(.+)$/i);
  return m?.[1]?.trim() || null;
}

function scoreProject(project: string | null, taskTitle: string): MatchConfidence {
  if (!project || project.length < 3) return "none";
  const p = project.toLowerCase().replace(/[-_]+/g, " ");
  const t = taskTitle.toLowerCase();
  if (t.includes(p) || t.includes(project.toLowerCase())) return "suggested";
  // shared significant token ≥4 chars
  const tokens = p.split(/\s+/).filter((x) => x.length >= 4);
  for (const tok of tokens) {
    if (t.includes(tok)) return "suggested";
  }
  return "none";
}

/** Group key: company portal / base domain; Cursor/Code project; else app. */
function bucketKey(day: string, app: string, domain: string | null): {
  key: string;
  domain: string | null;
} {
  const project = projectFromApp(app);
  if (project) {
    return { key: groupKey(day, null, `Cursor · ${project}`), domain: null };
  }
  const company = companyFromHost(domain);
  if (company) {
    return { key: groupKey(day, `company:${company}`, app), domain: domain };
  }
  const tracked = trackDomain(domain);
  if (tracked) {
    return { key: groupKey(day, tracked, app), domain: tracked };
  }
  return { key: groupKey(day, null, app), domain: null };
}

/** Rebuild pending matches for a day from non-idle segments. Keeps confirmed/pushed/manual. */
export function rebuildMatches(day = dayKey()): MatchGroup[] {
  const { start, end } = dayBounds(day);
  const raw = db
    .prepare(
      `SELECT app, title, url, domain, duration_sec
       FROM activity_segments
       WHERE idle = 0 AND ts_start >= ? AND ts_start <= ?`
    )
    .all(start, end) as Array<{
    app: string;
    title: string | null;
    url: string | null;
    domain: string | null;
    duration_sec: number;
  }>;

  // collapse misc apps + similar domains / Cursor projects into one bucket
  const buckets = new Map<
    string,
    {
      app: string;
      domain: string | null;
      duration_sec: number;
      titles: Set<string>;
      urls: Set<string>;
    }
  >();
  for (const s of raw) {
    if (!isUsefulSegment(s) || isNoiseApp(s.app)) continue;
    const app = normalizeApp(s.app);
    if (isNoiseApp(app)) continue;
    const rawDomain = app === MISC_APP_LABEL ? null : s.domain;
    const { key, domain } = bucketKey(day, app, rawDomain);
    const displayApp = projectFromApp(app) ? `Cursor · ${projectFromApp(app)}` : app;
    const b = buckets.get(key) || {
      app: displayApp,
      domain,
      duration_sec: 0,
      titles: new Set<string>(),
      urls: new Set<string>(),
    };
    b.duration_sec += s.duration_sec;
    if (s.title && app !== MISC_APP_LABEL) b.titles.add(s.title);
    if (s.url && app !== MISC_APP_LABEL) b.urls.add(s.url);
    buckets.set(key, b);
  }

  const tasks = db.prepare("SELECT task_id, title, web_urls FROM bitrix_tasks").all() as TaskRow[];

  const rules = db
    .prepare(`SELECT kind, pattern, task_id FROM match_rules`)
    .all() as Array<{ kind: string; pattern: string; task_id: number }>;

  const upsert = db.prepare(
    `INSERT INTO activity_matches (segment_group_key, day, domain, task_id, confidence, status, duration_sec)
     VALUES (@key, @day, @domain, @task_id, @confidence, 'pending', @duration)
     ON CONFLICT(segment_group_key) DO UPDATE SET
       duration_sec = excluded.duration_sec,
       domain = excluded.domain,
       task_id = CASE
         WHEN activity_matches.status IN ('confirmed','pushed','ignored') OR activity_matches.confidence = 'manual'
         THEN activity_matches.task_id ELSE excluded.task_id END,
       confidence = CASE
         WHEN activity_matches.status IN ('confirmed','pushed','ignored') OR activity_matches.confidence = 'manual'
         THEN activity_matches.confidence ELSE excluded.confidence END,
       status = CASE
         WHEN activity_matches.status IN ('confirmed','pushed','ignored') THEN activity_matches.status
         ELSE 'pending' END`
  );

  for (const [key, seg] of buckets) {
    let best: { task_id: number; confidence: MatchConfidence } = {
      task_id: 0,
      confidence: "none",
    };
    const project = projectFromApp(seg.app);

    // saved rules first
    for (const rule of rules) {
      if (rule.kind === "domain" && seg.domain) {
        const d = seg.domain.toLowerCase();
        const p = rule.pattern.toLowerCase();
        if (d === p || d.endsWith(`.${p}`) || d.includes(p)) {
          best = { task_id: rule.task_id, confidence: "suggested" };
          break;
        }
      }
      if (rule.kind === "project" && project) {
        if (project.toLowerCase() === rule.pattern.toLowerCase()) {
          best = { task_id: rule.task_id, confidence: "suggested" };
          break;
        }
      }
    }

    if (best.confidence === "none") {
      for (const t of tasks) {
        let webs: string[] = [];
        try {
          webs = JSON.parse(t.web_urls) as string[];
        } catch {
          webs = [];
        }
        let c = scoreDomain(seg.domain, webs);
        const byProj = scoreProject(project, t.title);
        if (CONF_RANK[byProj] > CONF_RANK[c]) c = byProj;
        if (CONF_RANK[c] > CONF_RANK[best.confidence]) {
          best = { task_id: t.task_id, confidence: c };
          if (c === "high") break;
        }
      }
    }
    // misc bucket never auto-matches to Bitrix tasks
    const confidence = seg.app === MISC_APP_LABEL ? ("none" as MatchConfidence) : best.confidence;
    const task_id = seg.app === MISC_APP_LABEL ? null : best.task_id || null;
    const splitOff = db
      .prepare(
        `SELECT COALESCE(SUM(duration_sec),0) as sec FROM activity_matches
         WHERE day = ? AND segment_group_key LIKE ?`
      )
      .get(day, `${key}|split:%`) as { sec: number };
    const duration = Math.max(0, seg.duration_sec - (splitOff.sec || 0));
    if (duration <= 0 && splitOff.sec > 0) {
      // all time moved to splits — keep row only if already assigned/pushed
      const existing = db
        .prepare(`SELECT status FROM activity_matches WHERE segment_group_key = ?`)
        .get(key) as { status: string } | undefined;
      if (!existing || !["confirmed", "pushed", "ignored"].includes(existing.status)) {
        db.prepare(`DELETE FROM activity_matches WHERE segment_group_key = ?`).run(key);
        continue;
      }
    }
    upsert.run({
      key,
      day,
      domain: seg.domain,
      task_id,
      confidence,
      duration: duration > 0 ? duration : seg.duration_sec,
    });
  }

  // remove stale group keys for this day (keep pushed / ignored / splits)
  const keep = new Set(buckets.keys());
  const old = db
    .prepare(`SELECT segment_group_key, status FROM activity_matches WHERE day = ?`)
    .all(day) as Array<{ segment_group_key: string; status: string }>;
  const del = db.prepare(
    `DELETE FROM activity_matches WHERE segment_group_key = ? AND status NOT IN ('pushed','ignored') AND segment_group_key NOT LIKE '%|split:%'`
  );
  for (const row of old) {
    if (keep.has(row.segment_group_key)) continue;
    if (row.segment_group_key.includes("|split:")) continue;
    del.run(row.segment_group_key);
  }

  return listMatchGroups(day);
}

export function listMatchGroups(day = dayKey()): MatchGroup[] {
  const rows = db
    .prepare(
      `SELECT m.*, t.title as task_title
       FROM activity_matches m
       LEFT JOIN bitrix_tasks t ON t.task_id = m.task_id
       WHERE m.day = ?
       ORDER BY m.duration_sec DESC`
    )
    .all(day) as Array<{
    segment_group_key: string;
    day: string;
    domain: string | null;
    task_id: number | null;
    confidence: MatchConfidence;
    status: MatchGroup["status"];
    pushed_elapsed_id: number | null;
    duration_sec: number;
    task_title: string | null;
  }>;

  const { start, end } = dayBounds(day);
  const segs = db
    .prepare(
      `SELECT app, title, url, domain FROM activity_segments
       WHERE idle = 0 AND ts_start >= ? AND ts_start <= ?`
    )
    .all(start, end) as Array<{
    app: string;
    title: string | null;
    url: string | null;
    domain: string | null;
  }>;

  const meta = new Map<string, { app: string; titles: string[]; urls: string[] }>();
  for (const s of segs) {
    if (!isUsefulSegment(s) || isNoiseApp(s.app)) continue;
    const app = normalizeApp(s.app);
    if (isNoiseApp(app)) continue;
    const rawDomain = app === MISC_APP_LABEL ? null : s.domain;
    const { key } = bucketKey(day, app, rawDomain);
    const m = meta.get(key) || {
      app: projectFromApp(app) ? `Cursor · ${projectFromApp(app)}` : app,
      titles: [],
      urls: [],
    };
    if (s.title && app !== MISC_APP_LABEL && m.titles.length < 8 && !m.titles.includes(s.title)) {
      m.titles.push(s.title);
    }
    if (s.url && app !== MISC_APP_LABEL && m.urls.length < 8 && !m.urls.includes(s.url)) {
      m.urls.push(s.url);
    }
    meta.set(key, m);
  }

  return rows.map((r) => {
    const baseKey = r.segment_group_key.replace(/\|split:\d+$/, "");
    const part = baseKey.slice(day.length + 1);
    const fromKey = part.startsWith("app:") ? part.slice(4) : null;
    const hit = meta.get(baseKey) || meta.get(r.segment_group_key);
    return {
      group_key: r.segment_group_key,
      day: r.day,
      domain: r.domain,
      app: hit?.app ?? fromKey,
      duration_sec: r.duration_sec,
      titles: hit?.titles ?? [],
      urls: hit?.urls ?? [],
      task_id: r.task_id,
      task_title: r.task_title,
      confidence: r.confidence,
      status: r.status,
      pushed_elapsed_id: r.pushed_elapsed_id,
    };
  });
}

function saveRuleFromGroup(groupKeyValue: string, taskId: number) {
  const row = db
    .prepare(`SELECT domain FROM activity_matches WHERE segment_group_key = ?`)
    .get(groupKeyValue) as { domain: string | null } | undefined;
  const part = groupKeyValue.split("|").slice(1).join("|");
  const appPart = part.startsWith("app:") ? part.slice(4) : null;
  const project = appPart ? projectFromApp(appPart) : null;
  const now = new Date().toISOString();
  if (project) {
    db.prepare(
      `INSERT INTO match_rules (kind, pattern, task_id, created_at)
       VALUES ('project', ?, ?, ?)
       ON CONFLICT(kind, pattern) DO UPDATE SET task_id = excluded.task_id, created_at = excluded.created_at`
    ).run(project, taskId, now);
  } else if (row?.domain) {
    db.prepare(
      `INSERT INTO match_rules (kind, pattern, task_id, created_at)
       VALUES ('domain', ?, ?, ?)
       ON CONFLICT(kind, pattern) DO UPDATE SET task_id = excluded.task_id, created_at = excluded.created_at`
    ).run(baseDomain(row.domain) || row.domain, taskId, now);
  }
}

export function assignMatch(groupKeyValue: string, taskId: number | null, saveRule = true) {
  // confidence=manual even when cleared — rebuild must not re-auto-assign
  const status = taskId == null ? "pending" : "pending";
  db.prepare(
    `UPDATE activity_matches SET task_id = ?, confidence = 'manual',
     status = CASE WHEN status = 'pushed' THEN 'pushed' ELSE ? END
     WHERE segment_group_key = ?`
  ).run(taskId, status, groupKeyValue);
  if (taskId != null && saveRule) saveRuleFromGroup(groupKeyValue, taskId);
}

export function ignoreMatch(groupKeyValue: string) {
  db.prepare(
    `UPDATE activity_matches SET task_id = NULL, confidence = 'manual', status = 'ignored'
     WHERE segment_group_key = ? AND status != 'pushed'`
  ).run(groupKeyValue);
}

export function unignoreMatch(groupKeyValue: string) {
  db.prepare(
    `UPDATE activity_matches SET status = 'pending', confidence = 'manual'
     WHERE segment_group_key = ? AND status = 'ignored'`
  ).run(groupKeyValue);
}

/** Split seconds off a group into a new pending pool entry. */
export function splitMatch(groupKeyValue: string, seconds: number) {
  const row = db
    .prepare(`SELECT * FROM activity_matches WHERE segment_group_key = ?`)
    .get(groupKeyValue) as
    | {
        segment_group_key: string;
        day: string;
        domain: string | null;
        duration_sec: number;
        status: string;
      }
    | undefined;
  if (!row) throw new Error("group not found");
  if (row.status === "pushed") throw new Error("cannot split pushed group");
  const take = Math.max(1, Math.min(Math.round(seconds), row.duration_sec - 1));
  if (take >= row.duration_sec) throw new Error("split must leave remainder");
  const newKey = `${groupKeyValue}|split:${Date.now()}`;
  db.prepare(
    `UPDATE activity_matches SET duration_sec = duration_sec - ? WHERE segment_group_key = ?`
  ).run(take, groupKeyValue);
  db.prepare(
    `INSERT INTO activity_matches (segment_group_key, day, domain, task_id, confidence, status, duration_sec)
     VALUES (?, ?, ?, NULL, 'none', 'pending', ?)`
  ).run(newKey, row.day, row.domain, take);
  return newKey;
}

export function markConfirmed(groupKeys: string[]) {
  const stmt = db.prepare(
    `UPDATE activity_matches SET status = 'confirmed' WHERE segment_group_key = ? AND status != 'pushed' AND task_id IS NOT NULL`
  );
  const tx = db.transaction(() => {
    for (const k of groupKeys) stmt.run(k);
  });
  tx();
}

export function markPushed(groupKeyValue: string, elapsedId: number) {
  db.prepare(
    `UPDATE activity_matches SET status = 'pushed', pushed_elapsed_id = ? WHERE segment_group_key = ?`
  ).run(elapsedId, groupKeyValue);
}
