import type { TurboAssetGroupStatus, TurboDataStatusResponse, TurboSubDimension } from "../api/client";
import { getAssetGroupBreakdown, getAssetGroupBreakdownLabel } from "./data-status-helpers";

/**
 * "Needs Attention" triage panel — derivation + ranking logic.
 *
 * Cross-cutting summary of the worst problems in a `turboData` (`/api/data-
 * status/manifest` or `/turbo`) response, so an operator sees them without
 * drilling into the per-venue tree. Deliberately derives EVERYTHING from
 * fields the backend already emits on `TurboAssetGroupStatus` /
 * `TurboSubDimension` (see codex/02-data/availability-manifest-and-data-
 * status.md) — no new backend endpoint or field.
 *
 * Three kinds, ranked in this fixed priority (failures are the least
 * ambiguous "something is broken" signal; gaps are dates never captured;
 * stale is "capture used to work, has it stopped?"):
 *
 *   1. `failure` — `attempted_failed` > 0 (adapter ran and raised).
 *   2. `gap`     — `dates_missing` > 0 within the queried range.
 *   3. `stale`   — the latest date in `dates_found_list` trails the range
 *                  end by >= `staleDaysThreshold` days. Only computable when
 *                  the response includes full date lists (`full_dates_list`
 *                  / `include_dates_list`); silently produces no stale items
 *                  when the field is absent/empty rather than guessing.
 *
 * `gap` and `stale` are independent lenses over the same manifest and may
 * overlap by design (a venue can be both "has 5 missing dates somewhere in
 * range" AND "hasn't captured anything in the last week") — this is useful
 * to an operator triaging, not double-counting a bug.
 *
 * KNOWN GAP (not built): entirely-missing venues that never appear in the
 * `venues`/`data_types` breakdown at all — those live in
 * `TurboAssetGroupStatus.venue_summary.expected_but_missing` (a name list,
 * no counts/dates) and are surfaced elsewhere (deploy-missing flow). Adding
 * them here would need a fabricated severity with no real magnitude behind
 * it, so they're left out rather than half-built.
 */

export type NeedsAttentionKind = "failure" | "gap" | "stale";

export interface NeedsAttentionItem {
  /** Stable identity for React keys + test targeting: `${kind}:${assetGroup}:${name}`. */
  id: string;
  kind: NeedsAttentionKind;
  assetGroup: string;
  /** "Venues" | "Data Types" | "Question Groups" (see getAssetGroupBreakdownLabel). */
  dimensionLabel: string;
  /** Venue / data_type / question-group name, or the asset_group itself when there is no breakdown. */
  name: string;
  /** Magnitude in the item's own unit (failed rows | missing dates | stale days) — compared only within a kind. */
  count: number;
  /** Human-readable one-liner for the row. */
  detail: string;
}

export interface DeriveNeedsAttentionOptions {
  /** ISO date (YYYY-MM-DD) staleness is measured against. Defaults to `turboData.date_range.end`. */
  rangeEndISO?: string;
  /** Minimum days-since-last-capture to count as `stale`. */
  staleDaysThreshold?: number;
  /**
   * Cap on items PER KIND (post-ranking), not a global cap. A flat global cap
   * would let one noisy kind (a service with a dozen small gaps) crowd every
   * `stale` item out of the panel entirely, even though kind-priority means
   * failures/gaps always outrank stale — defeating the "see all three kinds
   * without drilling in" point of this panel. Reserving a slice per kind
   * guarantees every kind that has real signal gets shown.
   */
  maxItemsPerKind?: number;
}

const DEFAULT_STALE_DAYS_THRESHOLD = 3;
const DEFAULT_MAX_ITEMS_PER_KIND = 5;

/** Structural subset of TurboSubDimension/TurboAssetGroupStatus this module reads. Both interfaces satisfy it. */
interface AttentionSource {
  capture_status_counts?: { attempted_failed: number };
  counts?: { attempted_failed: number };
  dates_missing?: number;
  missing_dates?: string[] | string;
  dates_found_list?: string[];
}

function attemptedFailedCount(entry: AttentionSource): number {
  return entry.counts?.attempted_failed ?? entry.capture_status_counts?.attempted_failed ?? 0;
}

function missingCount(entry: AttentionSource): number {
  if (typeof entry.dates_missing === "number") return entry.dates_missing;
  if (Array.isArray(entry.missing_dates)) return entry.missing_dates.length;
  return 0;
}

/** Max of an ISO date-string array (plain lexical compare — YYYY-MM-DD sorts correctly as a string). */
function latestDate(dates: string[] | undefined): string | null {
  if (!dates || dates.length === 0) return null;
  let max = dates[0];
  for (const d of dates) {
    if (d > max) max = d;
  }
  return max;
}

/** Whole calendar days between two ISO (YYYY-MM-DD) dates. Returns 0 on unparseable input rather than NaN. */
function daysBetween(earlierISO: string, laterISO: string): number {
  const earlier = Date.parse(`${earlierISO}T00:00:00Z`);
  const later = Date.parse(`${laterISO}T00:00:00Z`);
  if (Number.isNaN(earlier) || Number.isNaN(later)) return 0;
  return Math.round((later - earlier) / 86_400_000);
}

function pluralize(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Derive + rank the "Needs Attention" list from an already-fetched turbo/
 * manifest response. Pure function — no fetching, no React — so the ranking
 * logic is unit-testable without mounting a component.
 */
export function deriveNeedsAttention(
  turboData: TurboDataStatusResponse | null | undefined,
  options: DeriveNeedsAttentionOptions = {},
): NeedsAttentionItem[] {
  if (!turboData?.asset_groups) return [];

  const rangeEndISO = options.rangeEndISO ?? turboData.date_range?.end;
  const staleDaysThreshold = options.staleDaysThreshold ?? DEFAULT_STALE_DAYS_THRESHOLD;
  const maxItemsPerKind = options.maxItemsPerKind ?? DEFAULT_MAX_ITEMS_PER_KIND;

  const items: NeedsAttentionItem[] = [];

  for (const [assetGroup, catData] of Object.entries(turboData.asset_groups)) {
    const breakdown = getAssetGroupBreakdown(catData as TurboAssetGroupStatus);
    const dimensionLabel = getAssetGroupBreakdownLabel(catData as TurboAssetGroupStatus);
    const hasBreakdown = !!breakdown && Object.keys(breakdown).length > 0;

    // Per-venue/data_type rows when a breakdown exists; otherwise the category
    // itself is the only row (avoids double-counting the same underlying rows
    // at both the category AND sub-dimension level).
    const rows: Array<{ name: string; data: AttentionSource }> = hasBreakdown
      ? Object.entries(breakdown as Record<string, TurboSubDimension>).map(([name, data]) => ({ name, data }))
      : [{ name: assetGroup, data: catData as AttentionSource }];

    for (const { name, data } of rows) {
      const failed = attemptedFailedCount(data);
      if (failed > 0) {
        items.push({
          id: `failure:${assetGroup}:${name}`,
          kind: "failure",
          assetGroup,
          dimensionLabel,
          name,
          count: failed,
          detail: `${pluralize(failed, "attempted_failed row")}`,
        });
      }

      const missing = missingCount(data);
      if (missing > 0) {
        items.push({
          id: `gap:${assetGroup}:${name}`,
          kind: "gap",
          assetGroup,
          dimensionLabel,
          name,
          count: missing,
          detail: `${pluralize(missing, "missing date")} in range`,
        });
      }

      if (rangeEndISO) {
        const latest = latestDate(data.dates_found_list);
        if (latest) {
          const staleDays = daysBetween(latest, rangeEndISO);
          if (staleDays >= staleDaysThreshold) {
            items.push({
              id: `stale:${assetGroup}:${name}`,
              kind: "stale",
              assetGroup,
              dimensionLabel,
              name,
              count: staleDays,
              detail: `Last capture ${staleDays}d before range end (${latest})`,
            });
          }
        }
      }
    }
  }

  const byKind: Record<NeedsAttentionKind, NeedsAttentionItem[]> = { failure: [], gap: [], stale: [] };
  for (const item of items) byKind[item.kind].push(item);
  for (const kind of Object.keys(byKind) as NeedsAttentionKind[]) {
    byKind[kind].sort((a, b) => b.count - a.count);
  }

  return [
    ...byKind.failure.slice(0, maxItemsPerKind),
    ...byKind.gap.slice(0, maxItemsPerKind),
    ...byKind.stale.slice(0, maxItemsPerKind),
  ];
}
