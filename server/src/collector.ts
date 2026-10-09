import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db.js";
import { domainFromUrl } from "./util.js";
import { MISC_APP_LABEL, normalizeApp } from "./misc-apps.js";
import { getIdeProject } from "./editor-project.js";
import { isNoiseApp, isNoiseUrl, isUsefulSegment } from "./noise.js";

const execFileAsync = promisify(execFile);

const IDLE_THRESHOLD = Number(process.env.IDLE_THRESHOLD_SEC || 60);
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL_SEC || 5) * 1000;

const BUNDLE_APP: Record<string, string> = {
  "com.google.Chrome": "Google Chrome",
  "com.google.Chrome.canary": "Google Chrome",
  "company.thebrowser.Browser": "Arc",
  "com.apple.Safari": "Safari",
  "com.brave.Browser": "Brave Browser",
  "com.microsoft.edgemac": "Microsoft Edge",
  "com.apple.Terminal": "Terminal",
  "com.googlecode.iterm2": "iTerm",
  "com.todesktop.230313mzl4w4u92": "Cursor",
  "com.microsoft.VSCode": "Code",
  "com.apple.finder": "Finder",
  "com.tinyspeck.slackmacgap": "Slack",
  "com.figma.Desktop": "Figma",
  "ru.keepcoder.Telegram": "Telegram",
  "org.telegram.desktop": "Telegram",
};

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
let warnedBrowserPerm = false;

async function run(cmd: string, args: string[], timeout = 4000): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function osa(script: string): Promise<string | null> {
  return run("osascript", ["-e", script]);
}

async function getIdleSeconds(): Promise<number> {
  const stdout = await run("ioreg", ["-c", "IOHIDSystem", "-d", "4"], 3000);
  if (!stdout) return 0;
  for (const line of stdout.split("\n")) {
    if (line.includes("HIDIdleTime")) {
      const ns = Number(line.split("=").pop()?.trim());
      if (!Number.isNaN(ns)) return ns / 1_000_000_000;
    }
  }
  return 0;
}

/** No Automation permission needed — unlike System Events. */
async function getFrontmostViaLsappinfo(): Promise<{ app: string; bundleId: string | null } | null> {
  const front = await run("lsappinfo", ["front"]);
  if (!front) return null;
  const info = await run("lsappinfo", ["info", front]);
  if (!info) return null;

  const nameMatch = info.match(/^"([^"]+)"/m);
  const bundleMatch = info.match(/bundleID="([^"]+)"/);
  const bundleId = bundleMatch?.[1] ?? null;
  let app = nameMatch?.[1] || null;
  if (bundleId && BUNDLE_APP[bundleId]) app = BUNDLE_APP[bundleId];
  if (!app) return null;
  return { app, bundleId };
}

async function getFrontmostApp(): Promise<{ app: string; bundleId: string | null }> {
  const viaLs = await getFrontmostViaLsappinfo();
  if (viaLs) return viaLs;

  // fallback: System Events (needs Automation)
  const name = await osa(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  if (name) return { app: name, bundleId: null };

  return { app: "Unknown", bundleId: null };
}

function browserTarget(app: string, bundleId: string | null): string | null {
  if (bundleId && BUNDLE_APP[bundleId] && ["Google Chrome", "Safari", "Arc", "Brave Browser", "Microsoft Edge"].includes(BUNDLE_APP[bundleId])) {
    return BUNDLE_APP[bundleId];
  }
  const chromeFamily = ["Google Chrome", "Chromium", "Brave Browser", "Microsoft Edge", "Arc", "Safari"];
  if (chromeFamily.includes(app)) return app;
  return null;
}

async function getBrowserTab(
  app: string,
  bundleId: string | null
): Promise<{ title: string | null; url: string | null }> {
  const target = browserTarget(app, bundleId);
  if (!target) return { title: null, url: null };

  let raw: string | null = null;
  if (target === "Safari") {
    raw = await osa(
      'tell application "Safari" to return (name of front document) & " | " & (URL of front document)'
    );
  } else if (target === "Arc") {
    raw = await osa(
      'tell application "Arc" to return (title of active tab of front window) & " | " & (URL of active tab of front window)'
    );
  } else {
    raw = await osa(
      `tell application "${target}"\n` +
        "  repeat with w in windows\n" +
        "    if not minimized of w then\n" +
        '      return (title of active tab of w) & " | " & (URL of active tab of w)\n' +
        "    end if\n" +
        "  end repeat\n" +
        "end tell"
    );
  }

  if (!raw && !warnedBrowserPerm) {
    warnedBrowserPerm = true;
    console.warn(
      `[collector] не удалось прочитать URL ${target}. ` +
        `Системные настройки → Конфиденциальность → Автоматизация: разреши Node/Terminal/Electron управлять «${target}».`
    );
  }
  return splitTitleUrl(raw);
}

function splitTitleUrl(raw: string | null): { title: string | null; url: string | null } {
  if (!raw) return { title: null, url: null };
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
  db.prepare(`UPDATE activity_segments SET ts_end = ?, duration_sec = ? WHERE id = ?`).run(
    endIso,
    duration,
    open.id
  );
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
  let bundleId: string | null = null;

  if (!isIdle) {
    const front = await getFrontmostApp();
    bundleId = front.bundleId;
    app = normalizeApp(front.app, bundleId);

    const ide = getIdeProject(front.app, bundleId);
    if (ide) {
      // separate chart/match buckets per project
      app = `${ide.editor} · ${ide.name}`;
      title = ide.name;
      url = ide.folderUri;
    } else if (app !== MISC_APP_LABEL) {
      const tab = await getBrowserTab(front.app, bundleId);
      title = tab.title;
      url = tab.url;
    }
  } else {
    title = `idle ${Math.round(idleSec)}s`;
  }

  const domain =
    url && (url.startsWith("file:") || url.startsWith("vscode-remote:"))
      ? null
      : domainFromUrl(url);

  const next = {
    app,
    title,
    url,
    domain,
    idle: isIdle,
  };

  // Don't pollute DB with Unknown / newtab / empty browser tabs
  const skip =
    !isIdle &&
    (isNoiseApp(app) ||
      isNoiseUrl(url) ||
      !isUsefulSegment({ app, domain, url, idle: false }));

  if (skip) {
    if (open) {
      touchOpen(now);
      open = null;
    }
    return;
  }

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
  console.log(`[collector] idle≥${IDLE_THRESHOLD}s poll=${POLL_INTERVAL / 1000}s (lsappinfo)`);
  void tick();
  timer = setInterval(() => void tick(), POLL_INTERVAL);
}

export function stopCollector() {
  if (timer) clearInterval(timer);
  timer = null;
  if (open) touchOpen(new Date().toISOString());
  open = null;
}
