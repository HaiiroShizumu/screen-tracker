const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 3847;
let serverProc = null;

function serverEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server", "dist", "index.js");
  }
  return path.join(__dirname, "..", "server", "src", "index.ts");
}

function startServer() {
  const entry = serverEntry();
  const cwd = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(__dirname, "..");
  const env = {
    ...process.env,
    PORT: String(PORT),
    ELECTRON_RUN: "1",
  };
  if (app.isPackaged) {
    serverProc = spawn(process.execPath, [entry], {
      cwd,
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "inherit",
    });
  } else {
    serverProc = spawn("npx", ["tsx", entry], {
      cwd: path.join(__dirname, "..", "server"),
      env,
      stdio: "inherit",
      shell: true,
    });
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Screen Tracker",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, 1200);
});

app.on("window-all-closed", () => {
  if (serverProc) serverProc.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProc) serverProc.kill();
});
