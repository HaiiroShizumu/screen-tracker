import { db } from "./db.js";
import { dayBounds, dayKey, rangeBounds } from "./util.js";
import { MISC_APP_LABEL, normalizeApp } from "./misc-apps.js";
import { isNoiseApp, isNoiseDomain, isUsefulSegment } from "./noise.js";
export type RangePreset = "day" | "week" | "month";

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
  const byDomain = byDomainRaw
    .filter((r) => !isNoiseDomain(r.name))
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
       GROUP BY COALESCE(t.title, '(unassigned)')
       ORDER BY seconds DESC LIMIT 12`
    )
    .all(startDay, endDay);

  const matched = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN task_id IS NOT NULL AND confidence != 'none' THEN duration_sec ELSE 0 END),0) as matched_sec,
         COALESCE(SUM(duration_sec),0) as total_sec
       FROM activity_matches WHERE day = ?
         AND segment_group_key NOT LIKE '%app:Unknown%'`
    )
    .get(dayOnly) as { matched_sec: number; total_sec: number };

  const topTask = (byTask[0] as { name: string; seconds: number } | undefined) || null;

  const timeline = (
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

  const matchPct =
    matched.total_sec > 0 ? Math.round((matched.matched_sec / matched.total_sec) * 100) : 0;

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
    },
    byApp,
    byDomain,
    byTask,
    timeline,
  };
}
