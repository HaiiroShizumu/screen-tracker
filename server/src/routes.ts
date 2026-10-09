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

export const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, synced_at: getMeta("bitrix_synced_at") });
});

router.get("/activity", (req, res) => {
  const day = String(req.query.day || dayKey());
  const { start, end } = dayBounds(day);
  const rows = db
    .prepare(`SELECT * FROM activity_segments WHERE ts_start >= ? AND ts_start <= ? ORDER BY ts_start`)
    .all(start, end);
  res.json({ day, segments: rows });
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
  res.json({ ok: true, groups: listMatchGroups(dayKey()) });
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
