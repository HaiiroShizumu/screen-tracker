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
  };
  byApp: { name: string; seconds: number }[];
  byDomain: { name: string; seconds: number }[];
  byTask: { name: string; seconds: number }[];
  timeline: Array<{
    id: number;
    ts_start: string;
    ts_end: string;
    duration_sec: number;
    app: string;
    title: string | null;
    url: string | null;
    domain: string | null;
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
  | "tomorrow"
  | "this_week"
  | "next_week"
  | "later";

export const KANBAN_COLUMNS: { key: DeadlineBucket; label: string }[] = [
  { key: "overdue", label: "Просрочено" },
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "this_week", label: "На этой неделе" },
  { key: "next_week", label: "На след. неделе" },
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
  if (dlDay === ymd(tomorrow)) return "tomorrow";

  const weekStart = startOfWeekMon(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
  if (dlDay <= ymd(weekEnd)) return "this_week";

  const nextStart = new Date(weekStart);
  nextStart.setDate(nextStart.getDate() + 7);
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextEnd.getDate() + 6);
  if (dlDay <= ymd(nextEnd)) return "next_week";

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

export const api = {
  permissions: () => req<PermissionStatus>("/permissions"),
  overview: (range: RangePreset, day: string) =>
    req<Overview>(`/overview?range=${range}&day=${day}`),
  matches: (day: string) => req<{ day: string; groups: MatchGroup[] }>(`/matches?day=${day}`),
  tasks: () => req<{ tasks: Task[] }>("/tasks"),
  syncBitrix: () => req<{ count: number }>("/bitrix/sync", { method: "POST" }),
  assign: (group_key: string, task_id: number | null) =>
    req<{ groups: MatchGroup[] }>("/matches/assign", {
      method: "POST",
      body: JSON.stringify({ group_key, task_id }),
    }),
  confirm: (group_keys?: string[], push = true, day?: string) =>
    req<{ groups: MatchGroup[]; pushed: unknown[] }>("/matches/confirm", {
      method: "POST",
      body: JSON.stringify({ group_keys, push, day }),
    }),
  report: (day: string) =>
    req<{ file: string }>("/reports/generate", {
      method: "POST",
      body: JSON.stringify({ day }),
    }),
};
