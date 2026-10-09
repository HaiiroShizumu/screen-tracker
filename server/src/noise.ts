/** Noise that should never appear in charts / timeline / matching. */

const NOISE_APPS = new Set(["unknown", "idle", ""]);

const NOISE_DOMAINS = new Set([
  "(no url)",
  "no url",
  "newtab",
  "new-tab-page",
  "ntp.msn.com",
  "chrome",
  "edge",
  "brave",
  "about",
  "devtools",
]);

export function isNoiseApp(app: string | null | undefined): boolean {
  if (!app) return true;
  return NOISE_APPS.has(app.trim().toLowerCase());
}

export function isNoiseDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (NOISE_DOMAINS.has(d)) return true;
  if (d.includes("newtab") || d.includes("new-tab")) return true;
  return false;
}

export function isNoiseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  if (
    u.startsWith("chrome://") ||
    u.startsWith("chrome-extension://") ||
    u.startsWith("edge://") ||
    u.startsWith("brave://") ||
    u.startsWith("about:") ||
    u.startsWith("devtools://")
  ) {
    return true;
  }
  if (u.includes("newtab") || u.includes("new-tab-page")) return true;
  return false;
}

/** Segment worth showing / aggregating (active work signal). */
export function isUsefulSegment(s: {
  app?: string | null;
  domain?: string | null;
  url?: string | null;
  idle?: number | boolean;
}): boolean {
  if (s.idle === 1 || s.idle === true) return false;
  if (isNoiseApp(s.app)) return false;
  if (isNoiseUrl(s.url)) return false;
  // browser-looking with no real domain → noise
  const browsers = /chrome|safari|arc|firefox|edge|brave/i;
  if (browsers.test(s.app || "") && isNoiseDomain(s.domain) && !s.url?.startsWith("file:")) {
    return false;
  }
  return true;
}

export function cleanDomainLabel(domain: string | null | undefined): string | null {
  if (isNoiseDomain(domain)) return null;
  return domain ?? null;
}
