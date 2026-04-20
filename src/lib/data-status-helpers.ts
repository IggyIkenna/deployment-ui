import type {
  TurboCategoryStatus,
  TurboSubDimension,
} from "../api/client";

/**
 * Return the populated sub-dimension drilldown for a category entry from
 * `/api/data-status/manifest`.
 *
 * Deployment-api's aggregator emits a `breakdown_axis` discriminator per
 * category as of 2026-04-20:
 *
 *   - `"venue"` (legacy default — CEFI / TRADFI / DEFI / PREDICTION): the
 *     drilldown lives under `venues`; `data_types` is empty.
 *   - `"data_type"` (SPORTS): the drilldown lives under `data_types` (keys
 *     such as `FIXTURES`, `FIXTURE_EVENTS`, `LEAGUES`); `venues` is `{}`.
 *
 * When `breakdown_axis` is absent (older backends), fall back to the legacy
 * behaviour of treating `venues` as the canonical drilldown.
 */
export function getCategoryBreakdown(
  cat: TurboCategoryStatus,
): Record<string, TurboSubDimension> | undefined {
  if (cat.breakdown_axis === "data_type") {
    return cat.data_types;
  }
  // "venue" or undefined → legacy shape
  return cat.venues;
}

/**
 * Section-header label for the breakdown table. Flips to "Data types" for
 * SPORTS (`breakdown_axis === "data_type"`); stays "Venues" otherwise.
 */
export function getCategoryBreakdownLabel(cat: TurboCategoryStatus): string {
  if (cat.breakdown_axis === "data_type") {
    return "Data Types";
  }
  return "Venues";
}
