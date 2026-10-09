import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "tracker.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS activity_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_start TEXT NOT NULL,
  ts_end TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  app TEXT NOT NULL,
  title TEXT,
  url TEXT,
  domain TEXT,
  idle INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_segments_start ON activity_segments(ts_start);
CREATE INDEX IF NOT EXISTS idx_segments_domain ON activity_segments(domain);

CREATE TABLE IF NOT EXISTS bitrix_tasks (
  task_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  responsible_id INTEGER,
  deal_ids TEXT NOT NULL DEFAULT '[]',
  company_ids TEXT NOT NULL DEFAULT '[]',
  web_urls TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment_group_key TEXT NOT NULL UNIQUE,
  day TEXT NOT NULL,
  domain TEXT,
  task_id INTEGER,
  confidence TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'pending',
  pushed_elapsed_id INTEGER,
  duration_sec INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_matches_day ON activity_matches(day);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export function getMeta(key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string) {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}
