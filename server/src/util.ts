export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** registrable-ish: last two labels (ponytail: enough for .ru/.com) */
export function baseDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const parts = host.replace(/^www\./, "").toLowerCase().split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar day bounds as ISO (UTC) strings */
export function rangeBounds(preset: "day" | "week" | "month", anchor = new Date()) {
  const end = new Date(anchor);
  end.setHours(23, 59, 59, 999);
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (preset === "week") start.setDate(start.getDate() - 6);
  if (preset === "month") start.setDate(start.getDate() - 29);
  return { start: start.toISOString(), end: end.toISOString(), day: dayKey(anchor) };
}

export function dayBounds(day: string) {
  const anchor = new Date(`${day}T12:00:00`);
  return rangeBounds("day", anchor);
}

export function groupKey(day: string, domain: string | null, app: string): string {
  return `${day}|${domain ?? `app:${app}`}`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч${m}м`;
  return `${m}м`;
}

export async function fetchTimeout(
  url: string,
  init: RequestInit = {},
  ms = 20_000
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
