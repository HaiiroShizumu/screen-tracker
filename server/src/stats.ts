import { db } from "./db.js";
import { dayBounds, dayKey, rangeBounds } from "./util.js";
export type RangePreset = "day" | "week" | "month";

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

  const byApp = db
    .prepare(
      `SELECT app as name, SUM(duration_sec) as seconds
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
       GROUP BY app ORDER BY seconds DESC LIMIT 12`
    )
    .all(start, end);

  const byDomain = db
    .prepare(
      `SELECT COALESCE(domain, '(no url)') as name, SUM(duration_sec) as seconds
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
       GROUP BY COALESCE(domain, '(no url)') ORDER BY seconds DESC LIMIT 12`
    )
    .all(start, end);

  const startDay = dayKey(new Date(start));
  const endDay = dayOnly;
  const byTask = db
    .prepare(
      `SELECT COALESCE(t.title, '(unassigned)') as name, SUM(m.duration_sec) as seconds
       FROM activity_matches m
       LEFT JOIN bitrix_tasks t ON t.task_id = m.task_id
       WHERE m.day >= ? AND m.day <= ?
       GROUP BY COALESCE(t.title, '(unassigned)')
       ORDER BY seconds DESC LIMIT 12`
    )
    .all(startDay, endDay);

  const matched = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN task_id IS NOT NULL AND confidence != 'none' THEN duration_sec ELSE 0 END),0) as matched_sec,
         COALESCE(SUM(duration_sec),0) as total_sec
       FROM activity_matches WHERE day = ?`
    )
    .get(dayOnly) as { matched_sec: number; total_sec: number };

  const topTask = (byTask[0] as { name: string; seconds: number } | undefined) || null;

  const timeline = db
    .prepare(
      `SELECT id, ts_start, ts_end, duration_sec, app, title, url, domain, idle
       FROM activity_segments
       WHERE idle=0 AND ts_start >= ? AND ts_start <= ?
       ORDER BY ts_start`
    )
    .all(dayRange.start, dayRange.end);

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
