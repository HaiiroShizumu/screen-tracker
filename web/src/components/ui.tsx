import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "accent";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "default" &&
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        variant === "outline" &&
          "border border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
        variant === "ghost" && "hover:bg-[var(--color-muted)]",
        variant === "accent" && "bg-[var(--color-accent)] text-white hover:opacity-90",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        tone === "good" && "bg-teal-100 text-teal-800",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "bad" && "bg-stone-200 text-stone-600",
        className
      )}
      {...props}
    />
  );
}
