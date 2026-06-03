import type { TurboAssetGroupStatus, TurboSubDimension } from "../api/client";

/**
 * Return the populated sub-dimension drilldown for an asset-group entry from
 * `/api/data-status/manifest`.
 *
 * Deployment-api's aggregator emits a `breakdown_axis` discriminator per
 * asset group:
 *
 *   - `"venue"` (legacy default — CEFI / TRADFI / DEFI): the drilldown lives
 *     under `venues`; `data_types` is empty.
 *   - `"data_type"` (SPORTS): the drilldown lives under `data_types` (keys
 *     such as `FIXTURES`, `FIXTURE_EVENTS`, `LEAGUES`); `venues` is `{}`.
 *   - `"canonical_question_group"` (PREDICTION post-v9): the drilldown lives
 *     under `data_types` keyed by canonical_question_group name. Each entry
 *     carries `observed_clusters: Record<string, number>` (market_id →
 *     row_count) for the per-market cluster drilldown, plus `source`
 *     (polymarket_clob / polymarket_gamma_api / kalshi_*).
 *
 * When `breakdown_axis` is absent (older backends), fall back to the legacy
 * behaviour of treating `venues` as the canonical drilldown.
 */
export function getAssetGroupBreakdown(
  ag: TurboAssetGroupStatus,
): Record<string, TurboSubDimension> | undefined {
  if (
    ag.breakdown_axis === "data_type" ||
    ag.breakdown_axis === "canonical_question_group"
  ) {
    return ag.data_types as Record<string, TurboSubDimension> | undefined;
  }
  // "venue" or undefined → legacy shape
  return ag.venues;
}

/**
 * Section-header label for the breakdown table.
 *   - "Question Groups" for PREDICTION post-v9 (`breakdown_axis === "canonical_question_group"`)
 *   - "Data Types" for SPORTS (`breakdown_axis === "data_type"`)
 *   - "Venues" otherwise (CEFI / TRADFI / DEFI / legacy PREDICTION)
 */
export function getAssetGroupBreakdownLabel(ag: TurboAssetGroupStatus): string {
  if (ag.breakdown_axis === "canonical_question_group") {
    return "Question Groups";
  }
  if (ag.breakdown_axis === "data_type") {
    return "Data Types";
  }
  return "Venues";
}

/**
 * Returns true when the asset group uses the post-v9 prediction bundled-atom
 * breakdown (canonical_question_group axis). Callers use this to render the
 * per-market cluster drilldown (observed_clusters) under each group row.
 */
export function isPredictionCqgAxis(ag: TurboAssetGroupStatus): boolean {
  return ag.breakdown_axis === "canonical_question_group";
}
