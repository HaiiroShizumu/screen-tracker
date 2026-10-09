const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

async function osa(script) {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 5000,
      maxBuffer: 256 * 1024,
    });
    return { ok: true, out: stdout.trim() };
  } catch (e) {
    const msg = String(e?.stderr || e?.message || e);
    const denied = msg.includes("-1743") || /не\s*прав|not authorized|osascript is not allowed/i.test(msg);
    return { ok: false, denied, msg };
  }
}

/** Check Automation for browsers + System Events. */
async function checkMacPermissions() {
  const browsers = ["Google Chrome", "Safari", "Arc"];
  const results = {
    systemEvents: false,
    browsers: {},
    missing: [],
  };

  const se = await osa(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
  results.systemEvents = se.ok;
  if (!se.ok) results.missing.push("System Events");

  for (const b of browsers) {
    let r;
    if (b === "Safari") {
      r = await osa('tell application "Safari" to get name of front document');
    } else if (b === "Arc") {
      r = await osa('tell application "Arc" to get title of active tab of front window');
    } else {
      r = await osa(
        'tell application "Google Chrome" to get title of active tab of front window'
      );
    }
    // If app not installed, osascript may fail differently — treat as ok/skip
    const notInstalled =
      /can’t find process|Application isn.t running|не запущен|[-]1728|[-]600/i.test(r.msg || "");
    results.browsers[b] = r.ok || notInstalled;
    if (!r.ok && !notInstalled) results.missing.push(b);
  }

  results.ok = results.missing.length === 0;
  return results;
}

function openAutomationSettings() {
  const { shell } = require("electron");
  // macOS Ventura+ Privacy Automation pane
  return shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
  ).catch(() =>
    shell.openExternal("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension")
  );
}

module.exports = { checkMacPermissions, openAutomationSettings };
