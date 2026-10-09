import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function osa(script: string) {
  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
    return true;
  } catch (e) {
    const msg = String((e as { stderr?: string })?.stderr || e);
    if (/[-]1728|[-]600|isn.t running|не запущен|can’t find/i.test(msg)) return true; // app absent
    return false;
  }
}

export async function getPermissionStatus() {
  if (process.platform !== "darwin") {
    return { ok: true, platform: process.platform, missing: [] as string[] };
  }
  const checks: Array<{ name: string; ok: Promise<boolean> }> = [
    {
      name: "System Events",
      ok: osa(
        'tell application "System Events" to get name of first application process whose frontmost is true'
      ),
    },
    {
      name: "Google Chrome",
      ok: osa('tell application "Google Chrome" to get title of active tab of front window'),
    },
    {
      name: "Safari",
      ok: osa('tell application "Safari" to get name of front document'),
    },
    {
      name: "Arc",
      ok: osa('tell application "Arc" to get title of active tab of front window'),
    },
  ];
  const missing: string[] = [];
  for (const c of checks) {
    if (!(await c.ok)) missing.push(c.name);
  }
  return {
    ok: missing.length === 0,
    platform: "darwin",
    missing,
    hint: "Системные настройки → Конфиденциальность → Автоматизация",
  };
}
