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

export interface EventDrivenCoverageLabel {
  /** Headline text shown on the row, e.g. "100.0% attempted · 23.4% captured (77% empty)". */
  text: string;
  /** Tooltip text explaining why the two numbers differ. */
  tooltip: string;
}

/**
 * Build the label for an event-driven category row (SPORTS / PREDICTION).
 *
 * Dense categories (CeFi / TradFi / DeFi) should display the single capture %
 * unchanged; this helper is only invoked when
 * `coverage_semantics === "event_driven"`.
 *
 * Polymarket conditionIds and sports fixtures only trade on a fraction of
 * their nominal eligible days — the shards-weighted "capture" ratio therefore
 * vastly understates real coverage. We show both numbers so operators see
 * that we attempted every market, then display how sparse the per-day trading
 * was within those markets.
 */
export function formatEventDrivenCoverageLabel(
  attemptCoveragePct: number | undefined | null,
  captureCoveragePct: number | undefined | null,
  emptyRateEstimate: number | null | undefined,
): EventDrivenCoverageLabel {
  const attempt = attemptCoveragePct ?? 0;
  const capture = captureCoveragePct ?? 0;
  const emptyPctText =
    typeof emptyRateEstimate === "number"
      ? ` (${Math.round(emptyRateEstimate * 100)}% empty)`
      : "";
  // Captured is the headline (real data on disk). Attempted is the secondary
  // (we tried — includes captured + empty_confirmed + attempted_failed). The
  // 2026-04-29 audit confused operators because the previous order led with
  // attempted, making SPORTS look like 96% coverage when the actual captured
  // shard count was 70%.
  const text = `${capture.toFixed(1)}% captured · ${attempt.toFixed(1)}% attempted${emptyPctText}`;
  const tooltip =
    "This is an event-driven category — underlyings only trade on a fraction of days " +
    "(Polymarket conditionIds come and go, sports fixtures only occur on match days). " +
    "Captured = fraction of (underlying × day) shards with real data on disk. " +
    "Attempted = fraction of shards we've called the source for (captured + legitimately empty + failed). " +
    "Empty = approximate fraction of attempted underlying-days with no trades.";
  return { text, tooltip };
}
