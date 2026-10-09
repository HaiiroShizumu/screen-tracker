import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  app?: string | null;
  domain?: string | null;
  url?: string | null;
  className?: string;
};

function looksLikeDomain(s: string) {
  return /^[a-z0-9]([a-z0-9-]*\.)+[a-z]{2,}$/i.test(s);
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Map known apps → site whose favicon to show. */
function appFaviconHost(app: string): string | null {
  const a = app.toLowerCase().trim();
  if (/^cursor(\s|$|·)/i.test(a) || a === "cursor") return "cursor.com";
  if (/^(code|visual studio code|vscode)(\s|$|·)/i.test(a)) return "code.visualstudio.com";
  if (/chrome/i.test(a)) return "google.com";
  if (/safari/i.test(a)) return "apple.com";
  if (/^arc(\s|$)/i.test(a)) return "arc.net";
  if (/firefox/i.test(a)) return "mozilla.org";
  if (/slack/i.test(a)) return "slack.com";
  if (/telegram/i.test(a)) return "telegram.org";
  if (/figma/i.test(a)) return "figma.com";
  if (/notion/i.test(a)) return "notion.so";
  if (/discord/i.test(a)) return "discord.com";
  if (/spotify/i.test(a)) return "spotify.com";
  if (/bitrix/i.test(a)) return "bitrix24.ru";
  if (/finder/i.test(a)) return null;
  return null;
}

function resolveHost(app?: string | null, domain?: string | null, url?: string | null): string | null {
  const d = (domain || "").trim().replace(/^www\./, "");
  if (d && looksLikeDomain(d) && d !== "localhost") return d;

  const fromUrl = hostFromUrl(url);
  if (fromUrl && looksLikeDomain(fromUrl) && fromUrl !== "localhost") return fromUrl;

  const a = (app || "").trim();
  if (looksLikeDomain(a) && a !== "localhost") return a;

  // "Cursor · project" / plain app name → brand favicon
  const mapped = a ? appFaviconHost(a) : null;
  if (mapped) return mapped;

  return null;
}

function FaviconImg({ host, className }: { host: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <Globe className={cn("h-4 w-4 text-[var(--color-muted-foreground)]", className)} />;
  }
  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`}
      alt=""
      className={cn("h-4 w-4 rounded-sm object-contain", className)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** Favicon for sites; brand favicon for known apps (Cursor, Chrome, …). */
export function AppIcon({ app, domain, url, className }: Props) {
  const host = resolveHost(app, domain, url);
  if (host) return <FaviconImg host={host} className={className} />;
  return <Globe className={cn("h-4 w-4 text-[var(--color-muted-foreground)]", className)} />;
}
