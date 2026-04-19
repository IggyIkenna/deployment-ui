import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Detect rate-metric rows where the numerator exceeds the denominator
 * (e.g. sports FIXTURE_STATS shows `3311/1583` because 3311 events rolled
 * up across 1583 days — the denominator is DAYS, the numerator is ROWS,
 * so the ratio is not a percentage but a per-day rate).
 *
 * Tolerance of 1.1x covers edge cases where shard-level drift briefly
 * exceeds 100% without turning a coverage metric into a rate metric.
 */
export function isRateMetricRow(
  numerator: number | undefined | null,
  denominator: number | undefined | null,
): boolean {
  if (numerator == null || denominator == null) return false;
  if (denominator <= 0) return false;
  if (numerator <= 0) return false;
  return numerator / denominator > 1.1;
}

/** Format a rate-metric row right-column label (e.g. "6,319/day"). */
export function formatRatePerDay(numerator: number, denominator: number): string {
  if (denominator <= 0) return `${numerator}/day`;
  const rate = Math.round(numerator / denominator);
  return `${rate.toLocaleString()}/day`;
}
