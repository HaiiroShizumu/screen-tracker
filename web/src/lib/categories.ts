export type Category = "code" | "research" | "ai" | "comms" | "other";

export const CATEGORY_LABELS: Record<Category, string> = {
  code: "Код",
  research: "Исследование",
  ai: "AI",
  comms: "Коммуникации",
  other: "Прочее",
};

export const CATEGORY_ORDER: Category[] = ["code", "research", "ai", "comms", "other"];

/** CSS color vars — distinct enough on light/dark. */
export const CATEGORY_COLORS: Record<Category, string> = {
  code: "var(--color-cat-code)",
  research: "var(--color-cat-research)",
  ai: "var(--color-cat-ai)",
  comms: "var(--color-cat-comms)",
  other: "var(--color-cat-other)",
};
