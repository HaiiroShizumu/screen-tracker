import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db.js";
import { domainFromUrl } from "./util.js";

const execFileAsync = promisify(execFile);

const IDLE_THRESHOLD = Number(process.env.IDLE_THRESHOLD_SEC || 60);
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_SEC || 5) * 1000;

type OpenState = {
  id: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  idle: boolean;
  ts_start: string;
};

let open: OpenState | null = null;
let timer: NodeJS.Timeout | null = null;

async function osa(script: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 4000,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getIdleSeconds(): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ioreg", ["-c", "IOHIDSystem", "-d", "4"], {
      timeout: 3000,
      maxBuffer: 2 * 1024 * 1024,
    });
    for (const line of stdout.split("\n")) {
      if (line.includes("HIDIdleTime")) {
        const ns = Number(line.split("=").pop()?.trim());
        if (!Number.isNaN(ns)) return ns / 1_000_000_000;
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

async function getFrontmostApp(): Promise<string> {
  const name = await osa(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  return name || "Unknown";
}

async function getBrowserTab(app: string): Promise<{ title: string | null; url: string | null }> {
  const chromeFamily = ["Google Chrome", "Chromium", "Brave Browser", "Microsoft Edge"];
  if (chromeFamily.includes(app)) {
    const raw = await osa(
      `tell application "${app}"\n` +
        "  repeat with w in windows\n" +
        "    if not minimized of w then\n" +
        '      return (title of active tab of w) & " | " & (URL of active tab of w)\n' +
        "    end if\n" +
        "  end repeat\n" +
        "end tell"
    );
    return splitTitleUrl(raw);
  }
  if (app === "Safari") {
    const raw = await osa(
      'tell application "Safari" to return (name of front document) & " | " & (URL of front document)'
    );
    return splitTitleUrl(raw);
  }
  if (app === "Arc") {
    const raw = await osa(
      'tell application "Arc" to return (title of active tab of front window) & " | " & (URL of active tab of front window)'
    );
    return splitTitleUrl(raw);
  }
  return { title: null, url: null };
}

function splitTitleUrl(raw: string | null): { title: string | null; url: string | null } {
  if (!raw) return { title: raw, url: null };
  const idx = raw.lastIndexOf(" | ");
  if (idx === -1) return { title: raw, url: null };
  return { title: raw.slice(0, idx).trim() || null, url: raw.slice(idx + 3).trim() || null };
}

function sameFocus(a: OpenState, b: Omit<OpenState, "ts_start" | "id">): boolean {
  return a.app === b.app && a.url === b.url && a.title === b.title && a.idle === b.idle;
}

function touchOpen(endIso: string) {
  if (!open) return;
  const start = new Date(open.ts_start).getTime();
  const end = new Date(endIso).getTime();
  const duration = Math.max(1, Math.round((end - start) / 1000));
  db.prepare(
    `UPDATE activity_segments SET ts_end = ?, duration_sec = ? WHERE id = ?`
  ).run(endIso, duration, open.id);
}

function insertOpen(state: Omit<OpenState, "id">): OpenState {
  const info = db
    .prepare(
      `INSERT INTO activity_segments (ts_start, ts_end, duration_sec, app, title, url, domain, idle)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`
    )
    .run(
      state.ts_start,
      state.ts_start,
      state.app,
      state.title,
      state.url,
      state.domain,
      state.idle ? 1 : 0
    );
  return { ...state, id: Number(info.lastInsertRowid) };
}

async function tick() {
  if (process.platform !== "darwin") return;

  const now = new Date().toISOString();
  const idleSec = await getIdleSeconds();
  const isIdle = idleSec >= IDLE_THRESHOLD;

  let app = "Idle";
  let title: string | null = null;
  let url: string | null = null;

  if (!isIdle) {
    app = await getFrontmostApp();
    const tab = await getBrowserTab(app);
    title = tab.title;
    url = tab.url;
  } else {
    title = `idle ${Math.round(idleSec)}s`;
  }

  const next = {
    app,
    title,
    url,
    domain: domainFromUrl(url),
    idle: isIdle,
  };

  if (!open) {
    open = insertOpen({ ...next, ts_start: now });
    return;
  }
  if (sameFocus(open, next)) {
    touchOpen(now);
    return;
  }

  touchOpen(now);
  open = insertOpen({ ...next, ts_start: now });
}

export function startCollector() {
  if (timer) return;
  if (process.platform !== "darwin") {
    console.warn("[collector] macOS only — skipped");
    return;
  }
  console.log(`[collector] idle≥${IDLE_THRESHOLD}s poll=${POLL_INTERVAL / 1000}s`);
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL);
}

export function stopCollector() {
  if (timer) clearInterval(timer);
  timer = null;
  if (open) touchOpen(new Date().toISOString());
  open = null;
}
