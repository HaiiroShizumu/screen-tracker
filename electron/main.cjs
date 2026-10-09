const { app, BrowserWindow, shell, dialog, Notification, Tray, Menu, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { checkMacPermissions, openAutomationSettings } = require("./permissions.cjs");
const { monitorIcon, fmtMin } = require("./tray-chart.cjs");

const PORT = process.env.PORT || 3847;
const REMIND_MS = 4 * 60 * 60 * 1000;
const TRAY_MS = 30_000;

let serverProc = null;
let mainWindow = null;
let tray = null;
let remindTimer = null;
let trayTimer = null;
let lastPermDialogAt = 0;

function serverEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server", "dist", "index.js");
  }
  return path.join(__dirname, "..", "server", "src", "index.ts");
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    ELECTRON_RUN: "1",
  };
  if (app.isPackaged) {
    const entry = serverEntry();
    const cwd = path.join(process.resourcesPath, "server");
    serverProc = spawn(process.execPath, [entry], {
      cwd,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "inherit",
    });
  } else {
    serverProc = spawn("npx", ["tsx", "src/index.ts"], {
      cwd: path.join(__dirname, "..", "server"),
      env,
      stdio: "inherit",
      shell: true,
    });
  }
}

function enableOpenAtLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      name: "Screen Tracker",
      path: process.execPath,
      args: app.isPackaged ? [] : [path.join(__dirname, "main.cjs")],
    });
    console.log("[electron] openAtLogin enabled", app.getLoginItemSettings());
  } catch (e) {
    console.warn("[electron] setLoginItemSettings failed", e);
  }
}

function showMainWindow() {
  if (!mainWindow) createWindow();
  else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Screen Tracker",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => {
    void openAutomationSettings();
    showMainWindow();
  });
  n.show();
}

async function remindPermissions(forceDialog = false) {
  if (process.platform !== "darwin") return;
  const status = await checkMacPermissions();
  if (status.ok) {
    if (remindTimer) {
      clearInterval(remindTimer);
      remindTimer = null;
    }
    return status;
  }

  const list = status.missing.join(", ");
  notify(
    "Screen Tracker: нужны права",
    `Разреши Автоматизацию для: ${list}. Без этого не пишутся URL сайтов.`
  );

  const now = Date.now();
  const showDialog = forceDialog || now - lastPermDialogAt > 20 * 60 * 60 * 1000;
  if (showDialog && (!mainWindow || !mainWindow.isDestroyed())) {
    lastPermDialogAt = now;
    const { response } = await dialog.showMessageBox(mainWindow || undefined, {
      type: "info",
      title: "Права macOS",
      message: "Screen Tracker нужен доступ к браузеру и System Events",
      detail:
        `Сейчас не хватает: ${list}.\n\n` +
        "Системные настройки → Конфиденциальность и безопасность → Автоматизация\n" +
        "Включи галочки для Screen Tracker (или Electron/Terminal) → Google Chrome / Safari / Arc / System Events.\n\n" +
        "Также включён автозапуск при входе в систему.",
      buttons: ["Открыть настройки", "Позже"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) void openAutomationSettings();
  }
  return status;
}

async function fetchTray() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/tray?hours=1`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildTrayMenu(data) {
  const items = [];

  if (data) {
    items.push({
      label: `Последний час · ${fmtMin(data.total_sec || 0)}`,
      enabled: false,
    });
    items.push({ type: "separator" });

    const apps = data.apps || [];
    if (apps.length === 0) {
      items.push({ label: "Пока нет активности", enabled: false });
    } else {
      items.push({ label: "Приложения", enabled: false });
      for (const a of apps) {
        const name = String(a.name || "?").slice(0, 36);
        items.push({
          label: `${name}    ${fmtMin(a.seconds)}`,
          click: () => showMainWindow(),
        });
      }
    }
    items.push({ type: "separator" });
  } else {
    items.push({ label: "Сервер ещё запускается…", enabled: false });
    items.push({ type: "separator" });
  }

  items.push({ label: "Открыть дашборд", click: () => showMainWindow() });
  items.push({
    label: "Проверить права…",
    click: () => void remindPermissions(true),
  });
  items.push({
    label: "Автоматизация (Настройки)",
    click: () => void openAutomationSettings(),
  });
  items.push({ type: "separator" });
  items.push({
    label: "Выйти",
    click: () => {
      if (serverProc) serverProc.kill();
      app.quit();
    },
  });

  return Menu.buildFromTemplate(items);
}

async function refreshTray() {
  if (!tray) return;
  const data = await fetchTray();
  try {
    tray.setImage(monitorIcon());
  } catch (e) {
    console.warn("[tray] setImage", e);
  }
  if (process.platform === "darwin") {
    tray.setTitle("");
  }
  const tipApps = (data?.apps || [])
    .slice(0, 3)
    .map((a) => `${a.name}: ${fmtMin(a.seconds)}`)
    .join("\n");
  tray.setToolTip(
    data
      ? `Screen Tracker — час: ${fmtMin(data.total_sec || 0)}\n${tipApps || "нет данных"}`
      : "Screen Tracker"
  );
  tray.setContextMenu(buildTrayMenu(data));
}

function setupTray() {
  const fallback = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH+aAAAAAElFTkSuQmCC"
  );
  tray = new Tray(monitorIcon() || fallback);
  tray.setToolTip("Screen Tracker");
  tray.on("click", () => showMainWindow());
  tray.setContextMenu(buildTrayMenu(null));
  void refreshTray();
  trayTimer = setInterval(() => void refreshTray(), TRAY_MS);
}

app.whenReady().then(async () => {
  enableOpenAtLogin();
  startServer();
  setupTray();
  setTimeout(createWindow, 1200);
  setTimeout(() => void remindPermissions(true), 2500);
  setTimeout(() => void refreshTray(), 3500);
  remindTimer = setInterval(() => void remindPermissions(false), REMIND_MS);
});

app.on("activate", () => {
  if (!mainWindow) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProc) serverProc.kill();
    app.quit();
  }
});

app.on("before-quit", () => {
  if (remindTimer) clearInterval(remindTimer);
  if (trayTimer) clearInterval(trayTimer);
  if (serverProc) serverProc.kill();
});
