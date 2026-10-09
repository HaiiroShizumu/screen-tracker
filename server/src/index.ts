import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { router } from "./routes.js";
import { startCollector, stopCollector } from "./collector.js";
import { syncBitrixTasks } from "./bitrix.js";
import { rebuildMatches } from "./matcher.js";
import { writeDailyReport } from "./reports.js";
import { dayKey } from "./util.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });

const PORT = Number(process.env.PORT || 3847);
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);

const webDist = path.join(root, "web/dist");
app.use(express.static(webDist));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) next();
  });
});

startCollector();

const syncMin = Number(process.env.BITRIX_SYNC_MINUTES || 15);
if (process.env.SMB_WEBHOOK_URL) {
  const runSync = () =>
    syncBitrixTasks()
      .then((r) => {
        rebuildMatches(dayKey());
        console.log(`[bitrix] synced ${r.count} tasks (user ${r.userId})`);
      })
      .catch((e) => console.warn("[bitrix] sync failed:", e));
  setTimeout(runSync, 3000);
  setInterval(runSync, syncMin * 60_000);
}

const reportCron = process.env.REPORT_CRON || "40 17 * * 1-5";
cron.schedule(reportCron, () => {
  writeDailyReport(dayKey())
    .then((f) => console.log("[report] wrote", f))
    .catch((e) => console.warn("[report]", e));
});

const server = app.listen(PORT, () => {
  console.log(`[server] http://127.0.0.1:${PORT}`);
});

function shutdown() {
  stopCollector();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
