import type { Category } from "@/lib/categories";

export type RangePreset = "day" | "week" | "month";

export type MatchGroup = {
  group_key: string;
  day: string;
  domain: string | null;
  app: string | null;
  duration_sec: number;
  titles: string[];
  urls: string[];
  task_id: number | null;
  task_title: string | null;
  confidence: string;
  status: string;
  pushed_elapsed_id: number | null;
};

export type Overview = {
  day: string;
  kpi: {
    active_sec: number;
    idle_sec: number;
    match_pct: number;
    top_task: string | null;
    top_task_sec: number;
    yesterday_active_sec: number;
    vs_yesterday_pct: number | null;
    switches_per_hour: number;
    longest_session_sec: number;
    session_count: number;
    sparkline: number[];
  };
  byApp: { name: string; seconds: number }[];
  byDomain: { name: string; seconds: number }[];
  byCompany: { name: string; seconds: number }[];
  byTask: { name: string; seconds: number }[];
  byCategory: { id: Category; name: string; seconds: number }[];
  hourlyStacked: Array<Record<string, string | number>>;
  categories: { id: Category; name: string }[];
  timeline: Array<{
    id: string | number;
    ts_start: string;
    ts_end: string;
    duration_sec: number;
    app: string;
    title: string | null;
    url: string | null;
    domain: string | null;
    category: Category;
    row_key: string;
    segment_count: number;
  }>;
};

export type Task = {
  task_id: number;
  title: string;
  status: number;
  deadline: string | null;
  web_urls: string;
  deal_ids?: string;
  company_ids?: string;
};

export type DeadlineBucket =
  | "overdue"
  | "today"
  | "this_week"
  | "later";

export const KANBAN_COLUMNS: { key: DeadlineBucket; label: string }[] = [
  { key: "overdue", label: "Просрочено" },
  { key: "today", label: "Сегодня" },
  { key: "this_week", label: "На этой неделе" },
  { key: "later", label: "Позднее" },
];

/** Local calendar day YYYY-MM-DD */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekMon(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return x;
}

export function deadlineBucket(deadline: string | null | undefined, now = new Date()): DeadlineBucket {
  if (!deadline) return "later";
  const dl = new Date(deadline);
  if (Number.isNaN(dl.getTime())) return "later";

  const today = ymd(now);
  const dlDay = ymd(dl);
  if (dlDay < today) return "overdue";
  if (dlDay === today) return "today";

  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (dlDay === ymd(tomorrow)) return "this_week";

  const weekStart = startOfWeekMon(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
  if (dlDay <= ymd(weekEnd)) return "this_week";

  return "later";
}

export function formatDeadline(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json as T;
}

export type PermissionStatus = {
  ok: boolean;
  missing: string[];
  hint?: string;
};

export type AppSettings = {
  ai: {
    base_url: string;
    model: string;
    has_key: boolean;
  };
};

export const api = {
  permissions: () => req<PermissionStatus>("/permissions"),
  settings: () => req<AppSettings>("/settings"),
  saveSettings: (body: { ai: { base_url?: string; model?: string; api_key?: string } }) =>
    req<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(body) }),
  overview: (range: RangePreset, day: string) =>
    req<Overview>(`/overview?range=${range}&day=${day}`),
  matches: (day: string) => req<{ day: string; groups: MatchGroup[] }>(`/matches?day=${day}`),
  tasks: () => req<{ tasks: Task[] }>("/tasks"),
  syncBitrix: () => req<{ count: number }>("/bitrix/sync", { method: "POST" }),
  assign: (group_key: string, task_id: number | null, save_rule = true) =>
    req<{ groups: MatchGroup[] }>("/matches/assign", {
      method: "POST",
      body: JSON.stringify({ group_key, task_id, save_rule }),
    }),
  ignore: (group_key: string) =>
    req<{ groups: MatchGroup[] }>("/matches/ignore", {
      method: "POST",
      body: JSON.stringify({ group_key }),
    }),
  split: (group_key: string, seconds: number) =>
    req<{ groups: MatchGroup[] }>("/matches/split", {
      method: "POST",
      body: JSON.stringify({ group_key, seconds }),
    }),
  confirm: (
    group_keys?: string[],
    push = true,
    day?: string,
    opts?: { round_to?: number; comments?: Record<string, string> }
  ) =>
    req<{ groups: MatchGroup[]; pushed: unknown[] }>("/matches/confirm", {
      method: "POST",
      body: JSON.stringify({
        group_keys,
        push,
        day,
        round_to: opts?.round_to,
        comments: opts?.comments,
      }),
    }),
  report: (day: string) =>
    req<{ file: string }>("/reports/generate", {
      method: "POST",
      body: JSON.stringify({ day }),
    }),
};
