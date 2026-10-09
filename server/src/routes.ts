import { Router } from "express";
import { db, getMeta } from "./db.js";
import { syncBitrixTasks, listCachedTasks, addElapsed } from "./bitrix.js";
import {
  rebuildMatches,
  listMatchGroups,
  assignMatch,
  markConfirmed,
  markPushed,
} from "./matcher.js";
import { overview } from "./stats.js";
import { writeDailyReport, buildMarkdown } from "./reports.js";
import { dayBounds, dayKey } from "./util.js";
import type { RangePreset } from "./stats.js";
import { getPermissionStatus } from "./permissions.js";
import { normalizeApp } from "./misc-apps.js";
import { isNoiseApp, isUsefulSegment } from "./noise.js";

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, synced_at: getMeta("bitrix_synced_at") });
});

router.get("/permissions", async (_req, res) => {
  try {
    res.json(await getPermissionStatus());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/activity", (req, res) => {
  const day = String(req.query.day || dayKey());
  const { start, end } = dayBounds(day);
  const rows = db
    .prepare(`SELECT * FROM activity_segments WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start`)
    .all(start, end);
  res.json({ day, segments: rows });
});

/** Last N hours for menu-bar tray: apps + minute sparkline */
router.get("/tray", (req, res) => {
  const hours = Math.min(12, Math.max(1, Number(req.query.hours) || 1));
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const byAppRaw = db
    .prepare(
      `SELECT app as name, SUM(duration_sec) as seconds
       FROM activity_segments
       WHERE idle = 0 AND ts_end >= ? AND ts_start <= ?
       GROUP BY app
       ORDER BY seconds DESC`
    )
    .all(startIso, endIso) as Array<{ name: string; seconds: number }>;
  const collapsed = new Map<string, number>();
  for (const r of byAppRaw) {
    if (isNoiseApp(r.name)) continue;
    const name = normalizeApp(r.name);
    if (isNoiseApp(name)) continue;
    collapsed.set(name, (collapsed.get(name) || 0) + r.seconds);
  }
  const byApp = [...collapsed.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);

  const segments = db
    .prepare(
      `SELECT ts_start, ts_end, duration_sec
       FROM activity_segments
       WHERE idle = 0 AND ts_end >= ? AND ts_start <= ?
       ORDER BY ts_start`
    )
    .all(startIso, endIso) as Array<{ ts_start: string; ts_end: string; duration_sec: number }>;

  const buckets = Array.from({ length: 12 }, () => 0);
  const span = end.getTime() - start.getTime();
  for (const s of segments) {
    const mid = (new Date(s.ts_start).getTime() + new Date(s.ts_end).getTime()) / 2;
    const idx = Math.min(11, Math.max(0, Math.floor(((mid - start.getTime()) / span) * 12)));
    buckets[idx] += s.duration_sec;
  }
  const max = Math.max(1, ...buckets);
  const spark = buckets.map((v) => Math.round((v / max) * 7));

  const totalSec = byApp.reduce((a, b) => a + b.seconds, 0);
  res.json({
    hours,
    total_sec: totalSec,
    apps: byApp,
    spark,
  });
});

router.get("/overview", (req, res) => {
  const preset = (String(req.query.range || "day") as RangePreset) || "day";
  const day = req.query.day ? String(req.query.day) : undefined;
  res.json(overview(preset, day));
});

router.get("/tasks", (_req, res) => {
  res.json({ tasks: listCachedTasks() });
});

router.post("/bitrix/sync", async (_req, res) => {
  try {
    const result = await syncBitrixTasks();
    const day = dayKey();
    rebuildMatches(day);
    res.json({ ...result, matches: listMatchGroups(day) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.get("/matches", (req, res) => {
  const day = String(req.query.day || dayKey());
  rebuildMatches(day);
  res.json({ day, groups: listMatchGroups(day) });
});

router.post("/matches/assign", (req, res) => {
  const { group_key, task_id } = req.body as { group_key: string; task_id: number | null };
  if (!group_key) return res.status(400).json({ error: "group_key required" });
  assignMatch(group_key, task_id ?? null);
  const day = group_key.split("|")[0] || dayKey();
  res.json({ ok: true, groups: listMatchGroups(day) });
});

router.post("/matches/confirm", async (req, res) => {
  try {
    const body = req.body as { group_keys?: string[]; push?: boolean; day?: string };
    const day = body.day || dayKey();
    let keys = body.group_keys;
    if (!keys?.length) {
      keys = listMatchGroups(day)
        .filter((g) => g.task_id && g.status !== "pushed")
        .map((g) => g.group_key);
    }
    markConfirmed(keys);

    const pushed: Array<{ group_key: string; elapsed_id: number }> = [];
    if (body.push !== false) {
      const groups = listMatchGroups(day).filter(
        (g) => keys!.includes(g.group_key) && g.task_id && g.status !== "pushed"
      );
      for (const g of groups) {
        const comment = `${g.domain || g.app || "activity"} — ${g.titles[0] || ""}`.trim();
        const elapsedId = await addElapsed(g.task_id!, g.duration_sec, comment);
        markPushed(g.group_key, elapsedId);
        pushed.push({ group_key: g.group_key, elapsed_id: elapsedId });
      }
    }
    res.json({ ok: true, pushed, groups: listMatchGroups(day) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/reports/generate", async (req, res) => {
  try {
    const day = String(req.body?.day || dayKey());
    const file = await writeDailyReport(day);
    res.json({ ok: true, file, preview: buildMarkdown(day) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
