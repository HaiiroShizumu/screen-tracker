import { db } from "./db.js";
import { companyFromHost, dayBounds, dayKey, domainFromUrl, rangeBounds } from "./util.js";
import { MISC_APP_LABEL, normalizeApp } from "./misc-apps.js";
import { isNoiseApp, isNoiseDomain, isUsefulSegment } from "./noise.js";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category } from "./categories.js";
import { focusMetrics, mergeSessions } from "./sessions.js";
export type RangePreset = "day" | "week" | "month";

function resolveCompany(domain: string | null, url: string | null): string | null {
  return companyFromHost(domain) || companyFromHost(domainFromUrl(url));
}

function collapseByApp(
  rows: { name: string; seconds: number }[]
): { name: string; seconds: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (isNoiseApp(r.name)) continue;
    const name = normalizeApp(r.name);
    if (isNoiseApp(name)) continue;
    map.set(name, (map.get(name) || 0) + r.seconds);
  }
  return [...map.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 12);
}

function activeSecForDay(day: string): number {
  const { start, end } = dayBounds(day);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(duration_sec),0) as sec
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?`
    )
    .get(start, end) as { sec: number };
  return row.sec;
}

function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function overview(preset: RangePreset, day?: string) {
  const anchor = day ? new Date(`${day}T12:00:00`) : new Date();
  const { start, end, day: dayOnly } = rangeBounds(preset, anchor);
  const dayRange = dayBounds(dayOnly);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN idle=0 THEN duration_sec ELSE 0 END),0) as active_sec,
         COALESCE(SUM(CASE WHEN idle=1 THEN duration_sec ELSE 0 END),0) as idle_sec
       FROM activity_segments
       WHERE ts_start >= ? AND ts_start <= ?`
    )
    .get(start, end) as { active_sec: number; idle_sec: number };

  const byAppRaw = db
    .prepare(
      `SELECT app as name, SUM(duration_sec) as seconds
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
         AND lower(app) != 'unknown'
       GROUP BY app ORDER BY seconds DESC`
    )
    .all(start, end) as { name: string; seconds: number }[];
  const byApp = collapseByApp(byAppRaw);

  const byDomainRaw = db
    .prepare(
      `SELECT domain as name, SUM(duration_sec) as seconds
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
         AND domain IS NOT NULL AND domain != ''
         AND lower(app) != 'unknown'
       GROUP BY domain ORDER BY seconds DESC`
    )
    .all(start, end) as { name: string; seconds: number }[];
  const byDomain = byDomainRaw.filter((r) => !isNoiseDomain(r.name)).slice(0, 12);

  // Bitrix24 portals → company slug (company.bitrix24.ru)
  const companyMap = new Map<string, number>();
  const companySegs = db
    .prepare(
      `SELECT domain, url, duration_sec
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
         AND lower(app) != 'unknown'`
    )
    .all(start, end) as Array<{ domain: string | null; url: string | null; duration_sec: number }>;
  for (const s of companySegs) {
    const c = resolveCompany(s.domain, s.url);
    if (!c) continue;
    companyMap.set(c, (companyMap.get(c) || 0) + s.duration_sec);
  }
  const byCompany = [...companyMap.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 12);

  const startDay = dayKey(new Date(start));
  const endDay = dayOnly;
  const byTask = db
    .prepare(
      `SELECT COALESCE(t.title, '(unassigned)') as name, SUM(m.duration_sec) as seconds
       FROM activity_matches m
       LEFT JOIN bitrix_tasks t ON t.task_id = m.task_id
       WHERE m.day >= ? AND m.day <= ?
         AND (m.domain IS NULL OR (
           lower(m.domain) NOT LIKE '%newtab%'
           AND m.domain != '(no url)'
         ))
         AND m.segment_group_key NOT LIKE '%app:Unknown%'
         AND m.status != 'ignored'
       GROUP BY COALESCE(t.title, '(unassigned)')
       ORDER BY seconds DESC LIMIT 12`
    )
    .all(startDay, endDay);

  const matched = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN task_id IS NOT NULL AND confidence != 'none' AND status != 'ignored' THEN duration_sec ELSE 0 END),0) as matched_sec,
         COALESCE(SUM(CASE WHEN status != 'ignored' THEN duration_sec ELSE 0 END),0) as total_sec
       FROM activity_matches WHERE day = ?
         AND segment_group_key NOT LIKE '%app:Unknown%'`
    )
    .get(dayOnly) as { matched_sec: number; total_sec: number };

  const topTask = (byTask[0] as { name: string; seconds: number } | undefined) || null;

  const rawTimeline = (
    db
      .prepare(
        `SELECT id, ts_start, ts_end, duration_sec, app, title, url, domain, idle
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
         AND lower(app) != 'unknown'
       ORDER BY ts_start`
      )
      .all(dayRange.start, dayRange.end) as Array<{
      id: number;
      ts_start: string;
      ts_end: string;
      duration_sec: number;
      app: string;
      title: string | null;
      url: string | null;
      domain: string | null;
      idle: number;
    }>
  )
    .filter((s) => isUsefulSegment(s))
    .map((s) => {
      const app = normalizeApp(s.app);
      return {
        ...s,
        app,
        title: app === MISC_APP_LABEL ? MISC_APP_LABEL : s.title,
        domain: isNoiseDomain(s.domain) ? null : s.domain,
      };
    });

  const sessions = mergeSessions(rawTimeline);
  const focus = focusMetrics(sessions);

  // byCategory from sessions (day view) or from range segments via sessions of range
  const catMap = new Map<Category, number>();
  for (const c of CATEGORY_ORDER) catMap.set(c, 0);
  for (const s of sessions) {
    catMap.set(s.category, (catMap.get(s.category) || 0) + s.duration_sec);
  }
  // For week/month, recompute categories from range segments
  if (preset !== "day") {
    for (const c of CATEGORY_ORDER) catMap.set(c, 0);
    const rangeRaw = (
      db
        .prepare(
          `SELECT id, ts_start, ts_end, duration_sec, app, title, url, domain, idle
         FROM activity_segments
         WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
           AND lower(app) != 'unknown'
         ORDER BY ts_start`
        )
        .all(start, end) as typeof rawTimeline
    )
      .filter((s) => isUsefulSegment(s))
      .map((s) => {
        const app = normalizeApp(s.app);
        return {
          ...s,
          app,
          title: app === MISC_APP_LABEL ? MISC_APP_LABEL : s.title,
          domain: isNoiseDomain(s.domain) ? null : s.domain,
        };
      });
    for (const s of mergeSessions(rangeRaw)) {
      catMap.set(s.category, (catMap.get(s.category) || 0) + s.duration_sec);
    }
  }

  const byCategory = CATEGORY_ORDER.map((id) => ({
    id,
    name: CATEGORY_LABELS[id],
    seconds: catMap.get(id) || 0,
  })).filter((r) => r.seconds > 0);

  // half-hour stacked buckets for selected day
  const emptyCats = (): Record<Category, number> => ({
    code: 0,
    research: 0,
    ai: 0,
    comms: 0,
    other: 0,
  });
  const halfMap = new Map<number, Record<Category, number>>();
  for (let m = 0; m < 24 * 60; m += 30) halfMap.set(m, emptyCats());
  for (const s of sessions) {
    const startM = new Date(s.ts_start);
    const endM = new Date(s.ts_end);
    let cursor = startM.getTime();
    const endMs = Math.max(cursor + 1000, endM.getTime());
    while (cursor < endMs) {
      const d = new Date(cursor);
      const mins = d.getHours() * 60 + (d.getMinutes() < 30 ? 0 : 30);
      const next = new Date(d);
      next.setSeconds(0, 0);
      next.setMinutes(d.getMinutes() < 30 ? 30 : 60);
      const sliceEnd = Math.min(endMs, next.getTime());
      const sec = Math.max(0, Math.round((sliceEnd - cursor) / 1000));
      halfMap.get(mins)![s.category] += sec;
      cursor = sliceEnd;
    }
  }

  // 09:00–18:00 inclusive, every 30 min
  const workSlots = Array.from({ length: 19 }, (_, i) => 9 * 60 + i * 30);
  const hourlyStacked = workSlots.map((mins) => {
    const b = halfMap.get(mins)!;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const row: Record<string, string | number> = {
      name: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      hour: h + m / 60,
    };
    for (const c of CATEGORY_ORDER) {
      row[c] = Math.round((b[c] / 60) * 10) / 10;
    }
    row.total = CATEGORY_ORDER.reduce((sum, c) => sum + (row[c] as number), 0);
    return row;
  });

  const sparkline = workSlots.map((mins) => {
    const b = halfMap.get(mins)!;
    return Math.round(CATEGORY_ORDER.reduce((s, c) => s + b[c], 0) / 60);
  });

  const matchPct =
    matched.total_sec > 0 ? Math.round((matched.matched_sec / matched.total_sec) * 100) : 0;

  const yesterday_active_sec = activeSecForDay(prevDay(dayOnly));
  const day_active = sessions.reduce((s, x) => s + x.duration_sec, 0);
  const vs_yesterday_pct =
    yesterday_active_sec > 0
      ? Math.round(((day_active - yesterday_active_sec) / yesterday_active_sec) * 100)
      : null;

  return {
    preset,
    day: dayOnly,
    start,
    end,
    kpi: {
      active_sec: totals.active_sec,
      idle_sec: totals.idle_sec,
      match_pct: matchPct,
      top_task: topTask?.name ?? null,
      top_task_sec: topTask?.seconds ?? 0,
      yesterday_active_sec,
      vs_yesterday_pct,
      switches_per_hour: focus.switches_per_hour,
      longest_session_sec: focus.longest_session_sec,
      session_count: sessions.length,
      sparkline,
    },
    byApp,
    byDomain,
    byCompany,
    byTask,
    byCategory,
    hourlyStacked,
    categories: CATEGORY_ORDER.map((id) => ({ id, name: CATEGORY_LABELS[id] })),
    timeline: sessions.map((s) => ({
      id: s.id,
      ts_start: s.ts_start,
      ts_end: s.ts_end,
      duration_sec: s.duration_sec,
      app: s.app,
      title: s.title,
      url: s.url,
      domain: s.domain,
      category: s.category,
      row_key: s.row_key,
      segment_count: s.segment_count,
    })),
  };
}
