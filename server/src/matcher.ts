import { db } from "./db.js";
import { baseDomain, dayBounds, dayKey, groupKey } from "./util.js";
export type MatchConfidence = "high" | "suggested" | "manual" | "none";
export type MatchStatus = "pending" | "confirmed" | "pushed";
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

function scoreDomain(domain: string | null, webs: string[]): MatchConfidence {
  if (!domain || webs.length === 0) return "none";
  const d = domain.toLowerCase();
  const b = baseDomain(d);
  for (const w of webs) {
    if (w === d) return "high";
  }
  for (const w of webs) {
    if (b && (w === b || baseDomain(w) === b)) return "suggested";
  }
  return "none";
}

/** Rebuild pending matches for a day from non-idle segments. Keeps confirmed/pushed. */
export function rebuildMatches(day = dayKey()): MatchGroup[] {
  const { start, end } = dayBounds(day);
  const segments = db
    .prepare(
      `SELECT app, title, url, domain, SUM(duration_sec) as duration_sec,
              GROUP_CONCAT(DISTINCT title) as titles,
              GROUP_CONCAT(DISTINCT url) as urls
       FROM activity_segments
       WHERE idle = 0 AND ts_start >= ? AND ts_start <= ?
       GROUP BY COALESCE(domain, 'app:' || app)`
    )
    .all(start, end) as Array<{
    app: string;
    title: string | null;
    url: string | null;
    domain: string | null;
    duration_sec: number;
    titles: string | null;
    urls: string | null;
  }>;

  const tasks = db.prepare("SELECT task_id, title, web_urls FROM bitrix_tasks").all() as TaskRow[];

  const upsert = db.prepare(
    `INSERT INTO activity_matches (segment_group_key, day, domain, task_id, confidence, status, duration_sec)
     VALUES (@key, @day, @domain, @task_id, @confidence, 'pending', @duration)
     ON CONFLICT(segment_group_key) DO UPDATE SET
       duration_sec = excluded.duration_sec,
       domain = excluded.domain,
       task_id = CASE WHEN activity_matches.status IN ('confirmed','pushed') THEN activity_matches.task_id ELSE excluded.task_id END,
       confidence = CASE WHEN activity_matches.status IN ('confirmed','pushed') THEN activity_matches.confidence ELSE excluded.confidence END`
  );

  for (const seg of segments) {
    const key = groupKey(day, seg.domain, seg.app);
    let best: { task_id: number; confidence: MatchConfidence } = {
      task_id: 0,
      confidence: "none",
    };
    for (const t of tasks) {
      let webs: string[] = [];
      try {
        webs = JSON.parse(t.web_urls) as string[];
      } catch {
        webs = [];
      }
      const c = scoreDomain(seg.domain, webs);
      if (c === "high") {
        best = { task_id: t.task_id, confidence: "high" };
        break;
      }
      if (c === "suggested" && best.confidence !== "high") {
        best = { task_id: t.task_id, confidence: "suggested" };
      }
    }
    upsert.run({
      key,
      day,
      domain: seg.domain,
      task_id: best.task_id || null,
      confidence: best.confidence,
      duration: seg.duration_sec,
    });
  }

  return listMatchGroups(day);
}

export function listMatchGroups(day = dayKey()): MatchGroup[] {
  const rows = db
    .prepare(
      `SELECT m.*, t.title as task_title,
              (SELECT app FROM activity_segments s
               WHERE s.idle = 0 AND s.ts_start >= datetime(m.day || 'T00:00:00')
                 AND COALESCE(s.domain, 'app:' || s.app) = COALESCE(m.domain, REPLACE(m.segment_group_key, m.day || '|', ''))
               LIMIT 1) as app
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
    app: string | null;
  }>;

  return rows.map((r) => {
    const domainOrApp = r.domain ?? r.segment_group_key.split("|")[1] ?? null;
    const { start, end } = dayBounds(day);
    const titlesUrls = db
      .prepare(
        `SELECT GROUP_CONCAT(DISTINCT title) as titles, GROUP_CONCAT(DISTINCT url) as urls
         FROM activity_segments
         WHERE idle = 0 AND ts_start >= ? AND ts_start <= ?
           AND (domain = ? OR (? IS NULL AND domain IS NULL AND ('app:' || app) = ?))`
      )
      .get(start, end, r.domain, r.domain, domainOrApp) as {
      titles: string | null;
      urls: string | null;
    };

    return {
      group_key: r.segment_group_key,
      day: r.day,
      domain: r.domain,
      app: r.app,
      duration_sec: r.duration_sec,
      titles: (titlesUrls?.titles || "").split(",").filter(Boolean).slice(0, 8),
      urls: (titlesUrls?.urls || "").split(",").filter(Boolean).slice(0, 8),
      task_id: r.task_id,
      task_title: r.task_title,
      confidence: r.confidence,
      status: r.status,
      pushed_elapsed_id: r.pushed_elapsed_id,
    };
  });
}

export function assignMatch(groupKeyValue: string, taskId: number | null) {
  db.prepare(
    `UPDATE activity_matches SET task_id = ?, confidence = CASE WHEN ? IS NULL THEN 'none' ELSE 'manual' END,
     status = CASE WHEN status = 'pushed' THEN 'pushed' ELSE 'pending' END
     WHERE segment_group_key = ?`
  ).run(taskId, taskId, groupKeyValue);
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
