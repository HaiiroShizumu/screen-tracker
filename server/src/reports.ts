import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, getMeta } from "./db.js";
import { dayKey, formatDuration } from "./util.js";
import { rebuildMatches } from "./matcher.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportsDir = path.join(root, "reports");

export function buildMarkdown(day = dayKey()): string {
  rebuildMatches(day);
  const name = process.env.BITRIX_USER_NAME || "Андрей Родькин";

  const matched = db
    .prepare(
      `SELECT m.task_id, t.title, m.domain, m.duration_sec, m.confidence, m.status
       FROM activity_matches m
       LEFT JOIN bitrix_tasks t ON t.task_id = m.task_id
       WHERE m.day = ? AND m.task_id IS NOT NULL
       ORDER BY t.title, m.duration_sec DESC`
    )
    .all(day) as Array<{
    task_id: number;
    title: string | null;
    domain: string | null;
    duration_sec: number;
    confidence: string;
    status: string;
  }>;

  const unassigned = db
    .prepare(
      `SELECT domain, duration_sec FROM activity_matches
       WHERE day = ? AND (task_id IS NULL OR confidence = 'none')
       ORDER BY duration_sec DESC`
    )
    .all(day) as Array<{ domain: string | null; duration_sec: number }>;

  const byTask = new Map<number, { title: string; lines: string[] }>();
  for (const row of matched) {
    if (!byTask.has(row.task_id)) {
      byTask.set(row.task_id, { title: row.title || `#${row.task_id}`, lines: [] });
    }
    byTask.get(row.task_id)!.lines.push(
      `- ${formatDuration(row.duration_sec)} — ${row.domain || "app"} (${row.confidence}/${row.status})`
    );
  }

  const lines: string[] = [`# Отчёт ${day} (${name})`, ""];
  for (const [id, block] of byTask) {
    lines.push(`## Задача #${id} — ${block.title}`);
    lines.push(...block.lines);
    lines.push("");
  }
  lines.push("## Не назначено");
  if (unassigned.length === 0) lines.push("- —");
  else {
    for (const u of unassigned) {
      lines.push(`- ${formatDuration(u.duration_sec)} — ${u.domain || "unknown"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export async function enrichWithAi(md: string): Promise<string> {
  const base =
    (getMeta("ai_base_url") || process.env.XIAOMI_BASE_URL || "").replace(/\/?$/, "");
  const key = getMeta("ai_api_key") || process.env.XIAOMI_API_KEY || "";
  const model = getMeta("ai_model") || process.env.XIAOMI_MODEL || "mimo-v2.6-flash";
  if (!base || !key) return md;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Ты помощник для дневного отчёта по работе. Кратко, без воды, по пунктам: что сделано по каждой задаче. Не выдумывай факты вне текста.",
        },
        { role: "user", content: md },
      ],
      max_completion_tokens: 1024,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiMo ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = json.choices?.[0]?.message?.content?.trim();
  if (!summary) return md;
  return `${md}\n## ИИ-саммари\n\n${summary}\n`;
}

export async function writeDailyReport(day = dayKey()): Promise<string> {
  fs.mkdirSync(reportsDir, { recursive: true });
  let md = buildMarkdown(day);
  try {
    md = await enrichWithAi(md);
  } catch (e) {
    console.warn("[report] AI enrich failed:", e);
    md += `\n## ИИ-саммари\n\n_(ошибка генерации)_\n`;
  }
  const file = path.join(reportsDir, `${day}.md`);
  fs.writeFileSync(file, md, "utf8");
  return file;
}
