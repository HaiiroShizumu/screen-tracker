export type MatchConfidence = "high" | "suggested" | "manual" | "none";
export type MatchStatus = "pending" | "confirmed" | "pushed";

export interface ActivitySegment {
  id: number;
  ts_start: string;
  ts_end: string;
  duration_sec: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  idle: number;
}

export interface BitrixTask {
  task_id: number;
  title: string;
  responsible_id: number | null;
  status: number;
  deadline: string | null;
  deal_ids: string;
  company_ids: string;
  web_urls: string;
  synced_at: string;
}

export interface ActivityMatch {
  id: number;
  segment_group_key: string;
  day: string;
  domain: string | null;
  task_id: number | null;
  confidence: MatchConfidence;
  status: MatchStatus;
  pushed_elapsed_id: number | null;
  duration_sec: number;
}

export interface MatchGroup {
  group_key: string;
  day: string;
  domain: string | null;
  app: string | null;
  duration_sec: number;
  titles: string[];
  urls: string[];
  task_id: number | null;
  task_title: string | null;
  confidence: MatchConfidence;
  status: MatchStatus;
  pushed_elapsed_id: number | null;
}

export type RangePreset = "day" | "week" | "month";
