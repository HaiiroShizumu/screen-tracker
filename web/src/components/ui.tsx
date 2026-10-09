import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-card-foreground)] shadow-sm",
        className
      )}
      {...props}
    />
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "outline" | "ghost" | "accent" | "secondary";
    size?: "sm" | "md";
  }
>(function Button({ className, variant = "default", size = "md", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2",
        variant === "default" &&
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        variant === "outline" &&
          "border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]",
        variant === "secondary" && "bg-[var(--color-muted)] hover:opacity-90",
        variant === "ghost" && "hover:bg-[var(--color-muted)]",
        variant === "accent" &&
          "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
        className
      )}
      {...props}
    />
  );
});

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm",
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
        tone === "good" && "bg-[color-mix(in_oklab,var(--color-success)_18%,transparent)] text-[var(--color-success)]",
        tone === "warn" && "bg-[color-mix(in_oklab,var(--color-warning)_22%,transparent)] text-[var(--color-warning)]",
        tone === "bad" && "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-ring)]/30",
        className
      )}
      {...props}
    />
  );
}
