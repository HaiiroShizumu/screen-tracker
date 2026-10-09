import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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

export function today(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
