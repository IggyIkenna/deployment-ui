import type { ShardAxisMatrixResponse, TurboAssetGroupStatus, TurboSubDimension } from "../api/client";

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
export function getAssetGroupBreakdown(ag: TurboAssetGroupStatus): Record<string, TurboSubDimension> | undefined {
  if (ag.breakdown_axis === "data_type" || ag.breakdown_axis === "canonical_question_group") {
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

/**
 * Axes the instruments-service "Data Coverage" (TURBO) grid already expands
 * below the Instrument-Coverage-Summary card: venue, and chain for defi. The
 * grid drills these into a 4-tab ShardDetailModal, so the summary's separate
 * hierarchical shard-atom drilldown is a strict, shallower subset for any
 * asset group whose shard axes fall entirely within this set.
 */
const GRID_COVERED_SHARD_AXES: ReadonlySet<string> = new Set(["venue", "chain"]);

/**
 * True when the per-asset-group hierarchical shard drilldown in the
 * Instrument-Coverage-Summary card is redundant with the "Data Coverage" grid
 * rendered right below it — so the extra drilldown button is suppressed.
 *
 * Redundant ONLY for **instruments-service** pricing-pipeline asset groups
 * (cefi / tradfi / defi): their shard axes (venue, +chain for defi) are a
 * strict subset of the grid's venue→[chain]→ShardDetailModal drill, AND the
 * two features that would make the tree non-redundant (per-instrument_id
 * load-more; per-leaf pipeline_mode/source provenance) don't fire for the
 * single-source venue-level reference data instruments-service serves.
 *
 * NOT redundant — the drilldown STAYS — for:
 *   - instruments-service **sports** (shard axis `league_id`) + **prediction**
 *     (`canonical_question_group`): axes the grid does NOT expand.
 *   - Every other service (MTDS / features / strategy / …): the drilldown is
 *     their PRIMARY shard drilldown.
 *
 * This is an axis-comparison predicate (NOT a blanket service-name gate) —
 * plan data_status_page_ux_and_canonicalisation_2026_07_16 P5.
 */
export function isHierarchicalDrilldownRedundant(
  service: string,
  assetGroup: string,
  matrix: ShardAxisMatrixResponse | null,
): boolean {
  if (service !== "instruments-service") return false;
  const shardAxes = matrix?.shard_axes?.[service]?.[assetGroup.toLowerCase()] ?? [];
  if (shardAxes.length === 0) return false;
  return shardAxes.every((axis) => GRID_COVERED_SHARD_AXES.has(axis));
}

/**
 * Legacy-lowercase → canonical-UPPERCASE instrument_type aliases. SSOT: the
 * `InstrumentType` docstring in `unified_api_contracts._instrument_enums`
 * (spot → SPOT_PAIR, perp/perpetual → PERPETUAL, futures → FUTURE, option →
 * OPTION, pool → POOL, lending_market/lending → LENDING, lst → LST, yield →
 * YIELD_BEARING, etf → ETF). DeFi mid-migration types (A_TOKEN / DEBT_TOKEN /
 * STAKING / YIELD_BEARING / LST) are ALREADY canonical UPPERCASE and stay
 * verbatim — this map only lifts the legacy lowercase manifest values.
 */
const INSTRUMENT_TYPE_CANONICAL_ALIASES: Readonly<Record<string, string>> = {
  spot: "SPOT_PAIR",
  perp: "PERPETUAL",
  perpetual: "PERPETUAL",
  futures: "FUTURE",
  future: "FUTURE",
  option: "OPTION",
  options: "OPTION",
  pool: "POOL",
  lending_market: "LENDING",
  lending: "LENDING",
  lst: "LST",
  yield: "YIELD_BEARING",
  etf: "ETF",
};

/**
 * Display-only canonical label for an `instrument_type` breakdown value.
 *
 * Maps legacy lowercase manifest values to their canonical UPPERCASE UAC
 * `InstrumentType`. Unmapped values return **verbatim** — an already-canonical
 * value (PERPETUAL, DEX_POOL, A_TOKEN, …) is unchanged, and an unknown value is
 * NEVER fabricated or force-uppercased (honest-absence). This is DISPLAY ONLY:
 * the raw value stays the manifest secondary-axis query key (shard-atom
 * identity) and is surfaced on hover by the caller. Plan P4-A.
 */
export function canonicalInstrumentTypeLabel(rawValue: string): string {
  return INSTRUMENT_TYPE_CANONICAL_ALIASES[rawValue.toLowerCase()] ?? rawValue;
}

/**
 * P8 — true when a sports data_type entry should render the explicit
 * "global reference entity — no per-league breakdown" affordance.
 *
 * Genuinely-global sports reference data_types (LEAGUES = `global_periodic`,
 * VENUES = `global_season`) carry a `global_*` axis and have NO per-league
 * dimension by design. Silently omitting the Leagues section makes "no
 * per-league breakdown" indistinguishable from "not captured yet" — so the UI
 * renders an explicit honest-absence row instead. TEAMS is now per-league (P8
 * reclassify), so it renders the real leagues drilldown and never triggers
 * this. Plan data_status_page_ux_and_canonicalisation_2026_07_16 P8.
 */
export function showsGlobalReferenceAffordance(
  category: string,
  hasLeagues: boolean,
  axis: string | undefined,
): boolean {
  return category === "SPORTS" && !hasLeagues && typeof axis === "string" && axis.startsWith("global_");
}
