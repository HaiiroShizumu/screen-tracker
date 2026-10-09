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

/**
 * Bitrix24 portal → company slug.
 * smartbiznes58.bitrix24.ru → "smartbiznes58"
 */
export function companyFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.replace(/^www\./, "").toLowerCase();
  const m = h.match(/^([a-z0-9][a-z0-9-]*)\.bitrix24\.(ru|com|ua|by|kz)$/i);
  return m?.[1] || null;
}

/** Keep Bitrix portals distinct; otherwise collapse to base domain. */
export function trackDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const company = companyFromHost(host);
  if (company) return `${company}.bitrix24`;
  return baseDomain(host) || host.toLowerCase();
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
  const s = Math.max(0, Math.round(sec));
  if (s === 0) return "0с";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return r > 0 ? `${h}ч ${m}м ${r}с` : m > 0 ? `${h}ч ${m}м` : `${h}ч`;
  if (m > 0) return r > 0 ? `${m}м ${r}с` : `${m}м`;
  return `${r}с`;
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
