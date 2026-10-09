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
  status INTEGER NOT NULL DEFAULT 2,
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

/** Additive column migrations (SQLite has no IF NOT EXISTS for columns). */
function ensureColumn(table: string, column: string, defSql: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${defSql}`);
}
ensureColumn("bitrix_tasks", "status", "INTEGER NOT NULL DEFAULT 2");
ensureColumn("bitrix_tasks", "deadline", "TEXT");

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

/** One-shot: rewrite known misc app names in existing rows. */
export function migrateMiscApps(names: string[], label: string) {
  if (getMeta("misc_apps_v1")) return;
  const stmt = db.prepare(`UPDATE activity_segments SET app = ?, title = ? WHERE lower(app) = lower(?)`);
  const tx = db.transaction(() => {
    for (const n of names) stmt.run(label, label, n);
  });
  tx();
  setMeta("misc_apps_v1", "1");
}

/** Remove Unknown / newtab / chrome:// junk from history. */
export function purgeNoiseSegments() {
  if (getMeta("purge_noise_v2")) return;
  db.exec(`
    DELETE FROM activity_segments
    WHERE lower(app) = 'unknown'
       OR lower(coalesce(domain,'')) LIKE '%newtab%'
       OR lower(coalesce(domain,'')) IN ('(no url)', 'newtab', 'new-tab-page')
       OR lower(coalesce(url,'')) LIKE '%newtab%'
       OR lower(coalesce(url,'')) LIKE 'chrome://%'
       OR lower(coalesce(url,'')) LIKE 'edge://%'
       OR lower(coalesce(url,'')) LIKE 'brave://%'
       OR lower(coalesce(url,'')) LIKE 'about:%'
       OR lower(coalesce(url,'')) LIKE 'chrome-extension://%';
    DELETE FROM activity_matches
    WHERE segment_group_key LIKE '%app:Unknown%'
       OR lower(coalesce(domain,'')) LIKE '%newtab%'
       OR domain = '(no url)';
  `);
  setMeta("purge_noise_v2", "1");
}
