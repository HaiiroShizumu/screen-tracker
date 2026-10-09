import { Router } from "express";
import { db, getMeta, setMeta } from "./db.js";
import { syncBitrixTasks, listCachedTasks, addElapsed } from "./bitrix.js";
import {
  rebuildMatches,
  listMatchGroups,
  assignMatch,
  markConfirmed,
  markPushed,
  ignoreMatch,
  unignoreMatch,
  splitMatch,
} from "./matcher.js";
import { overview } from "./stats.js";
import { writeDailyReport, buildMarkdown } from "./reports.js";
import { dayBounds, dayKey } from "./util.js";
import type { RangePreset } from "./stats.js";
import { getPermissionStatus } from "./permissions.js";
import { normalizeApp } from "./misc-apps.js";
import { isNoiseApp } from "./noise.js";

export const router = Router();

function roundSeconds(sec: number, roundToMin: number | undefined): number {
  if (!roundToMin || roundToMin <= 0) return Math.max(60, Math.round(sec));
  const step = roundToMin * 60;
  return Math.max(step, Math.round(sec / step) * step);
}

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

function readAiSettings() {
  const base_url =
    getMeta("ai_base_url") || process.env.XIAOMI_BASE_URL?.replace(/\/?$/, "") || "";
  const api_key = getMeta("ai_api_key") || process.env.XIAOMI_API_KEY || "";
  const model = getMeta("ai_model") || process.env.XIAOMI_MODEL || "mimo-v2.6-flash";
  return { base_url, api_key, model };
}

router.get("/settings", (_req, res) => {
  const ai = readAiSettings();
  res.json({
    ai: {
      base_url: ai.base_url,
      model: ai.model,
      has_key: Boolean(ai.api_key),
    },
  });
});

router.put("/settings", (req, res) => {
  const ai = req.body?.ai || {};
  if (typeof ai.base_url === "string") {
    setMeta("ai_base_url", ai.base_url.trim().replace(/\/?$/, ""));
  }
  if (typeof ai.model === "string") {
    setMeta("ai_model", ai.model.trim());
  }
  if (typeof ai.api_key === "string" && ai.api_key.trim()) {
    setMeta("ai_api_key", ai.api_key.trim());
  }
  const next = readAiSettings();
  res.json({
    ai: {
      base_url: next.base_url,
      model: next.model,
      has_key: Boolean(next.api_key),
    },
  });
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
  const { group_key, task_id, save_rule } = req.body as {
    group_key: string;
    task_id: number | null;
    save_rule?: boolean;
  };
  if (!group_key) return res.status(400).json({ error: "group_key required" });
  assignMatch(group_key, task_id ?? null, save_rule !== false);
  const day = group_key.split("|")[0] || dayKey();
  res.json({ ok: true, groups: listMatchGroups(day) });
});

router.post("/matches/ignore", (req, res) => {
  const { group_key } = req.body as { group_key: string };
  if (!group_key) return res.status(400).json({ error: "group_key required" });
  ignoreMatch(group_key);
  const day = group_key.split("|")[0] || dayKey();
  res.json({ ok: true, groups: listMatchGroups(day) });
});

router.post("/matches/unignore", (req, res) => {
  const { group_key } = req.body as { group_key: string };
  if (!group_key) return res.status(400).json({ error: "group_key required" });
  unignoreMatch(group_key);
  const day = group_key.split("|")[0] || dayKey();
  res.json({ ok: true, groups: listMatchGroups(day) });
});

router.post("/matches/split", (req, res) => {
  try {
    const { group_key, seconds } = req.body as { group_key: string; seconds: number };
    if (!group_key || !seconds) return res.status(400).json({ error: "group_key and seconds required" });
    splitMatch(group_key, Number(seconds));
    const day = group_key.split("|")[0] || dayKey();
    res.json({ ok: true, groups: listMatchGroups(day) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/matches/confirm", async (req, res) => {
  try {
    const body = req.body as {
      group_keys?: string[];
      push?: boolean;
      day?: string;
      round_to?: number;
      comments?: Record<string, string>;
    };
    const day = body.day || dayKey();
    let keys = body.group_keys;
    if (!keys?.length) {
      keys = listMatchGroups(day)
        .filter((g) => g.task_id && g.status !== "pushed" && g.status !== "ignored")
        .map((g) => g.group_key);
    }
    markConfirmed(keys);

    const pushed: Array<{ group_key: string; elapsed_id: number }> = [];
    if (body.push !== false) {
      const groups = listMatchGroups(day).filter(
        (g) =>
          keys!.includes(g.group_key) &&
          g.task_id &&
          g.status !== "pushed" &&
          g.status !== "ignored"
      );
      for (const g of groups) {
        const comment =
          body.comments?.[g.group_key] ||
          `${g.domain || g.app || "activity"} — ${g.titles[0] || ""}`.trim();
        const sec = roundSeconds(g.duration_sec, body.round_to);
        const elapsedId = await addElapsed(g.task_id!, sec, comment);
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
