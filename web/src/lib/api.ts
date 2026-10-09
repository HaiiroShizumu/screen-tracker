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
  web_urls: string;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json as T;
}

export const api = {
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
