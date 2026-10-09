/** Activity categories for charts and timeline. */

export type Category = "code" | "research" | "ai" | "comms" | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  code: "Код",
  research: "Исследование",
  ai: "AI",
  comms: "Коммуникации",
  other: "Прочее",
};

export const CATEGORY_ORDER: Category[] = ["code", "research", "ai", "comms", "other"];

const CODE_APPS = /^(cursor|code|visual studio code|terminal|iterm|warp|ghostty|alacritty|kitty|hyper|zed|sublime|webstorm|intellij|xcode)/i;
const AI_APPS = /^(claude|chatgpt|openai|deepseek|perplexity|gemini|copilot|grok)/i;
const COMMS_APPS =
  /^(mail|mail\.app|spark|outlook|slack|telegram|discord|messages|whatsapp|skype|zoom|teams|notion calendar|calendly|bitrix)/i;
const BROWSER_APPS = /chrome|safari|arc|firefox|edge|brave|opera|vivaldi/i;

const AI_DOMAINS =
  /(claude\.ai|chatgpt\.com|chat\.openai\.com|deepseek\.com|perplexity\.ai|gemini\.google|copilot\.microsoft|grok\.x\.ai|poe\.com|character\.ai)/i;
const RESEARCH_DOMAINS =
  /(github\.com|gitlab\.com|stackoverflow\.com|stackexchange\.com|developer\.mozilla|mdn\.|docs\.|readthedocs|npmjs\.com|pkg\.go\.dev|rust-lang\.org|wikipedia\.org|dev\.to|medium\.com|habr\.com|notion\.so|figma\.com|linear\.app|atlassian\.net|jira\.|confluence)/i;
const COMMS_DOMAINS =
  /(bitrix24\.|mail\.|gmail\.com|outlook\.|office\.com|slack\.com|telegram\.|discord\.com|whatsapp\.|teams\.microsoft|zoom\.us|calendly\.com)/i;

const AI_TITLE = /\b(claude|chatgpt|deepseek|copilot|gemini|perplexity|grok)\b/i;

export function categorize(input: {
  app: string;
  title?: string | null;
  domain?: string | null;
  url?: string | null;
}): Category {
  const app = input.app || "";
  const domain = (input.domain || "").toLowerCase();
  const title = input.title || "";
  const url = (input.url || "").toLowerCase();

  // Cursor chat / AI panels often keep Cursor as app
  if (AI_TITLE.test(title) && /cursor|code/i.test(app)) return "ai";
  if (AI_APPS.test(app)) return "ai";
  if (AI_DOMAINS.test(domain) || AI_DOMAINS.test(url)) return "ai";

  if (CODE_APPS.test(app)) return "code";
  if (/^(Cursor|Code)\s*[·•]/.test(app)) return "code";

  if (COMMS_APPS.test(app)) return "comms";
  if (COMMS_DOMAINS.test(domain) || COMMS_DOMAINS.test(url)) return "comms";

  if (BROWSER_APPS.test(app)) {
    if (RESEARCH_DOMAINS.test(domain) || RESEARCH_DOMAINS.test(url)) return "research";
    return "research";
  }

  if (RESEARCH_DOMAINS.test(domain)) return "research";

  return "other";
}
