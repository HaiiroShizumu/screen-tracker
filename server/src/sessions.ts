import { companyFromHost, trackDomain } from "./util.js";
import { categorize, type Category } from "./categories.js";
import { MISC_APP_LABEL, normalizeApp } from "./misc-apps.js";

export const SESSION_GAP_SEC = 45;

export type RawSegment = {
  id?: number;
  ts_start: string;
  ts_end: string;
  duration_sec: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
};

export type Session = {
  id: string;
  ts_start: string;
  ts_end: string;
  duration_sec: number;
  app: string;
  title: string | null;
  url: string | null;
  domain: string | null;
  category: Category;
  focus_key: string;
  row_key: string;
  segment_count: number;
};

function projectFromApp(app: string): string | null {
  const m = app.match(/^(?:Cursor|Code)\s*[·•\-—]\s*(.+)$/i);
  return m?.[1]?.trim() || null;
}

/** Stable focus key for merging nearby segments of the same work. */
export function focusKey(app: string, domain: string | null): string {
  const project = projectFromApp(app);
  if (project) return `project:${project.toLowerCase()}`;
  const company = companyFromHost(domain);
  if (company) return `company:${company}`;
  const tracked = trackDomain(domain);
  if (tracked) return `domain:${tracked}`;
  return `app:${app.toLowerCase()}`;
}

/** Row label for Gantt (app, company portal, or Cursor · project). */
export function rowKey(app: string, domain: string | null): string {
  const project = projectFromApp(app);
  if (project) return `Cursor · ${project}`;
  const company = companyFromHost(domain);
  if (company) return company;
  if (domain) return domain;
  return app;
}

function displayApp(app: string): string {
  const project = projectFromApp(app);
  return project ? `Cursor · ${project}` : app;
}

/**
 * Merge consecutive same-focus segments when gap between them is < SESSION_GAP_SEC.
 * Input must be sorted by ts_start.
 */
export function mergeSessions(raw: RawSegment[]): Session[] {
  const prepared = raw.map((s) => {
    const app = normalizeApp(s.app);
    const domain = app === MISC_APP_LABEL ? null : s.domain;
    const appLabel = displayApp(app);
    return {
      ...s,
      app: appLabel,
      domain,
      focus_key: focusKey(appLabel, domain),
      row_key: rowKey(appLabel, domain),
    };
  });

  const out: Session[] = [];
  for (const s of prepared) {
    const prev = out[out.length - 1];
    const gap =
      prev != null
        ? (new Date(s.ts_start).getTime() - new Date(prev.ts_end).getTime()) / 1000
        : Infinity;

    if (prev && prev.focus_key === s.focus_key && gap >= 0 && gap < SESSION_GAP_SEC) {
      prev.ts_end = s.ts_end > prev.ts_end ? s.ts_end : prev.ts_end;
      prev.duration_sec += s.duration_sec;
      prev.segment_count += 1;
      if (s.title && (!prev.title || s.title.length > (prev.title?.length || 0))) {
        prev.title = s.title;
      }
      if (s.url) prev.url = s.url;
      continue;
    }

    const category = categorize({
      app: s.app,
      title: s.title,
      domain: s.domain,
      url: s.url,
    });

    out.push({
      id: `s${out.length + 1}-${s.id ?? out.length}`,
      ts_start: s.ts_start,
      ts_end: s.ts_end,
      duration_sec: s.duration_sec,
      app: s.app,
      title: s.title,
      url: s.url,
      domain: s.domain,
      category,
      focus_key: s.focus_key,
      row_key: s.row_key,
      segment_count: 1,
    });
  }
  return out;
}

export function focusMetrics(sessions: Session[]): {
  switches: number;
  switches_per_hour: number;
  longest_session_sec: number;
} {
  if (sessions.length === 0) {
    return { switches: 0, switches_per_hour: 0, longest_session_sec: 0 };
  }
  let switches = 0;
  for (let i = 1; i < sessions.length; i++) {
    if (sessions[i].focus_key !== sessions[i - 1].focus_key) switches += 1;
  }
  const t0 = new Date(sessions[0].ts_start).getTime();
  const t1 = new Date(sessions[sessions.length - 1].ts_end).getTime();
  const hours = Math.max(1 / 60, (t1 - t0) / 3_600_000);
  const longest = Math.max(...sessions.map((s) => s.duration_sec));
  return {
    switches,
    switches_per_hour: Math.round((switches / hours) * 10) / 10,
    longest_session_sec: longest,
  };
}
