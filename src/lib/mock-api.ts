/**
 * Mock API handlers for deployment-ui.
 * Active when VITE_MOCK_API=true.
 *
 * All /api/* fetch calls are intercepted and return realistic simulated data.
 * This enables full E2E smoke testing without a real backend.
 */

/**
 * Mock API handlers for deployment-ui.
 * Active when VITE_MOCK_API=true.
 *
 * Supports:
 * - VITE_STRESS_SCENARIO: BIG_DRAWDOWN | BIG_TICKS | MISSING_DATA | BAD_SCHEMAS | STALE_DATA | HIGH_CARDINALITY
 * - VITE_MOCK_DELAY_MS: artificial delay in ms for all mock responses
 */

export const MOCK_MODE = import.meta.env.VITE_MOCK_API === "true";
const STRESS_SCENARIO = import.meta.env.VITE_STRESS_SCENARIO || "";
const MOCK_DELAY_MS = parseInt(import.meta.env.VITE_MOCK_DELAY_MS || "60", 10);

// ---- Mock data ----

const MOCK_SERVICES = [
  {
    name: "instruments-service",
    layer: 1,
    category: "data",
    dimensions: ["asset_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T14:00:00Z",
  },
  {
    name: "corporate-actions",
    layer: 1,
    category: "data",
    dimensions: ["asset_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-08T10:00:00Z",
  },
  {
    name: "market-tick-data-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["asset_group", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T16:00:00Z",
  },
  {
    name: "market-data-processing-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["asset_group", "venue", "date"],
    status: "warning",
    lastDeployed: "2026-03-07T12:00:00Z",
  },
  {
    name: "features-calendar-service",
    layer: 3,
    category: "features",
    dimensions: ["asset_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:00:00Z",
  },
  {
    name: "features-delta-one-service",
    layer: 3,
    category: "features",
    dimensions: ["asset_group", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:30:00Z",
  },
  {
    name: "features-volatility-service",
    layer: 3,
    category: "features",
    dimensions: ["asset_group", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:45:00Z",
  },
  {
    name: "features-onchain-service",
    layer: 3,
    category: "features",
    dimensions: ["asset_group", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-10T09:00:00Z",
  },
  {
    name: "ml-training-service",
    layer: 4,
    category: "ml",
    dimensions: ["model_id", "date"],
    status: "healthy",
    lastDeployed: "2026-03-08T20:00:00Z",
  },
  {
    name: "ml-inference-service",
    layer: 4,
    category: "ml",
    dimensions: ["model_id", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T11:00:00Z",
  },
];

const MOCK_DEPLOYMENTS = [
  {
    id: "dep-001",
    service: "instruments-service",
    status: "completed",
    created_at: "2026-03-10T08:00:00Z",
    updated_at: "2026-03-10T08:45:00Z",
    total_shards: 48,
    completed_shards: 48,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
    tag: "daily-run",
  },
  {
    id: "dep-002",
    service: "instruments-service",
    status: "running",
    created_at: "2026-03-10T09:30:00Z",
    updated_at: "2026-03-10T09:30:00Z",
    total_shards: 126,
    completed_shards: 78,
    failed_shards: 0,
    parameters: { compute: "cloud_run", mode: "live", cloud_provider: "gcp" },
    tag: null,
  },
  {
    id: "dep-003",
    service: "instruments-service",
    status: "failed",
    created_at: "2026-03-10T07:00:00Z",
    updated_at: "2026-03-10T07:22:00Z",
    total_shards: 72,
    completed_shards: 31,
    failed_shards: 8,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
    tag: "debug-run",
  },
  {
    id: "dep-004",
    service: "instruments-service",
    status: "completed",
    created_at: "2026-03-09T22:00:00Z",
    updated_at: "2026-03-09T23:40:00Z",
    total_shards: 12,
    completed_shards: 12,
    failed_shards: 0,
    parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
    tag: "weekly-retrain",
  },
];

const MOCK_CATEGORIES = ["equity", "crypto", "fx", "rates", "commodity", "sports"];

const MOCK_VENUES_BY_TRADING_CLASS: Record<string, string[]> = {
  equity: ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX"],
  crypto: ["Binance", "OKX", "Bybit", "Coinbase"],
  fx: ["Reuters", "Bloomberg", "EBS"],
  rates: ["CME", "EUREX", "ICE"],
  commodity: ["NYMEX", "LME", "ICE"],
  sports: ["DraftKings", "Betfair", "Pinnacle"],
};

const MOCK_QUOTA = {
  projectId: "unified-trading-prod",
  region: "asia-northeast1-c",
  cpuQuota: { used: 847, limit: 2000, unit: "vCPUs" },
  memoryQuota: { used: 3200, limit: 8192, unit: "GB" },
  instanceQuota: { used: 42, limit: 100, unit: "instances" },
  estimatedCost: {
    perShard: 0.18,
    total: null as number | null,
    currency: "USD",
  },
};

// Phase-C honest-coverage seed (2026-04-20) — matches the shape the
// Category Breakdown card + 4-state heatmap + "Show only failures" filter
// + drill-down retry button expect. Prior seed was a minimal calendar
// object that carried no `asset_groups`, which meant the full Phase-C UI
// surface never rendered in local dev / Playwright audits.
//
// Seed is deterministic: PREDICTION has high attempt / low capture (event-
// driven), CEFI/TRADFI/DEFI are dense ~99%, and every category carries
// at least one attempted_failed row in its first venue so the failures
// filter + retry affordance are both exercised.
function _mkVenue(dates_expected: number, captured: number, empty: number, failed: number) {
  const attempted = captured + empty + failed;
  const denom = Math.max(1, dates_expected);
  const attemptedDenom = Math.max(1, attempted);
  return {
    dates_found: captured,
    dates_expected,
    dates_expected_venue: dates_expected,
    dates_missing: Math.max(0, dates_expected - captured),
    missing_dates: [],
    dates_found_list: [],
    dates_missing_list: [],
    completion_pct: Math.min(Math.round((captured / denom) * 10000) / 100, 100),
    venue_start_date: "2024-01-01",
    capture_status_counts: {
      captured,
      empty_confirmed: empty,
      attempted_failed: failed,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, dates_expected - attempted),
      out_of_window: 0,
    },
    counts: {
      captured,
      empty_confirmed: empty,
      attempted_failed: failed,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, dates_expected - attempted),
      out_of_window: 0,
    },
    // Phase 4 P1: honest_coverage = (captured + empty) / (captured + empty + failed + pending)
    coverage: (() => {
      const num = captured + empty;
      const den = num + failed + Math.max(0, dates_expected - attempted);
      return den > 0 ? Math.round((num / den) * 1e6) / 1e6 : 1.0;
    })(),
    attempt_coverage_pct: Math.min(Math.round((attempted / denom) * 10000) / 100, 100),
    capture_coverage_pct: Math.min(Math.round((captured / denom) * 10000) / 100, 100),
    empty_rate: Math.round((empty / attemptedDenom) * 10000) / 10000,
    failure_rate: Math.round((failed / attemptedDenom) * 10000) / 10000,
  };
}

function _mkCategory(
  category: string,
  semantics: "dense" | "event_driven",
  dates_expected: number,
  captured: number,
  empty: number,
  failed: number,
  venues: string[],
) {
  const attempted = captured + empty + failed;
  const denom = Math.max(1, dates_expected);
  const attemptedDenom = Math.max(1, attempted);
  const capturePct = Math.min(Math.round((captured / denom) * 10000) / 100, 100);
  const attemptPct = Math.min(Math.round((attempted / denom) * 10000) / 100, 100);
  const emptyRate = attempted > 0 ? Math.round((empty / attemptedDenom) * 10000) / 10000 : null;
  const failureRate = Math.round((failed / attemptedDenom) * 10000) / 10000;

  const perVenueExpected = Math.max(1, Math.floor(dates_expected / venues.length));
  let remainingFailed = failed;
  let remainingEmpty = empty;
  let remainingCaptured = captured;
  const venuesDict: Record<string, ReturnType<typeof _mkVenue>> = {};
  const failureRateByDim: Record<string, { failure_rate: number; attempted_failed_count: number }> = {};
  venues.forEach((v, idx) => {
    const vFailed = idx === 0 ? remainingFailed : 0;
    const split = Math.max(1, venues.length - idx);
    const vEmpty = remainingEmpty > 0 ? Math.floor(remainingEmpty / split) : 0;
    const vCaptured = remainingCaptured > 0 ? Math.floor(remainingCaptured / split) : 0;
    remainingFailed -= vFailed;
    remainingEmpty -= vEmpty;
    remainingCaptured -= vCaptured;
    venuesDict[v] = _mkVenue(perVenueExpected, vCaptured, vEmpty, vFailed);
    if (vFailed > 0) {
      const vAttempted = vCaptured + vEmpty + vFailed;
      failureRateByDim[v] = {
        failure_rate: Math.round((vFailed / Math.max(1, vAttempted)) * 10000) / 10000,
        attempted_failed_count: vFailed,
      };
    }
  });

  return {
    category,
    bucket: `mock-bucket-${category.toLowerCase()}`,
    prefixes_queried: 0,
    dates_found: captured,
    dates_expected,
    dates_missing: Math.max(0, dates_expected - captured),
    shards_found: captured,
    shards_expected: dates_expected,
    completion_pct: semantics === "event_driven" ? attemptPct : capturePct,
    completion_pct_dates: capturePct,
    completion_pct_shards_weighted: capturePct,
    attempt_coverage_pct: attemptPct,
    capture_coverage_pct: capturePct,
    coverage_semantics: semantics,
    empty_rate_estimate: emptyRate,
    failure_rate: failureRate,
    capture_status_counts: {
      captured,
      empty_confirmed: empty,
      attempted_failed: failed,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, dates_expected - (captured + empty + failed)),
      out_of_window: 0,
    },
    counts: {
      captured,
      empty_confirmed: empty,
      attempted_failed: failed,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, dates_expected - (captured + empty + failed)),
      out_of_window: 0,
    },
    coverage: (() => {
      const num = captured + empty;
      const pending = Math.max(0, dates_expected - (captured + empty + failed));
      const den = num + failed + pending;
      return den > 0 ? Math.round((num / den) * 1e6) / 1e6 : 1.0;
    })(),
    venue_weighted: true,
    venue_dates_found: captured,
    venue_dates_expected: dates_expected,
    unit: category === "SPORTS" ? "fixtures" : "dates",
    effective_start_date: "2024-01-01",
    missing_dates: [],
    dates_found_list: [],
    dates_missing_list: [],
    // Default axis: `venue` for CeFi / TradFi / DeFi / Prediction / legacy
    // callers. SPORTS gets a dedicated builder below that flips to
    // `data_type` so consumers exercise the new discriminator path.
    breakdown_axis: "venue" as const,
    venues: venuesDict,
    data_types: {} as Record<string, never>,
    failure_rate_by_dimension: failureRateByDim,
  };
}

/**
 * SPORTS fixture builder — emits the 2026-04-20 `breakdown_axis: "data_type"`
 * shape so the mock exercises the UI path that reads `catData.data_types`
 * instead of `catData.venues`. Numbers are loosely modelled on the real
 * manifest output (`FIXTURES` heavy, `LEAGUES` near-complete, `FIXTURE_EVENTS`
 * empty) so coverage bars render visibly.
 */
function _mkSportsByDataType(): ReturnType<typeof _mkCategory> {
  const fixturesFound = 2094;
  const fixturesExpected = 164027;
  const fixturesMissing = fixturesExpected - fixturesFound;
  const fixturesPct = Math.round((fixturesFound / fixturesExpected) * 10000) / 100;

  const leaguesFound = 2083;
  const leaguesExpected = 2088;
  const leaguesPct = Math.round((leaguesFound / leaguesExpected) * 10000) / 100;

  const totalFound = fixturesFound + leaguesFound;
  const totalExpected = fixturesExpected + leaguesExpected;
  const pct = Math.round((totalFound / totalExpected) * 10000) / 100;

  const dataTypesDict: Record<string, ReturnType<typeof _mkVenue>> = {
    FIXTURES: {
      ..._mkVenue(fixturesExpected, fixturesFound, 0, 0),
      dates_missing: fixturesMissing,
      completion_pct: fixturesPct,
      found_shards: fixturesFound,
      expected_shards: fixturesExpected,
      missing_shards: fixturesMissing,
      unit: "fixture_dates",
      axis: "per_league_per_fixture_date",
      source: "api_football",
      expected_leagues: ["EPL", "LA_LIGA", "SERIE_A"],
      leagues: {
        EPL: {
          found_shards: 5,
          expected_shards: 1783,
          missing_shards: 1778,
          completion_pct: 0.28,
          unit: "fixture_dates",
        },
      },
    } as unknown as ReturnType<typeof _mkVenue>,
    LEAGUES: {
      ..._mkVenue(leaguesExpected, leaguesFound, 0, 0),
      completion_pct: leaguesPct,
      found_shards: leaguesFound,
      expected_shards: leaguesExpected,
      missing_shards: leaguesExpected - leaguesFound,
      unit: "daily_snapshots",
      axis: "global_periodic",
      source: "api_football",
      expected_leagues: [] as string[],
      leagues: {} as Record<string, never>,
    } as unknown as ReturnType<typeof _mkVenue>,
    FIXTURE_EVENTS: {
      ..._mkVenue(fixturesExpected, 0, 0, 0),
      completion_pct: 0,
      found_shards: 0,
      expected_shards: fixturesExpected,
      missing_shards: fixturesExpected,
      unit: "fixture_dates",
      axis: "per_league_per_fixture_date",
      source: "api_football",
      expected_leagues: ["EPL", "LA_LIGA", "SERIE_A"],
      leagues: {} as Record<string, never>,
    } as unknown as ReturnType<typeof _mkVenue>,
  };

  return {
    category: "SPORTS",
    bucket: "mock-bucket-sports",
    prefixes_queried: 0,
    dates_found: totalFound,
    dates_expected: totalExpected,
    dates_missing: totalExpected - totalFound,
    shards_found: totalFound,
    shards_expected: totalExpected,
    completion_pct: pct,
    completion_pct_dates: pct,
    completion_pct_shards_weighted: pct,
    attempt_coverage_pct: pct,
    capture_coverage_pct: pct,
    coverage_semantics: "event_driven",
    empty_rate_estimate: 0,
    failure_rate: 0,
    capture_status_counts: {
      captured: totalFound,
      empty_confirmed: 0,
      attempted_failed: 0,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, totalExpected - totalFound),
      out_of_window: 0,
    },
    counts: {
      captured: totalFound,
      empty_confirmed: 0,
      attempted_failed: 0,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, totalExpected - totalFound),
      out_of_window: 0,
    },
    coverage: Math.round((totalFound / Math.max(1, totalExpected)) * 1e6) / 1e6,
    venue_weighted: true,
    venue_dates_found: totalFound,
    venue_dates_expected: totalExpected,
    unit: "fixtures",
    effective_start_date: "2024-01-01",
    missing_dates: [],
    dates_found_list: [],
    dates_missing_list: [],
    // SPORTS flips the axis — drilldown lives under `data_types`, NOT `venues`.
    breakdown_axis: "data_type" as const,
    venues: {} as Record<string, never>,
    data_types: dataTypesDict,
    failure_rate_by_dimension: {},
  } as unknown as ReturnType<typeof _mkCategory>;
}

/**
 * PREDICTION v9 fixture builder — emits the post-v9 `breakdown_axis:
 * "canonical_question_group"` shape. The manifest atom is ONE row per
 * `(asset_group, venue, data_type=prediction_canonical_question_group,
 *  canonical_question_group, day, pipeline_mode)` with `observed_clusters =
 * {conditionId: row_count}`. The UI drilldown reads `data_types` (keyed by
 * cqg group name) and shows per-market conditionId clusters inside each row.
 *
 * Two venues (Polymarket / Kalshi) × three canonical question groups each.
 * Numbers are loosely representative of the live manifest (~16 k rows).
 */
function _mkPredictionByQuestionGroup(): ReturnType<typeof _mkCategory> {
  const mkCqgEntry = (found: number, expected: number, source: string, clusters: Record<string, number>) => ({
    ..._mkVenue(expected, found, 0, 0),
    source,
    observed_clusters: clusters,
    dates_missing_list: [] as string[],
    missing_dates: [] as string[],
    dates_found_list: ["2025-03-14", "2025-03-15", "2025-03-16"],
  });

  const dataTypesDict = {
    "crypto-price-prediction": mkCqgEntry(280, 300, "polymarket_clob", {
      "0xabc123def456abc123def456abc123def456abc1": 14200,
      "0xbcd234efa567bcd234efa567bcd234efa567bcd2": 9800,
      "0xcde345f0b678cde345f0b678cde345f0b678cde3": 6100,
    }),
    "election-outcome": mkCqgEntry(95, 120, "polymarket_clob", {
      "0xdef456012789def456012789def456012789def4": 5500,
      "0xef0567123890ef0567123890ef0567123890ef05": 4300,
    }),
    "sports-result": mkCqgEntry(410, 450, "polymarket_gamma_api", {
      "0xf06678234901f06678234901f06678234901f066": 22000,
      "0x017789345012017789345012017789345012017f": 18500,
      "0x12889a456123128899a4561231288994561231289": 11200,
    }),
    "kalshi-economic-event": mkCqgEntry(60, 80, "kalshi_rest_api", {
      KXINFL_24JAN: 3200,
      KXGDP_24Q1: 2800,
    }),
    // OTHER catch-all bucket — markets not yet mapped to a curated canonical
    // question group. Its inner `data_types` are all `out_of_scope: true`, but
    // the bucket IS in scope by design: the DataStatusTab `allOutOfScope` guard
    // MUST exempt (isPredictionCqgAxis && name === "OTHER") so no out-of-scope
    // badge/grayscale appears, and the row name span carries the operator
    // catch-all tooltip. Regression: prediction_v9_breakdown smoke.
    OTHER: {
      ...mkCqgEntry(12, 15, "polymarket_clob", {
        "0xother123abc456def789abc456def789abc456de": 200,
      }),
      data_types: {
        prediction_canonical_question_group: {
          out_of_scope: true,
          dates_found: 12,
          dates_expected: 15,
          completion_pct: 80.0,
        },
      },
    },
  };

  const totalFound = Object.values(dataTypesDict).reduce((s, v) => s + v.dates_found, 0);
  const totalExpected = Object.values(dataTypesDict).reduce((s, v) => s + v.dates_expected, 0);
  const pct = Math.round((totalFound / Math.max(1, totalExpected)) * 10000) / 100;
  const attempted = totalFound;
  const attemptPct = pct;

  return {
    category: "PREDICTION",
    asset_group: "PREDICTION",
    bucket: "mock-bucket-prediction",
    prefixes_queried: 0,
    dates_found: totalFound,
    dates_expected: totalExpected,
    dates_missing: totalExpected - totalFound,
    completion_pct: pct,
    attempt_coverage_pct: attemptPct,
    capture_coverage_pct: pct,
    coverage_semantics: "event_driven",
    empty_rate_estimate: 0,
    failure_rate: 0,
    capture_status_counts: {
      captured: totalFound,
      empty_confirmed: 0,
      attempted_failed: 0,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, totalExpected - attempted),
      out_of_window: 0,
    },
    counts: {
      captured: totalFound,
      empty_confirmed: 0,
      attempted_failed: 0,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: Math.max(0, totalExpected - attempted),
      out_of_window: 0,
    },
    coverage: Math.round((totalFound / Math.max(1, totalExpected)) * 1e6) / 1e6,
    missing_dates: [],
    dates_found_list: [],
    dates_missing_list: [],
    // Post-v9 PREDICTION: drilldown lives under `data_types` keyed by cqg name.
    breakdown_axis: "canonical_question_group" as const,
    venues: {} as Record<string, never>,
    data_types: dataTypesDict,
  } as unknown as ReturnType<typeof _mkCategory>;
}

/**
 * Annotate a venue row with MTDS honest-coverage fields
 * (deployment-api `_apply_mtds_honest_coverage`, commit 9d21ac8). Builds a
 * realistic per-data-type `honest_data_types` dict so the Phase 6e.3 UI
 * renders the "Honest coverage (data types)" panel in mock mode. Declared
 * data types with zero found shards are listed under `missing_data_types`
 * so the red "N data types missing" badge surfaces on the venue summary
 * row.
 *
 * Phase 8H extension (deployment-api commit c059e6f, 2026-04-20): each
 * dt can now opt into `shard_instrument_days` / `shard_days_legacy` units
 * via `perInstrumentDataTypes` / `legacyDataTypes` — emitting the
 * `expected_instruments` / `missing_instruments` / `per_instrument` /
 * `legacy_row_count` fields the Phase 8H UI renders.
 */
interface MtdsHonestPhase8Opts {
  /**
   * Map of per-instrument (Tier-3) data_types to their instrument universe.
   * Each dt emits `unit="shard_instrument_days"`, `expected_instruments`,
   * `missing_instruments`, and (when universe size < 20) a
   * `per_instrument` dict.
   */
  perInstrumentDataTypes?: Record<
    string,
    {
      expected_instruments: string[];
      /** Instruments with zero captured shards in the window. */
      missing_instruments: string[];
    }
  >;
  /**
   * Data types whose manifest pre-dates Phase 8C (no `instrument_id`
   * column). Emits `unit="shard_days_legacy"` + `legacy_row_count`. The
   * expected instrument universe is listed under `expected_instruments`
   * so the UI can badge them as "all missing" under the degraded
   * denominator.
   */
  legacyDataTypes?: Record<
    string,
    {
      expected_instruments: string[];
      legacy_row_count: number;
    }
  >;
}

interface MtdsHonestDtShape {
  expected_shards: number;
  found_shards: number;
  missing_shards: number;
  completion_pct: number;
  unit: "shard_days" | "shard_instrument_days" | "shard_days_legacy";
  missing_dates: string[];
  dates_found_list: string[];
  expected_instruments?: string[];
  missing_instruments?: string[];
  per_instrument?: Record<
    string,
    {
      found_shards: number;
      expected_shards: number;
      completion_pct: number;
      missing_dates?: string[];
    }
  >;
  legacy_row_count?: number;
}

function _mkMtdsHonest(
  expectedDataTypes: string[],
  missingDataTypes: string[],
  windowDays: number,
  honestAxis: string,
  opts: MtdsHonestPhase8Opts = {},
) {
  const honest: Record<string, MtdsHonestDtShape> = {};
  const perInstrumentDts = opts.perInstrumentDataTypes ?? {};
  const legacyDts = opts.legacyDataTypes ?? {};
  for (const dt of expectedDataTypes) {
    const isPerInstrument = Object.prototype.hasOwnProperty.call(perInstrumentDts, dt);
    const isLegacy = Object.prototype.hasOwnProperty.call(legacyDts, dt);
    if (isPerInstrument) {
      const { expected_instruments, missing_instruments } = perInstrumentDts[dt];
      const universe = expected_instruments.length;
      const expected = windowDays * universe;
      // One captured instrument gets (windowDays - 2) shards per instrument;
      // missing instruments contribute 0. This mirrors the aggregator's
      // per-(venue, dt, instrument, date) shard counting.
      const capturedInstruments = expected_instruments.filter((iid) => !missing_instruments.includes(iid));
      const perInstrumentFound = Math.max(0, windowDays - 2);
      const found = capturedInstruments.length * perInstrumentFound;
      const missing = Math.max(0, expected - found);
      const pct = expected === 0 ? 0 : Math.min(Math.round((found / expected) * 10000) / 100, 100);
      const shape: MtdsHonestDtShape = {
        expected_shards: expected,
        found_shards: found,
        missing_shards: missing,
        completion_pct: pct,
        unit: "shard_instrument_days",
        missing_dates: [],
        dates_found_list: found > 0 ? ["2025-01-01", "2025-01-02"] : [],
        expected_instruments: [...expected_instruments],
        missing_instruments: [...missing_instruments],
      };
      // Only populate per_instrument when the universe is small enough
      // (aggregator budget — avoids response bloat for 100+ symbols).
      if (universe < 20) {
        const perInstrument: Record<
          string,
          {
            found_shards: number;
            expected_shards: number;
            completion_pct: number;
            missing_dates?: string[];
          }
        > = {};
        for (const iid of expected_instruments) {
          const iFound = missing_instruments.includes(iid) ? 0 : perInstrumentFound;
          const iPct = windowDays === 0 ? 0 : Math.min(Math.round((iFound / windowDays) * 10000) / 100, 100);
          perInstrument[iid] = {
            found_shards: iFound,
            expected_shards: windowDays,
            completion_pct: iPct,
            missing_dates:
              iFound > 0 && iFound < windowDays
                ? ["2025-04-29", "2025-04-30"].slice(0, windowDays - iFound)
                : undefined,
          };
        }
        shape.per_instrument = perInstrument;
      }
      honest[dt] = shape;
      continue;
    }
    if (isLegacy) {
      const { expected_instruments, legacy_row_count } = legacyDts[dt];
      // Legacy denominator is degraded to venue-level shard_days — same as
      // the Phase 6e.3 shape, but flagged via `unit=shard_days_legacy` so
      // the UI can amber-badge it as migration-in-progress.
      const expected = windowDays;
      const found = 0; // legacy rows were counted via Tier-2 fallback, not shards
      const missing = expected - found;
      honest[dt] = {
        expected_shards: expected,
        found_shards: found,
        missing_shards: missing,
        completion_pct: 0,
        unit: "shard_days_legacy",
        missing_dates: ["2025-04-29", "2025-04-30"],
        dates_found_list: [],
        expected_instruments: [...expected_instruments],
        missing_instruments: [...expected_instruments],
        legacy_row_count,
      };
      continue;
    }
    // Default venue-level shard_days path (unchanged from Phase 6e.3).
    const expected = windowDays;
    const found = missingDataTypes.includes(dt) ? 0 : Math.max(0, windowDays - 2);
    const missing = Math.max(0, expected - found);
    honest[dt] = {
      expected_shards: expected,
      found_shards: found,
      missing_shards: missing,
      completion_pct: expected === 0 ? 0 : Math.min(Math.round((found / expected) * 10000) / 100, 100),
      unit: "shard_days",
      missing_dates: missing > 0 ? ["2025-04-29", "2025-04-30"].slice(0, missing) : [],
      dates_found_list: found > 0 ? ["2025-01-01", "2025-01-02"] : [],
    };
  }
  return {
    expected_data_types: [...expectedDataTypes].sort(),
    missing_data_types: [...missingDataTypes].sort(),
    honest_data_types: honest,
    honest_axis: honestAxis,
  };
}

/**
 * CEFI fixture with MTDS honest-coverage annotations (Phase 6e.3 +
 * Phase 8H). Emulates deployment-api's aggregator output for a MTDS
 * service:
 *
 * - BINANCE-SPOT: every declared dt captured at venue-level (baseline).
 * - BINANCE-FUTURES: mixes the three Phase 8 unit axes —
 *     • `liquidations` → venue-level (`shard_days`)
 *     • `trades` → pre-Phase-8C manifest (`shard_days_legacy`, amber
 *       migration badge, 10 expected instruments all missing,
 *       `legacy_row_count=486`)
 *     • `derivative_ticker` → Tier-3 per-instrument
 *       (`shard_instrument_days`, 3 expected instruments with 1 captured
 *       + 2 missing, `per_instrument` dict populated).
 * - DERIBIT: missing both derivative_ticker and options_chain (venue-level).
 */
function _mkCefiMtdsHonest(): ReturnType<typeof _mkCategory> {
  const base = _mkCategory("CEFI", "dense", 120, 118, 1, 1, ["BINANCE-SPOT", "BINANCE-FUTURES", "DERIBIT"]);
  const venuesDict = base.venues as Record<string, ReturnType<typeof _mkVenue>>;
  const HONEST_AXIS = "per_venue_per_data_type_per_day";
  // BINANCE-SPOT — all declared dts captured (no missing).
  venuesDict["BINANCE-SPOT"] = {
    ...venuesDict["BINANCE-SPOT"],
    ..._mkMtdsHonest(["trades", "orderbook_snapshot_1s", "ticker"], [], 120, HONEST_AXIS),
  } as ReturnType<typeof _mkVenue>;
  // BINANCE-FUTURES — mixes all three Phase 8 unit axes.
  const binFutPerps = [
    "BTC-USDT",
    "ETH-USDT",
    "SOL-USDT",
    "XRP-USDT",
    "BNB-USDT",
    "ADA-USDT",
    "DOGE-USDT",
    "AVAX-USDT",
    "MATIC-USDT",
    "LINK-USDT",
  ];
  venuesDict["BINANCE-FUTURES"] = {
    ...venuesDict["BINANCE-FUTURES"],
    ..._mkMtdsHonest(
      ["trades", "liquidations", "derivative_ticker", "futures_chain"],
      ["futures_chain"],
      120,
      HONEST_AXIS,
      {
        perInstrumentDataTypes: {
          derivative_ticker: {
            expected_instruments: ["BTC-USDT", "ETH-USDT", "SOL-USDT"],
            missing_instruments: ["SOL-USDT"],
          },
        },
        legacyDataTypes: {
          trades: {
            expected_instruments: binFutPerps,
            legacy_row_count: 486,
          },
        },
      },
    ),
  } as ReturnType<typeof _mkVenue>;
  // DERIBIT — missing both derivative_ticker and options_chain.
  venuesDict["DERIBIT"] = {
    ...venuesDict["DERIBIT"],
    ..._mkMtdsHonest(
      ["trades", "orderbook_snapshot_1s", "derivative_ticker", "options_chain"],
      ["derivative_ticker", "options_chain"],
      120,
      HONEST_AXIS,
    ),
  } as ReturnType<typeof _mkVenue>;
  return base;
}

/**
 * DEFI fixture with Phase 8H per-instrument honest-coverage. Wave 8G
 * seeded UAC instrument-ref for DEFI protocols, so UNISWAP_V3-ETHEREUM now
 * declares 20 dex_pools and AAVE_V3-ETHEREUM declares 10 lending_indices
 * instruments.  The 20-pool universe sits exactly at the aggregator's
 * `per_instrument` budget threshold (< 20) so it is intentionally
 * emitted WITHOUT a `per_instrument` dict — mirroring the live aggregator
 * behaviour and letting the UI exercise the "large universe" branch.
 */
function _mkDefiMtdsHonest(): ReturnType<typeof _mkCategory> {
  const base = _mkCategory("DEFI", "dense", 110, 102, 5, 3, ["UNISWAP_V3-ETHEREUM", "AAVE_V3-ETHEREUM"]);
  const venuesDict = base.venues as Record<string, ReturnType<typeof _mkVenue>>;
  const HONEST_AXIS = "per_venue_per_data_type_per_day";
  const uniPools = Array.from({ length: 20 }, (_v, i) => `POOL-${String(i + 1).padStart(2, "0")}`);
  const aaveIndices = Array.from({ length: 10 }, (_v, i) => `IDX-${String(i + 1).padStart(2, "0")}`);
  venuesDict["UNISWAP_V3-ETHEREUM"] = {
    ...venuesDict["UNISWAP_V3-ETHEREUM"],
    ..._mkMtdsHonest(["dex_pools"], [], 90, HONEST_AXIS, {
      perInstrumentDataTypes: {
        // 20-element universe — hits the aggregator's "<20" gate, so
        // per_instrument is intentionally omitted to mirror live shape.
        dex_pools: {
          expected_instruments: uniPools,
          missing_instruments: uniPools.slice(17), // last 3 missing
        },
      },
    }),
  } as ReturnType<typeof _mkVenue>;
  venuesDict["AAVE_V3-ETHEREUM"] = {
    ...venuesDict["AAVE_V3-ETHEREUM"],
    ..._mkMtdsHonest(["lending_indices"], [], 90, HONEST_AXIS, {
      perInstrumentDataTypes: {
        // 10-element universe — under the <20 budget, so per_instrument
        // detail is populated.
        lending_indices: {
          expected_instruments: aaveIndices,
          missing_instruments: [aaveIndices[3], aaveIndices[7]],
        },
      },
    }),
  } as ReturnType<typeof _mkVenue>;
  return base;
}

const _MOCK_CATS = {
  CEFI: _mkCefiMtdsHonest(),
  TRADFI: _mkCategory("TRADFI", "dense", 100, 97, 2, 1, ["DATABENTO-DBEQ", "DATABENTO-GLBX"]),
  DEFI: _mkDefiMtdsHonest(),
  // SPORTS uses the new `breakdown_axis: "data_type"` shape (2026-04-20).
  // Drilldown lives under `data_types`, not `venues`.
  SPORTS: _mkSportsByDataType(),
  // PREDICTION uses the post-v9 `breakdown_axis: "canonical_question_group"` shape.
  // Drilldown lives under `data_types` keyed by cqg group name; each entry
  // carries `observed_clusters` (conditionId → row_count) + `source`.
  PREDICTION: _mkPredictionByQuestionGroup(),
};

const _MOCK_TOTAL_EXPECTED = Object.values(_MOCK_CATS).reduce((acc, c) => acc + c.dates_expected, 0);
const _MOCK_TOTAL_CAPTURED = Object.values(_MOCK_CATS).reduce((acc, c) => acc + c.dates_found, 0);

const MOCK_DATA_STATUS = {
  service: "instruments-service",
  date_range: { start: "2025-01-01", end: "2025-04-30", days: 120 },
  mode: "turbo" as const,
  sub_dimension: "venue" as const,
  overall_completion_pct: Math.min(
    Math.round((_MOCK_TOTAL_CAPTURED / Math.max(1, _MOCK_TOTAL_EXPECTED)) * 10000) / 100,
    100,
  ),
  overall_completion_pct_dates: Math.min(
    Math.round((_MOCK_TOTAL_CAPTURED / Math.max(1, _MOCK_TOTAL_EXPECTED)) * 10000) / 100,
    100,
  ),
  overall_completion_pct_shards_weighted: Math.min(
    Math.round((_MOCK_TOTAL_CAPTURED / Math.max(1, _MOCK_TOTAL_EXPECTED)) * 10000) / 100,
    100,
  ),
  overall_dates_found: _MOCK_TOTAL_CAPTURED,
  overall_dates_expected: _MOCK_TOTAL_EXPECTED,
  overall_shards_found: _MOCK_TOTAL_CAPTURED,
  overall_shards_expected: _MOCK_TOTAL_EXPECTED,
  total_missing: Math.max(0, _MOCK_TOTAL_EXPECTED - _MOCK_TOTAL_CAPTURED),
  migration_in_progress: false,
  asset_groups: _MOCK_CATS,
  mock: true,
};

// Conforms to the ChecklistResponse contract (src/types/index.ts): readiness_percent
// + the four count fields + per-category {display_name, percent, total/completed} +
// blocking_items[]. The prior {overallScore, isBlocked, score, label, detail} shape was
// stale and omitted blocking_items/readiness_percent, so ReadinessTab's
// `checklist.blocking_items.length` read undefined and the tab crashed into the
// per-tab ErrorBoundary in mock mode (the page.route fix in stateful-flows.spec.ts is
// dead under VITE_MOCK_API — the in-app mock wins).
const MOCK_CHECKLIST = {
  service: "instruments-service",
  last_updated: "2026-03-10T08:00:00Z",
  readiness_percent: 75,
  total_items: 8,
  completed_items: 5,
  partial_items: 2,
  pending_items: 1,
  not_applicable_items: 0,
  categories: [
    {
      name: "data_coverage",
      display_name: "Data Coverage",
      percent: 83,
      total_items: 3,
      completed_items: 2,
      items: [
        {
          id: "c1",
          description: "Equity coverage ≥ 95%",
          status: "done",
          notes: "98.2% complete",
          verified_date: "2026-03-10",
          blocking: false,
        },
        {
          id: "c2",
          description: "Crypto coverage ≥ 90%",
          status: "done",
          notes: "94.1% complete",
          verified_date: "2026-03-10",
          blocking: false,
        },
        {
          id: "c3",
          description: "FX coverage ≥ 90%",
          status: "partial",
          notes: "88.5% complete (below 90% threshold)",
          verified_date: null,
          blocking: false,
        },
      ],
    },
    {
      name: "build_health",
      display_name: "Build Health",
      percent: 100,
      total_items: 2,
      completed_items: 2,
      items: [
        {
          id: "b1",
          description: "Latest build passing",
          status: "done",
          notes: "Build #1847 — 2026-03-10T08:00Z",
          verified_date: "2026-03-10",
          blocking: false,
        },
        {
          id: "b2",
          description: "No critical CVEs",
          status: "done",
          notes: "0 critical, 2 low severity",
          verified_date: "2026-03-10",
          blocking: false,
        },
      ],
    },
    {
      name: "deployment_readiness",
      display_name: "Deployment Readiness",
      percent: 50,
      total_items: 3,
      completed_items: 1,
      items: [
        {
          id: "d1",
          description: "Canary deployment validated",
          status: "pending",
          notes: "No canary run in last 7 days",
          verified_date: null,
          blocking: true,
        },
        {
          id: "d2",
          description: "Rollback tested",
          status: "done",
          notes: "Rollback tested 2026-03-08",
          verified_date: "2026-03-08",
          blocking: false,
        },
        {
          id: "d3",
          description: "Alert thresholds configured",
          status: "partial",
          notes: "P99 latency alert missing",
          verified_date: null,
          blocking: false,
        },
      ],
    },
  ],
  blocking_items: [
    {
      id: "d1",
      description: "Canary deployment validated",
      category: "Deployment Readiness",
      notes: "No canary run in last 7 days",
    },
  ],
};

// ---- Route handler ----

function delay(ms = MOCK_DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Stress overrides ----
function getStressDeployments(): typeof MOCK_DEPLOYMENTS {
  if (STRESS_SCENARIO === "MISSING_DATA") return [];
  if (STRESS_SCENARIO === "HIGH_CARDINALITY") {
    return Array.from({ length: 500 }, (_, i) => ({
      id: `dep-hc-${String(i).padStart(4, "0")}`,
      service: MOCK_SERVICES[i % MOCK_SERVICES.length].name,
      status: ["completed", "running", "failed", "queued"][i % 4],
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      updated_at: new Date(Date.now() - i * 1800000).toISOString(),
      total_shards: Math.floor(Math.random() * 200) + 10,
      completed_shards: Math.floor(Math.random() * 100),
      failed_shards: i % 4 === 2 ? Math.floor(Math.random() * 20) : 0,
      parameters: { compute: "vm", mode: "batch", cloud_provider: "gcp" },
      tag: null,
    }));
  }
  if (STRESS_SCENARIO === "BIG_DRAWDOWN") {
    return MOCK_DEPLOYMENTS.map((d) => ({
      ...d,
      status: "failed",
      failed_shards: d.total_shards,
    }));
  }
  return MOCK_DEPLOYMENTS;
}

function getStressServices(): typeof MOCK_SERVICES {
  if (STRESS_SCENARIO === "MISSING_DATA") return [];
  if (STRESS_SCENARIO === "HIGH_CARDINALITY") {
    return Array.from({ length: 100 }, (_, i) => ({
      name: `service-${String(i).padStart(3, "0")}`,
      layer: (i % 6) + 1,
      category: ["data", "ingestion", "features", "ml", "execution", "monitoring"][i % 6],
      dimensions: ["asset_group", "date"],
      status: i % 10 === 0 ? "warning" : "healthy",
      lastDeployed: new Date(Date.now() - i * 86400000).toISOString(),
    }));
  }
  return MOCK_SERVICES;
}

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- Repo-CI dashboard mock data (keep in lockstep with deployment-api repo_ci.py) ----

interface MockRepoCiPr {
  repo: string;
  number: number;
  title: string;
  base: string;
  head: string;
  url: string;
  age_min: number;
  auto_merge: boolean;
  merge_state: string;
  failed_check: boolean;
  v2_present: boolean;
  stuck_class: string | null;
  blocking_checks?: { name: string; state: string; description: string }[];
}

function mockRepoCiPr(
  repo: string,
  number: number,
  base: string,
  stuckClass: string | null,
  state: string,
): MockRepoCiPr {
  return {
    repo,
    number,
    title: `promote live-defi-rollout -> ${base}`,
    base,
    head: "live-defi-rollout",
    url: `https://github.com/IggyIkenna/${repo}/pull/${number}`,
    age_min: 95,
    auto_merge: true,
    merge_state: state,
    failed_check: stuckClass === "failing_check",
    v2_present: stuckClass === null || stuckClass === "failing_check" || stuckClass === "automerge_stuck",
    stuck_class: stuckClass,
    // A failing-check PR carries the human reason (the AWS-CodeBuild PR-approval gate that
    // stranded two drain PRs invisibly on 2026-06-15).
    blocking_checks:
      stuckClass === "failing_check"
        ? [
            {
              name: `AWS CodeBuild ap-northeast-1 (${repo})`,
              state: "failure",
              description: "Pull request approval required for starting a build",
            },
          ]
        : undefined,
  };
}

function mockRepoCiRow(
  repo: string,
  repoType: string,
  ciStatus: string,
  prs: MockRepoCiPr[],
  sitPending: boolean,
  sitStuck: boolean,
  tier: string = "service",
  blockedBy: { name: string; tier: string; ci_status: string }[] = [],
  blocking: string[] = [],
  opts: {
    deltas?: { base: string; head: string; ahead_by: number; behind_by: number; files_changed: number }[];
    lagMin?: number | null;
    drainStalled?: boolean;
  } = {},
) {
  // Per-branch v2 conclusion: FAILING → main red (the "main red, LDR recovered" shape);
  // STAGING_GREEN → LDR red (actively-broken shape); else all green. Mirrors the deployment-api mock.
  const branchCi: Record<string, string | null> =
    ciStatus === "FAILING"
      ? { "live-defi-rollout": "success", staging: "success", main: "failure" }
      : ciStatus === "STAGING_GREEN"
        ? { "live-defi-rollout": "failure", staging: "success", main: "success" }
        : { "live-defi-rollout": "success", staging: "success", main: "success" };
  return {
    repo,
    repo_type: repoType,
    ci_status: ciStatus,
    branch_ci: branchCi,
    branches: [
      { branch: "live-defi-rollout", sha: "abc1234567", committed_at: "2026-06-10T08:00:00Z" },
      { branch: "staging", sha: "abc1200567", committed_at: "2026-06-10T07:30:00Z" },
      { branch: "main", sha: "abc1100567", committed_at: "2026-06-10T06:00:00Z" },
    ],
    deltas: opts.deltas ?? [
      { base: "staging", head: "live-defi-rollout", ahead_by: 2, behind_by: 0, files_changed: 3 },
      { base: "main", head: "staging", ahead_by: 1, behind_by: 0, files_changed: 1 },
      { base: "main", head: "live-defi-rollout", ahead_by: 3, behind_by: 0, files_changed: 4 },
    ],
    open_prs: prs,
    sit: {
      in_breaking_pending: sitPending,
      staging_locked: sitPending,
      staging_locked_reason: sitPending ? "breaking cascade in flight" : null,
      last_sit_run_status: sitStuck ? "failure" : "success",
      last_sit_run_age_min: sitStuck ? 240 : 12,
      stuck_in_sit: sitStuck,
    },
    image: {
      // A FAILING repo's latest build is red, but a prior SUCCESS is still surfaced
      // (last_success_*) so the UI's "last good image" path is exercised.
      last_build_status: ciStatus === "FAILING" ? "FAILURE" : "SUCCESS",
      last_build_sha: ciStatus === "FAILING" ? "fae1ed0" : "aaa1111",
      last_build_time: ciStatus === "FAILING" ? "2026-06-11T09:15:00Z" : "2026-06-11T07:30:00Z",
      last_build_log_url: "https://console.cloud.google.com/cloud-build/builds/mock-latest",
      last_success_sha: "aaa1111",
      last_success_time: "2026-06-11T07:30:00Z",
      last_success_log_url: "https://console.cloud.google.com/cloud-build/builds/mock-success",
      deployed_version: "1.2.0",
      image_stale: ciStatus === "FAILING",
    },
    // N2: last-green main — when main is red (FAILING) the last green ≠ head (an earlier green
    // sha); else the head IS green so last-green = the main head.
    last_green_main:
      ciStatus === "FAILING"
        ? { sha: "ab09999000", at: "2026-06-09T20:00:00Z" }
        : { sha: "abc1100567", at: "2026-06-10T06:00:00Z" },
    // G6: every mock row is LDR-ahead-of-main (delta ahead_by=3) so it has a lag; FAILING repos
    // sit longer (drain stuck). >60min so the lag-chip renders red.
    main_lag_age_min: opts.lagMin === undefined ? (ciStatus === "FAILING" ? 185 : 95) : opts.lagMin,
    // promotion-drain follow-up: FAILING repo seeds the drain-stalled case (content ahead + a
    // stale/failing drain leg); healthy repos are draining so not stalled.
    drain_stalled: opts.drainStalled ?? ciStatus === "FAILING",
    // dep-order (operator 2026-06-19): tier + deps holding this repo + repos this repo holds.
    tier,
    blocked_by: blockedBy,
    blocking,
  };
}

function mockRepoCiOverview() {
  const UAC_DEP = { name: "unified-api-contracts", tier: "0", ci_status: "STAGING_GREEN" };
  const rows = [
    // tier-0 contracts lib STUCK at STAGING_GREEN — the dep-order ROOT blocker holding the fleet.
    mockRepoCiRow(
      "unified-api-contracts",
      "library",
      "STAGING_GREEN",
      [],
      false,
      false,
      "0",
      [],
      ["market-tick-data-service", "strategy-service"],
    ),
    mockRepoCiRow("unified-trading-library", "library", "MAIN_GREEN", [], false, false, "1"),
    // The healthy in-sync reference — content fully promoted to main (all hops 0 files, no lag), so
    // classifyStall = none → no hop pills, "—" stall reason. Proves the dashboard doesn't false-flag.
    mockRepoCiRow("client-reporting-api", "service", "MAIN_GREEN", [], false, false, "service", [], [], {
      deltas: [
        { base: "staging", head: "live-defi-rollout", ahead_by: 0, behind_by: 0, files_changed: 0 },
        { base: "main", head: "staging", ahead_by: 0, behind_by: 0, files_changed: 0 },
        { base: "main", head: "live-defi-rollout", ahead_by: 0, behind_by: 0, files_changed: 0 },
      ],
      lagMin: null,
    }),
    mockRepoCiRow(
      "market-tick-data-service",
      "service",
      "STAGING_GREEN",
      [mockRepoCiPr("market-tick-data-service", 41, "main", "conflicting", "dirty")],
      false,
      false,
      "service",
      [UAC_DEP],
    ),
    mockRepoCiRow(
      "instruments-service",
      "service",
      "STAGING_PENDING",
      [mockRepoCiPr("instruments-service", 17, "staging", "v2_never_reported", "blocked")],
      false,
      false,
    ),
    mockRepoCiRow(
      "execution-service",
      "service",
      "FAILING",
      [
        mockRepoCiPr("execution-service", 88, "main", "skip_ci_jammed", "blocked"),
        mockRepoCiPr("execution-service", 89, "staging", "failing_check", "blocked"),
      ],
      false,
      false,
    ),
    mockRepoCiRow(
      "strategy-service",
      "service",
      "STAGING_GREEN",
      [mockRepoCiPr("strategy-service", 52, "main", "automerge_stuck", "blocked")],
      false,
      false,
      "service",
      [UAC_DEP],
    ),
    mockRepoCiRow("greeks-service", "service", "STAGING_GREEN", [], true, true),
    // agent-orchestrator class — the staging→main PROMOTER STALL. LDR→staging is fully drained
    // (files 0), but staging is 144 files / 326 commits ahead of main with NO open PR, while
    // ci_status reads MAIN_GREEN — the "status lies" case the dep-order card cannot catch (only the
    // git-delta lag chip does). Exercises classifyStall=staging-to-main + ciStatusStale + the
    // HopPills / StallReasonChip render path.
    mockRepoCiRow("agent-orchestrator", "tool", "MAIN_GREEN", [], false, false, "service", [], [], {
      deltas: [
        { base: "staging", head: "live-defi-rollout", ahead_by: 96, behind_by: 0, files_changed: 0 },
        { base: "main", head: "staging", ahead_by: 326, behind_by: 2, files_changed: 144 },
        { base: "main", head: "live-defi-rollout", ahead_by: 420, behind_by: 0, files_changed: 71 },
      ],
      lagMin: 12180,
      drainStalled: false,
    }),
  ];
  const stuckPrs = rows.flatMap((row) => row.open_prs.filter((pr) => pr.stuck_class));
  const stuckInSit = rows.filter((row) => row.sit.stuck_in_sit).map((row) => row.repo);
  return {
    generated_at: new Date().toISOString(),
    source: "mock",
    repos: rows,
    stuck_prs: stuckPrs,
    stuck_in_sit: stuckInSit,
    sit_last_run: {
      url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/12345",
      status: "in_progress",
      conclusion: null,
      age_min: 18,
      jobs: [
        { name: "sit / unified-trading-library", status: "completed", conclusion: "success" },
        { name: "sit / greeks-service", status: "completed", conclusion: "failure" },
        { name: "sit / execution-service", status: "in_progress", conclusion: null },
      ],
    },
    // Degraded-repo errors[] — a per-repo GitHub-5xx degradation is VISIBLE, not
    // silently dropped (mirrors deployment-api _mock_overview seeding one error).
    errors: [{ repo: "ml-service", error: "GitHub HTTP 502 on compare (degraded; row dropped)" }],
    // Promotion-blocked[] — repos parked out of staging→main (G1). greeks-service is
    // quarantined (CRITICAL); execution-service is failing-but-not-yet-quarantined (WARNING).
    promotion_blocked: [
      {
        repo: "greeks-service",
        failures: 3,
        quarantined: true,
        since: "2026-06-11T08:00:00Z",
        attempts: 3,
        escalated: true,
      },
      { repo: "execution-service", failures: 1, quarantined: false },
    ],
    // Routine promote drain (PM-central, every 15 min) — both legs green + recent (healthy case),
    // distinct from the Breaking cascade/SIT panel above.
    promotion_drain: {
      ldr_to_staging: {
        status: "completed",
        conclusion: "success",
        age_min: 8,
        url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/55501",
      },
      ldr_to_main: {
        status: "completed",
        conclusion: "success",
        age_min: 5,
        url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/55502",
      },
    },
    // Semver-agent health (G2) — breaker ARMED (3 pending bumps ≥ threshold) so the panel
    // renders the alert state.
    semver_health: {
      last_run_status: "completed",
      last_run_conclusion: "success",
      last_run_age_min: 12,
      last_run_url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/55503",
      pending_bump_count: 3,
      pending_bump_repos: ["execution-service", "mtds", "alerting-service"],
      breaker_armed: true,
      breaker_threshold: 3,
    },
    // Dep-order HOLDS (operator 2026-06-19) — distinct from promotion_blocked (failure-quarantine):
    // a tier-0 dep (unified-api-contracts) at STAGING_GREEN holds 2 service repos from main.
    promotion_held: {
      held_repos: ["market-tick-data-service", "strategy-service"],
      root_blockers: [
        {
          repo: "unified-api-contracts",
          tier: "0",
          ci_status: "STAGING_GREEN",
          blocking_count: 2,
          main_files_behind: 35,
        },
      ],
    },
  };
}

// Fleet git-health proxy (mirrors deployment-api _mock_fleet_git_health) — one laptop
// host with a clean slot + a drift-violating slot, so the Fleet Git tab renders the
// proxied data AND the orchestrator deep-link.
function mockFleetGitHealth() {
  return {
    available: true,
    reason: "",
    orchestrator_url: "https://api.agent-orchestrator.odum-research.com",
    data: {
      generated_at: new Date().toISOString(),
      scope: "fleet",
      summary: {
        hosts: 1,
        slots: 2,
        repos_total: 3,
        dirty: 1,
        behind: 1,
        ahead: 1,
        diverged: 0,
        clean: 1,
        drift_violations: 1,
        reporter_stale_slots: 0,
        ff_cron_stale_slots: 0,
      },
      hosts: [
        {
          host: "laptop",
          vm_id: null,
          slots: [
            {
              slot_id: 1,
              host: "laptop",
              reported_at: new Date().toISOString(),
              reporter_stale: false,
              ff_pull_last_run: new Date().toISOString(),
              ff_pull_last_result: "ok",
              ff_cron_stale: false,
              repos: [
                {
                  name: "unified-trading-pm",
                  state: "clean",
                  dirty_files: 0,
                  ahead: 0,
                  behind: 0,
                  local_sha: "abc1234",
                  not_clean_since: null,
                  unpushed_plans: [],
                  drift_violation: false,
                },
              ],
            },
            {
              slot_id: 3,
              host: "laptop",
              reported_at: new Date().toISOString(),
              reporter_stale: false,
              ff_pull_last_run: new Date().toISOString(),
              ff_pull_last_result: "skip:dirty",
              ff_cron_stale: false,
              repos: [
                {
                  name: "mtds",
                  state: "dirty",
                  dirty_files: 3,
                  ahead: 0,
                  behind: 1,
                  local_sha: "def5678",
                  not_clean_since: new Date().toISOString(),
                  unpushed_plans: [],
                  drift_violation: false,
                },
                {
                  name: "execution-service",
                  state: "ahead",
                  dirty_files: 0,
                  ahead: 2,
                  behind: 0,
                  local_sha: "fed9876",
                  not_clean_since: new Date().toISOString(),
                  unpushed_plans: [],
                  drift_violation: true,
                },
              ],
            },
          ],
        },
      ],
      drift_violations: [
        { host: "laptop", slot: "3", repo: "execution-service", state: "ahead", ahead: "2", behind: "0" },
      ],
      vm_errors: [],
    },
  };
}

function mockRepoCiDetail(repo: string) {
  const overview = mockRepoCiOverview();
  const row = overview.repos.find((r) => r.repo === repo) ?? overview.repos[0];
  return {
    repo: row.repo,
    repo_type: row.repo_type,
    ci_status: row.ci_status,
    generated_at: new Date().toISOString(),
    source: "mock",
    branches: row.branches,
    deltas: row.deltas,
    history: row.branches.map((branch) => ({
      branch: branch.branch,
      commits: Array.from({ length: 5 }, (_, i) => ({
        sha: `${branch.sha ?? "abc0000"}${i}`,
        message: `feat: change ${i} on ${branch.branch}`,
        author: "ikennaigboaka [slot-3·laptop]",
        committed_at: "2026-06-10T07:00:00Z",
        v2_conclusion: i % 3 ? "success" : "failure",
      })),
    })),
    open_prs: row.open_prs,
    sit: row.sit,
    image: row.image,
    // N2-followup: per-branch last-green. LDR + main green at their heads; staging's last green
    // is an EARLIER sha (its head is red/pending) so the drilldown shows the three axes can differ.
    last_green: {
      "live-defi-rollout": { sha: row.branches[0]?.sha ?? "abc1234", at: "2026-06-10T07:00:00Z" },
      staging: { sha: "ab09111", at: "2026-06-09T22:00:00Z" },
      main: row.last_green_main ?? null,
    },
  };
}

function mockRepoCiAlerts() {
  const entries = [
    {
      kind: "alert",
      timestamp: "2026-06-10T12:10:00Z",
      repo: "unified-trading-pm",
      workflow_name: "ci-status-update",
      severity: "CRITICAL",
      conclusion: "failure",
      message: "CI REGRESSION: deployment-api is now FAILING (was MAIN_GREEN)",
      run_url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/1",
    },
    {
      kind: "alert",
      timestamp: "2026-06-10T12:50:00Z",
      repo: "unified-trading-pm",
      workflow_name: "ci-status-update",
      severity: "INFO",
      conclusion: "success",
      message: "RESOLVED: deployment-api recovered (FAILING -> MAIN_GREEN)",
      run_url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/2",
    },
    {
      kind: "alert",
      timestamp: "2026-06-10T13:00:00Z",
      repo: "unified-trading-pm",
      workflow_name: "sit-unlock",
      severity: "INFO",
      conclusion: "success",
      message: "SIT PASSED — staging UNLOCKED, breaking_pending cleared.",
      run_url: "https://github.com/IggyIkenna/unified-trading-pm/actions/runs/3",
    },
    {
      kind: "alert",
      timestamp: "2026-06-10T13:05:00Z",
      repo: "execution-service",
      workflow_name: "quality-gates-v2",
      severity: "CRITICAL",
      conclusion: "failure",
      message: "quality-gates-v2 FAILED on main",
      run_url: "https://github.com/IggyIkenna/execution-service/actions/runs/4",
    },
  ];
  const byStream = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = `${e.repo}/${e.workflow_name}`;
    byStream.set(k, [...(byStream.get(k) ?? []), e]);
  }
  const streams = [...byStream.entries()].map(([, es]) => {
    const ordered = [...es].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {
      repo: ordered[0].repo,
      workflow_name: ordered[0].workflow_name,
      current: ordered[ordered.length - 1],
      previous: ordered.length > 1 ? ordered[ordered.length - 2] : null,
      count: ordered.length,
    };
  });
  const rank = (e: { severity: string | null; conclusion: string | null }) =>
    e.severity === "CRITICAL" || e.conclusion === "failure" ? 0 : e.severity === "WARNING" ? 1 : 2;
  streams.sort((a, b) => rank(a.current) - rank(b.current));
  return {
    generated_at: new Date().toISOString(),
    source: "mock",
    alerts: [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    streams,
  };
}

async function handleRoute(url: string, init?: RequestInit): Promise<Response> {
  await delay();
  const method = init?.method?.toUpperCase() ?? "GET";
  const path = url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/\?.*$/, "")
    .replace("/api/v1/", "/api/");

  // Test observability (mirrors __mockErrors): when a spec opts in by seeding window.__mockRequests,
  // record the RAW request URL (query string intact) so playwright can assert query params — e.g. the
  // repo-CI GCP/AWS ?provider= toggle — without a network round-trip the in-process mock never makes.
  const reqLog = (window as typeof window & { __mockRequests?: string[] }).__mockRequests;
  if (reqLog) reqLog.push(url);

  // Test-injected error overrides — set window.__mockErrors before page.goto()
  // to simulate backend failures without Playwright route mocks.
  const testErrors = (window as typeof window & { __mockErrors?: Array<{ pattern: string; status: number }> })
    .__mockErrors;
  if (testErrors) {
    for (const entry of testErrors) {
      if (path.startsWith(entry.pattern) || path === entry.pattern) {
        return json({ error: "Mock forced error", path }, entry.status);
      }
    }
  }

  // Repo-CI dashboard (mirrors deployment-api routes/repo_ci.py mock fixtures —
  // every stuck class + stuck-in-SIT + the live SIT-run panel, pinned by the
  // playwright regression spec tests/e2e/repos-stuck-panel.spec.ts)
  if (path === "/api/repo-ci/alerts") {
    return json(mockRepoCiAlerts());
  }
  if (path === "/api/repo-ci/overview") {
    return json(mockRepoCiOverview());
  }
  if (path === "/api/repo-ci/fleet-git-health") {
    return json(mockFleetGitHealth());
  }
  // GitHub rate-budget tracker — the whole fleet shares ONE PAT (5000/hr REST).
  // Mock seeds a healthy REST pool + a low GraphQL pool so the tracker's
  // green/amber/red toning is visible (mirrors deployment-api gh-rate-limit).
  if (path === "/api/repos/gh-rate-limit") {
    const reset = Math.floor(Date.now() / 1000) + 1800;
    return json({
      fetched_at: new Date().toISOString().slice(0, 16) + "Z",
      resources: {
        core: { limit: 5000, remaining: 4200, used: 800, reset },
        graphql: { limit: 5000, remaining: 600, used: 4400, reset },
        search: { limit: 30, remaining: 30, used: 0, reset },
      },
      // The GitHub App ("uts-ci-poller") pool — a SEPARATE 5000/hr budget the
      // fleet's CI pollers draw from. Seeded healthy so both rows render.
      app: {
        resources: {
          core: { limit: 5000, remaining: 4950, used: 50, reset },
          graphql: { limit: 5000, remaining: 5000, used: 0, reset },
        },
      },
    });
  }
  {
    const detailMatch = path.match(/^\/api\/repo-ci\/([^/]+)\/detail$/);
    if (detailMatch) {
      return json(mockRepoCiDetail(detailMatch[1]));
    }
  }

  // Health
  if (path === "/api/health") {
    return json({
      status: "healthy",
      uptime: 99.97,
      version: "0.1.1",
      mock: true,
    });
  }

  // Services overview (must come before /api/services to avoid partial match)
  if (path === "/api/services/overview") {
    return json({
      services: MOCK_SERVICES.map((s) => ({
        ...s,
        shards: Math.floor(Math.random() * 200) + 20,
      })),
    });
  }

  // Services list
  if (path === "/api/services") {
    return json({ services: getStressServices() });
  }

  // Service sub-routes
  if (path.match(/^\/api\/services\/(.+)\/dimensions$/)) {
    const svc = MOCK_SERVICES.find((s) => path.includes(s.name));
    const dimNames: string[] = svc?.dimensions ?? ["date"];
    const dimensionObjects = dimNames.map((name) => {
      if (name === "date") {
        return {
          name: "date",
          type: "date_range",
          description: "Date range for batch processing",
          granularity: "daily",
        };
      }
      if (name === "asset_group") {
        return {
          name: "asset_group",
          type: "fixed",
          description: "Asset group (CEFI, TRADFI, DEFI, …)",
          values: ["cefi", "tradfi", "defi"],
        };
      }
      if (name === "venue") {
        return {
          name: "venue",
          type: "fixed",
          description: "Trading venue",
          values: [],
        };
      }
      if (name === "feature_group") {
        return {
          name: "feature_group",
          type: "fixed",
          description: "Feature group",
          values: [],
        };
      }
      return { name, type: "fixed", description: name, values: [] };
    });
    return json({
      service: "instruments-service",
      dimensions: dimensionObjects,
      cli_args: { "--start-date": null, "--end-date": null },
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/dependencies$/)) {
    // Must match the real DependenciesResponse contract (src/types) — the prior
    // {upstream, downstream, dependents} omitted downstream_dependents + outputs, so
    // DependenciesPanel's `.length` reads on those crashed the app (error boundary).
    return json({
      service: "",
      description: "",
      upstream: [],
      outputs: [],
      external_dependencies: [],
      downstream_dependents: [],
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/checklist\/validate$/)) {
    return json({
      service: "instruments-service",
      ready: true,
      readiness_percent: 100,
      total_items: 10,
      completed_items: 10,
      blocking_items: [],
      warnings: [],
      can_proceed_with_acknowledgment: false,
    });
  }
  if (path.match(/^\/api\/services\/(.+)\/checklist$/)) {
    return json(MOCK_CHECKLIST);
  }
  if (path.match(/^\/api\/services\/(.+)\/status$/)) {
    return json({ status: "healthy", lastCheck: new Date().toISOString() });
  }
  if (path.match(/^\/api\/services\/(.+)\/start-dates$/)) {
    return json({ service: "instruments-service", start_dates: {} });
  }
  if (path.match(/^\/api\/services\/(.+)\/data-status$/)) {
    return json(MOCK_DATA_STATUS);
  }

  // Config
  if (path.match(/^\/api\/config\/venues/)) {
    const params = new URL(url, "http://x").searchParams;
    const ag = params.get("asset_group") ?? params.get("category") ?? "equity";
    return json({ venues: MOCK_VENUES_BY_TRADING_CLASS[ag] ?? [] });
  }
  if (path.match(/^\/api\/config\/start-dates/)) {
    return json({ dates: { equity: "2020-01-02", crypto: "2019-01-01" } });
  }
  if (path === "/api/config/region") {
    return json({
      gcs_region: "asia-northeast1",
      storage_region: "asia-northeast1",
      cloud_provider: "gcp",
      zones: ["asia-northeast1-a", "asia-northeast1-b", "asia-northeast1-c"],
    });
  }
  if (path === "/api/config/shard-axis-matrix") {
    return json({
      shard_axes: {
        "market-tick-data-service": {
          prediction: ["venue", "canonical_question_group", "data_type"],
        },
      },
      display_axes: { "market-tick-data-service": { prediction: [] } },
      primary_axis: { "market-tick-data-service": { prediction: "venue" } },
      breakdown_axes: {
        "market-tick-data-service": {
          prediction: ["canonical_question_group", "data_type"],
        },
      },
    });
  }

  // Venues
  if (path.startsWith("/api/venues")) {
    return json({
      asset_groups: {},
      asset_group: "",
      venues: [],
      data_types: [],
    });
  }

  // Deployments
  // Phase-C retry: /deployments/deploy-missing gets POSTed from the
  // drill-down retry button. Return a deployment-shaped payload so the
  // UI flips the button to the "Retried ✓" state.
  if (path === "/api/deployments/deploy-missing" && method === "POST") {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const depId = `dep-retry-${Date.now()}`;
    return json({
      missing_analysis: {
        service: body.service,
        date_range: { start: body.start_date, end: body.end_date },
        total_missing: 1,
      },
      deployment: {
        deployment_id: depId,
        status: "pending",
        total_shards: 1,
        cli_command: `mock retry --service ${body.service ?? ""} --day ${body.start_date ?? ""}`,
      },
      dry_run: body.dry_run ?? false,
      message: "Retry queued (mock)",
    });
  }
  if (path === "/api/deployments" && method === "POST") {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const newDep = {
      id: `dep-${Date.now()}`,
      service: (body.service as string | undefined) ?? "unknown",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      shards: (body.shards as number | undefined) ?? Math.floor(Math.random() * 100) + 20,
      mode: (body.mode as string | undefined) ?? "batch",
      cloudProvider: "gcp",
      region: (body.region as string | undefined) ?? "asia-northeast1-c",
      createdBy: "mock-user",
      tag: (body.tag as string | undefined) ?? null,
    };
    return json(
      {
        dry_run: false,
        deployment_id: newDep.id,
        shards: Array.from({ length: Math.min(newDep.shards, 10) }, (_, i) => ({
          shard_id: `shard-${i}`,
          status: "queued",
          category: "crypto",
          date_range: { start: "2026-01-01", end: "2026-03-15" },
        })),
        total_shards: newDep.shards,
        shards_truncated: newDep.shards > 10,
        deployment: newDep,
        message: "Deployment started (mock)",
      },
      201,
    );
  }
  if (path === "/api/deployments") {
    const deps = getStressDeployments();
    return json({
      deployments: deps,
      total: deps.length,
    });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/quota$/)) {
    const shards = parseInt(new URL(url, "http://x").searchParams.get("shards") ?? "50");
    return json({
      total_shards: shards,
      max_concurrent: 2000,
      estimated_duration_min: 5,
    });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/events$/)) {
    const id = path.split("/")[3];
    return json({ deployment_id: id, events: [], count: 0 });
  }
  if (path.match(/^\/api\/deployments\/(.+)\/vm-events$/)) {
    const id = path.split("/")[3];
    return json({ deployment_id: id, events: [], count: 0 });
  }
  // GET /api/deployments/<id> — single deployment lookup. Regex excludes
  // any extra path segments (rollback / deploy / events / vm-events /
  // quota) which are handled by their own branches below — the previous
  // `.+` pattern was greedy and would swallow POST routes like
  // `/api/deployments/<id>/rollback`, returning the wrong payload.
  if (path.match(/^\/api\/deployments\/[^/]+$/) && method !== "POST") {
    const id = path.split("/").pop();
    const dep = MOCK_DEPLOYMENTS.find((d) => d.id === id) ?? MOCK_DEPLOYMENTS[0];
    return json({ deployment: dep });
  }

  // Quota (standalone endpoint)
  if (path === "/api/quota" || path.startsWith("/api/quota")) {
    const shards = parseInt(new URL(url, "http://x").searchParams.get("shards") ?? "50");
    return json({
      ...MOCK_QUOTA,
      estimatedCost: { ...MOCK_QUOTA.estimatedCost, total: shards * 0.18 },
    });
  }

  // Venue × year coverage (§4 of deployment_ui plan)
  if (path.startsWith("/api/data-status/venue-year-coverage")) {
    // Allow tests to inject an error via window.__mockVenueCoverageError
    const coverageError = (window as typeof window & { __mockVenueCoverageError?: boolean }).__mockVenueCoverageError;
    if (coverageError) {
      return json({ detail: "GCS unavailable" }, 500);
    }
    return json({
      rows: [
        {
          venue: "BINANCE-SPOT",
          asset_group: "CEFI",
          year: 2024,
          captured: 320,
          empty_confirmed: 5,
          expected_unattempted: 10,
          pending_paid_key: 0,
          attempted_failed: 2,
          total: 337,
        },
        {
          venue: "COINBASE-SPOT",
          asset_group: "CEFI",
          year: 2024,
          captured: 200,
          empty_confirmed: 0,
          expected_unattempted: 0,
          pending_paid_key: 30,
          attempted_failed: 0,
          total: 230,
        },
        {
          venue: "DERIBIT",
          asset_group: "CEFI",
          year: 2023,
          captured: 365,
          empty_confirmed: 0,
          expected_unattempted: 0,
          pending_paid_key: 0,
          attempted_failed: 0,
          total: 365,
        },
      ],
      asset_groups_loaded: ["cefi"],
      asset_groups_failed: [],
    });
  }

  // Venue Tardis Windows — must be before the general /api/data-status catch-all
  if (path === "/api/data-status/venue-tardis-windows" && method === "GET") {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return json({
      as_of: today,
      key_name: "tardis-api-key",
      key_status: "expired",
      free_tier: {
        rolling_window_days: 7,
        rolling_window_cutoff: cutoff,
        monthly_firsts: true,
        rule_description: `day-of-month == 1  OR  date >= ${cutoff}`,
      },
    });
  }

  // Data status (standalone)
  // Hierarchical shard-atom drilldown — GET /api/data-status/drilldown/{service}/{ag}.
  // Mounted (inside a collapsed <details>) for every asset-group card, so it
  // ALWAYS fetches on the data-status tab. Returns a valid DrilldownResponse with
  // ONE captured leaf whose `provenance` rows carry the M5b `transport` + M8
  // `cadence` observability axes — this is the fixture the cadence-badge
  // regression drives in mock mode. Without this handler the broad
  // `/api/data-status` catch-all below returns a tree-less object → the
  // component crashes on `topLevel.tree.length` (pre-existing mock gap).
  // MUST precede the broad catch-all.
  if (path.match(/^\/api\/data-status\/drilldown\/[^/]+\/[^/]+/)) {
    return json({
      service: "market-tick-data-service",
      asset_group: "cefi",
      axes: ["venue", "data_type", "date"],
      tree: [
        {
          axis: "date",
          value: "2026-06-01",
          captured: 1,
          empty_confirmed: 0,
          attempted_failed: 0,
          expected_unattempted: 0,
          total: 1,
          completion_pct: 100,
          row_key: { venue: "BINANCE-FUTURES", data_type: "funding_rate", date: "2026-06-01" },
          is_leaf: true,
          children: [],
          provenance: [
            {
              pipeline_mode: "batch_binance",
              source: "binance",
              transport: "rest",
              cadence: "one_off_backfill",
              captured: 1,
              empty_confirmed: 0,
              attempted_failed: 0,
              expected_unattempted: 0,
            },
            {
              pipeline_mode: "live_binance",
              source: "binance",
              transport: "websocket",
              cadence: "continuous_live",
              captured: 1,
              empty_confirmed: 0,
              attempted_failed: 0,
              expected_unattempted: 0,
            },
          ],
        },
      ],
      totals: {
        captured: 1,
        empty_confirmed: 0,
        attempted_failed: 0,
        expected_unattempted: 0,
        total: 1,
        completion_pct: 100,
      },
      filtered_by: {},
      total_top_axis_children: 1,
      child_offset: 0,
      child_limit: 200,
      mock: true,
    });
  }

  // Coverage summary (auto-fetched on mount for MANIFEST_MODE_SERVICES) — drives
  // the per-asset-group "Asset Groups" card + the BreakdownsAccordion (per-axis
  // selectors from the UAC SHARD_AXIS_MATRIX SSOT). The PREDICTION entry carries
  // a `canonical_question_group` breakdown so the accordion renders the cqg axis
  // (regression: prediction_v9_breakdown smoke). MUST precede the broad
  // `/api/data-status` catch-all below so it isn't shadowed.
  if (path.startsWith("/api/data-status/coverage-summary")) {
    const cqgBreakdown = {
      "crypto-price-prediction": 280,
      "election-outcome": 95,
      "sports-result": 410,
      "kalshi-economic-event": 60,
      OTHER: 12,
    };
    return json({
      service: "market-tick-data-service",
      asset_groups: {
        PREDICTION: {
          total_shards: 857,
          total_instrument_rows: 110_300,
          total_instruments: 12,
          unique_dates: 31,
          unique_venues: 5,
          sub_dimension_label: "question groups",
          group_axis: "canonical_question_group",
          date_range: { start: "2025-03-01", end: "2025-03-31" },
          latest_day: "2025-03-31",
          latest_day_instruments: { "crypto-price-prediction": 14200, "election-outcome": 5500 },
          latest_day_total: 19700,
          breakdowns: { canonical_question_group: cqgBreakdown, data_type: {} },
        },
      },
      totals: {
        shards: 857,
        instrument_rows: 110_300,
        dates_across_asset_groups: 31,
        latest_day_instruments: 19700,
        unique_instruments: 12,
      },
      totals_source: "rollup",
      served_from: "mock",
      mock: true,
    });
  }

  if (path.match(/^\/api\/data-status/)) {
    return json(MOCK_DATA_STATUS);
  }

  // Cloud builds
  if (path === "/api/cloud-builds" || path === "/cloud-builds/triggers" || path === "/api/cloud-builds/triggers") {
    return json({
      triggers: [
        {
          trigger_id: "trig-001",
          service: "instruments-service",
          type: "service",
          github_repo: "IggyIkenna/instruments-service",
          branch_pattern: "main",
          disabled: false,
          last_build: {
            status: "SUCCESS",
            commit_sha: "abc1234",
            create_time: "2026-01-14T20:00:00Z",
            duration_seconds: 120,
            log_url: null,
            build_id: "build-001",
          },
        },
      ],
    });
  }
  if (path.match(/^\/cloud-builds\/history\//)) {
    return json({ builds: [] });
  }
  if (path === "/cloud-builds/trigger" && method === "POST") {
    return json(
      {
        success: true,
        message: "Build triggered (mock)",
        build_id: `build-${Date.now()}`,
      },
      201,
    );
  }
  if (path.match(/^\/api\/cloud-builds\/(.+)\/trigger$/) && method === "POST") {
    return json(
      {
        build: {
          id: `cb-${Date.now()}`,
          status: "QUEUED",
          startTime: new Date().toISOString(),
        },
        message: "Build triggered (mock)",
      },
      201,
    );
  }

  // Service status
  if (path.match(/^\/(?:api\/)?service-status\/(.+)\/status$/)) {
    return json({
      service: "instruments-service",
      health: "healthy",
      last_data_update: "2026-01-15T08:00:00Z",
      last_deployment: "2026-01-15T10:00:00Z",
      last_build: "2026-01-14T20:00:00Z",
      last_code_push: "2026-01-14T18:00:00Z",
      anomalies: [],
      details: {
        deployment: {
          deployment_id: "dep-test-001",
          status: "completed",
          compute_type: "cloud_run",
        },
        build: {
          status: "SUCCESS",
          commit_sha: "abc1234",
          duration_seconds: 120,
        },
        code: { commit_sha: "abc1234", message: "feat: update", author: "dev" },
      },
    });
  }

  // Cache — handle both POST (client uses POST) and DELETE
  if (path === "/api/cache/clear") {
    return json({ cleared: true, message: "Cache cleared (mock)" });
  }
  if (path === "/api/cache") {
    return json({ cleared: true, message: "Cache cleared (mock)" });
  }

  // Categories
  if (path === "/api/categories") {
    return json({ categories: MOCK_CATEGORIES });
  }

  // Builds
  if (path.match(/^\/api\/builds\/.+/)) {
    return json([
      {
        tag: "v0.3.1-abc1234",
        display: "v0.3.1 (abc1234)",
        version: "0.3.1",
        branch: "main",
        is_v1: false,
      },
      {
        tag: "v0.3.0-def5678",
        display: "v0.3.0 (def5678)",
        version: "0.3.0",
        branch: "main",
        is_v1: false,
      },
    ]);
  }

  // Deploy a specific build
  if (path.match(/^\/api\/deployments\/.+\/deploy$/) && method === "POST") {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    return json(
      {
        status: "deploying",
        service: path.split("/")[3],
        image_tag: (body.image_tag as string | undefined) ?? "latest",
        environment: (body.environment as string | undefined) ?? "dev",
      },
      201,
    );
  }

  // Rollback
  if (path.match(/^\/api\/deployments\/.+\/rollback$/) && method === "POST") {
    return json({
      id: path.split("/")[3],
      status: "rolling_back",
      message: "Rollback initiated (mock)",
    });
  }

  // Epics
  // Epics tab v2 — live PM epics + plan drilldown (mirrors deployment-api epics.py
  // _mock_epics_plans). MUST precede /api/epics and /api/epics/{id} below.
  if (path === "/api/epics/plans") {
    const plan = (slug: string, parent: string, done: number, open: number, p01: number) => ({
      slug,
      parent_epic: parent,
      status: "active",
      estimate_class: "brand-new",
      done,
      open,
      open_p0p1: p01,
      pct: done + open > 0 ? Math.round((1000 * done) / (done + open)) / 10 : 0,
      github_url: `https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/active/${slug}.md`,
    });
    return json({
      generated_at: new Date().toISOString(),
      source: "mock",
      stale: false,
      epics: [
        {
          name: "observability_master",
          slug: "observability_master",
          title: "Observability Master",
          tier: "L4",
          priority: "P0",
          assigned_vm: "vm-cross-cutting",
          status: "active",
          github_url: "https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/epics/observability_master.md",
          plans: [
            plan("monitoring_control_plane_master_2026_06_10", "observability_master", 18, 5, 2),
            plan("ci_dashboard_deployment_ui_2026_06_10", "observability_master", 30, 6, 1),
          ],
          plan_count: 2,
          done_total: 48,
          open_total: 11,
        },
        {
          name: "orchestrator_master",
          slug: "orchestrator_master",
          title: "Orchestrator Master",
          tier: "L4",
          priority: "P1",
          assigned_vm: "vm-orchestrator",
          status: "active",
          github_url: "https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/epics/orchestrator_master.md",
          plans: [],
          plan_count: 0,
          done_total: 0,
          open_total: 0,
        },
      ],
      orphans: [plan("some_orphan_plan_2026_06_10", "", 2, 4, 1)],
      orphan_count: 1,
    });
  }

  if (path === "/api/epics") {
    return json([
      {
        id: "epic-code-completion",
        name: "Code Completion",
        status: "in_progress",
        repos_total: 62,
        repos_done: 38,
        repos_blocked: 2,
        completion_pct: 61.3,
      },
      {
        id: "epic-deployment",
        name: "Deployment",
        status: "in_progress",
        repos_total: 62,
        repos_done: 12,
        repos_blocked: 5,
        completion_pct: 19.4,
      },
      {
        id: "epic-business",
        name: "Business Readiness",
        status: "not_started",
        repos_total: 62,
        repos_done: 0,
        repos_blocked: 0,
        completion_pct: 0,
      },
    ]);
  }
  if (path.match(/^\/api\/epics\/(.+)$/)) {
    const epicId = path.split("/").pop();
    return json({
      id: epicId,
      name: epicId,
      status: "in_progress",
      repos: MOCK_SERVICES.map((s) => ({
        name: s.name,
        code_gate: "C4",
        deployment_gate: "D1",
        business_gate: "B0",
      })),
    });
  }

  // Services overview
  if (path === "/api/service-status/overview" || path === "/api/services/overview") {
    return json({
      services: MOCK_SERVICES.map((s) => ({
        name: s.name,
        layer: s.layer,
        category: s.category,
        status: s.status,
        health: "healthy",
        lastDeployed: s.lastDeployed,
      })),
      total: MOCK_SERVICES.length,
      healthy: MOCK_SERVICES.length - 1,
      warning: 1,
      error: 0,
    });
  }

  // Config dependencies
  if (path.match(/^\/api\/config\/dependencies\/.+/)) {
    return json({
      dependencies: ["unified-trading-library", "unified-cloud-interface"],
      service: path.split("/").pop(),
    });
  }

  // Config expected-start-dates
  if (path.match(/^\/api\/config\/expected-start-dates\/.+/)) {
    return json({
      service: path.split("/").pop(),
      start_dates: {
        equity: "2020-01-02",
        crypto: "2019-01-01",
        fx: "2018-01-02",
      },
    });
  }

  // Checklists
  if (path.match(/^\/api\/checklists\/(.+)\/checklist\/validate$/)) {
    return json({ valid: true, errors: [], warnings: [] });
  }
  if (path.match(/^\/api\/checklists\/(.+)\/checklist$/)) {
    return json(MOCK_CHECKLIST);
  }
  if (path === "/api/checklists") {
    return json({
      checklists: MOCK_SERVICES.map((s) => ({
        service: s.name,
        items_total: 10,
        items_complete: 7,
        completion_pct: 70.0,
      })),
    });
  }

  // Capabilities
  if (path === "/api/capabilities") {
    return json({
      capabilities: ["batch_deploy", "live_deploy", "cloud_build", "rollback", "config_browse"],
      version: "0.3.0",
    });
  }
  if (
    path.match(/^\/api\/capabilities\/service-asset-groups\/.+/) ||
    path.match(/^\/api\/capabilities\/service-categories\/.+/)
  ) {
    return json({
      asset_groups: ["CEFI", "DEFI", "TRADFI", "SPORTS", "PREDICTION"],
      service: path.split("/").pop(),
    });
  }

  // Deployment quota-info
  if (path === "/api/deployments/quota-info") {
    return json({
      max_concurrent: 2000,
      current_running: 0,
      available: 2000,
      estimated_cost_per_shard: 0.18,
      daily_budget: 500.0,
      daily_spent: 0,
    });
  }

  // Deployment report
  if (path.match(/^\/api\/deployments\/(.+)\/report$/)) {
    return json({
      deployment_id: path.split("/")[3],
      shards_total: 50,
      shards_completed: 50,
      shards_failed: 0,
      duration_minutes: 12,
      cost_usd: 9.0,
    });
  }

  // Deployment live-health
  if (path.match(/^\/api\/deployments\/(.+)\/live-health$/)) {
    return json({
      deployment_id: path.split("/")[3],
      status: "healthy",
      checks: [],
    });
  }

  // Data status honest-coverage (per-date manifest-capture + shards-weighted could-exist)
  if (path.startsWith("/api/data-status/honest-coverage")) {
    const mkGroup = (
      captured: number,
      empty_confirmed: number,
      attempted_failed: number,
      expected_unattempted_known_empty: number,
      expected_unattempted_pending_fetch: number,
      out_of_window: number,
      shards_found: number,
      shards_expected: number,
    ) => {
      const total =
        captured +
        empty_confirmed +
        attempted_failed +
        expected_unattempted_known_empty +
        expected_unattempted_pending_fetch;
      const coverage_pct =
        total > 0 ? ((captured + empty_confirmed + expected_unattempted_known_empty) / total) * 100 : 0;
      const completion_pct_shards_weighted = shards_expected > 0 ? (shards_found / shards_expected) * 100 : 0;
      return {
        captured,
        empty_confirmed,
        attempted_failed,
        expected_unattempted_known_empty,
        expected_unattempted_pending_fetch,
        out_of_window,
        total,
        coverage_pct,
        completion_pct_shards_weighted,
        completion_pct_dates: completion_pct_shards_weighted * 0.98,
        completion_pct_attempt_blended: (coverage_pct + completion_pct_shards_weighted) / 2,
        shards_found,
        shards_expected,
      };
    };
    const today = new Date().toISOString().split("T")[0];
    return json({
      generated_at: new Date().toISOString(),
      date: today,
      by_asset_group: {
        // defi: ~27% could-exist (full UAC universe), ~97% manifest-capture
        defi: mkGroup(2700, 200, 40, 100, 50, 6000, 2700, 10000),
        cefi: mkGroup(9500, 200, 50, 100, 150, 1500, 9500, 11000),
        tradfi: mkGroup(4800, 100, 20, 50, 30, 800, 4800, 5500),
        sports: mkGroup(1200, 50, 10, 20, 20, 300, 1200, 1800),
        prediction: mkGroup(600, 30, 5, 10, 10, 200, 600, 1000),
      },
      by_venue: {},
      by_venue_data_type: {},
    });
  }

  // Data status turbo
  if (path.startsWith("/api/data-status/turbo/cache/clear")) {
    return json({ cleared: true });
  }
  if (path.startsWith("/api/data-status/turbo") || path.startsWith("/api/data-status/manifest")) {
    return json(MOCK_DATA_STATUS);
  }
  if (path.startsWith("/api/data-status/venue-filters")) {
    return json({
      service: "instruments-service",
      asset_groups: {
        cefi: { venues: ["Binance", "OKX"], count: 2 },
        tradfi: { venues: ["CME"], count: 1 },
      },
    });
  }
  if (path.startsWith("/api/data-status/list-files")) {
    return json({ files: [], directories: [], error: null });
  }
  // Phase-C drill-down: three instrument rows, one per capture_status, so
  // the UI shows every badge colour + exercises the Retry button flow.
  if (path.startsWith("/api/data-status/instruments-for-shard")) {
    const venue = new URL(path, "http://x").searchParams.get("venue") ?? "MOCK";
    const day = new URL(path, "http://x").searchParams.get("day") ?? "2025-06-01";
    return json({
      service: "market-tick-data-service",
      category: "cefi",
      venue,
      day,
      instrument_type: "perpetuals",
      data_type: "trades",
      bundling: "per_symbol",
      bucket: "mock-bucket-cefi",
      prefix: `raw_tick_data/by_date/day=${day}/category=cefi/venue=${venue}/`,
      instruments: [
        {
          instrument_id: `${venue}-CAPTURED-1`,
          file_uri: `gs://mock/${venue}/${day}/CAPTURED-1.parquet`,
          size_bytes: 1024,
          capture_status: "captured",
          error_reason: "",
          attempted_at: `${day}T00:10:00+00:00`,
        },
        {
          instrument_id: `${venue}-EMPTY-1`,
          file_uri: `gs://mock/${venue}/${day}/EMPTY-1.parquet`,
          size_bytes: 0,
          capture_status: "empty_confirmed",
          error_reason: "",
          attempted_at: `${day}T00:12:00+00:00`,
        },
        {
          instrument_id: `${venue}-FAILED-1`,
          file_uri: `gs://mock/${venue}/${day}/FAILED-1.parquet`,
          size_bytes: 0,
          capture_status: "attempted_failed",
          error_reason: "RATE_LIMIT_HIT",
          attempted_at: `${day}T00:14:00+00:00`,
        },
      ],
      total_count: 3,
      limit: 50,
      offset: 0,
      has_more: false,
      search: "",
      mock: true,
    });
  }
  if (path.startsWith("/api/data-status/instruments")) {
    return json({
      instruments: ["BTC/USDT", "ETH/USDT", "AAPL", "MSFT"],
      error: null,
    });
  }
  if (path.startsWith("/api/data-status/instrument-availability")) {
    return json({
      overall: { total: 5, available: 5, missing: 0 },
      by_data_type: {},
      error: null,
    });
  }

  // Cloud builds history (fix path to also match /api/ prefix)
  if (path.match(/^\/api\/cloud-builds\/history\/.+/)) {
    return json({ builds: [] });
  }

  // Config discover/browse
  if (path.match(/^\/api\/services\/(.+)\/discover-configs$/)) {
    return json({ configs: [], total: 0 });
  }
  if (path.match(/^\/api\/services\/(.+)\/list-directories$/)) {
    return json({ directories: [], total: 0 });
  }
  if (path.match(/^\/api\/services\/(.+)\/config-buckets$/)) {
    return json({
      buckets: ["mock-config-bucket"],
      project_id: "mock-project",
    });
  }

  // ─── VM deployments (Phase 4b — VM-backed pipeline observability) ───
  if (path.startsWith("/api/vm-deployments") && method === "GET") {
    const m = path.match(/^\/api\/vm-deployments\/([^/?]+)$/);
    if (m) {
      return json(_mockVmDeployment(decodeURIComponent(m[1]), "running"));
    }
    // Allow tests to inject custom vm-deployment list data via window.__mockVmDeploymentOverride
    const vmDepOverride = (window as typeof window & { __mockVmDeploymentOverride?: unknown })
      .__mockVmDeploymentOverride;
    if (vmDepOverride) {
      return json(vmDepOverride);
    }
    return json({
      active: [
        _mockVmDeployment("vm-2026-04-30-tradfi-bf-btc-heavy-2024-06", "running"),
        _mockVmDeployment("vm-2026-04-30-tradfi-bf-eth-light-2025", "running"),
      ],
      recent: [
        _mockVmDeployment("vm-2026-04-29-cefi-binance-futures-2024", "completed"),
        _mockVmDeployment("vm-2026-04-29-cefi-bybit-2024", "completed"),
        _mockVmDeployment("vm-2026-04-28-mtds-options-may2025", "failed"),
      ],
      archive_days: 7,
    });
  }

  // ─── VM deployments reconcile ───
  if (path === "/api/vm-deployments/reconcile" && method === "POST") {
    const reconcileError = (window as typeof window & { __mockReconcileError?: boolean }).__mockReconcileError;
    if (reconcileError) {
      return json({ error: "Mock reconcile error" }, 502);
    }
    return json({
      reaped_count: 1737,
      reaped: [],
      running_vm_count: 25,
      total_active_before: 1762,
    });
  }

  // ─── Venue credentials ───
  if (path === "/api/venue-credentials" && method === "GET") {
    return json([
      {
        name: "tardis-api-key",
        venue: "tardis",
        status: "expired",
        probe_detail: "mock mode — api-key-info returned [] (no datasets accessible)",
        checked_at: new Date().toISOString(),
      },
    ]);
  }

  if (path === "/api/venue-date-ranges" && method === "GET") {
    const today = new Date();
    const coverageStart = new Date("2020-01-01");
    // Count free dates: 1st-of-month + last 30 days
    let freeDates = 0;
    let paidDates = 0;
    const recentCutoff = new Date(today);
    recentCutoff.setDate(today.getDate() - 29);
    const cur = new Date(coverageStart);
    while (cur <= today) {
      const isFirst = cur.getDate() === 1;
      const isRecent = cur >= recentCutoff;
      if (isFirst || isRecent) freeDates++;
      else paidDates++;
      cur.setDate(cur.getDate() + 1);
    }
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];
    const recentCutoffStr = fmtDate(recentCutoff);
    const todayStr = fmtDate(today);
    const freeSampleDates = [
      fmtDate(new Date("2026-03-01")),
      fmtDate(new Date("2026-04-01")),
      fmtDate(new Date("2026-05-01")),
      recentCutoffStr,
      todayStr,
    ];
    const freeDes = `1st-of-month days (2020-01-01 → ${todayStr}) + last 30 days (${recentCutoffStr} → ${todayStr}) — ${freeDates} dates total`;
    const paidDes = `All other historical dates (2020-01-01 → ${fmtDate(new Date(recentCutoff.getTime() - 86400000))}) — ${paidDates} dates require active paid key`;
    const makeRow = (venue: string) => ({
      venue,
      key_name: "tardis-api-key",
      key_status: "mock",
      coverage_start: "2020-01-01",
      free_date_count: freeDates,
      paid_date_count: paidDates,
      free_description: freeDes,
      paid_description: paidDes,
      free_sample_dates: freeSampleDates,
      assessed_at: new Date().toISOString(),
    });
    return json(["binance", "okx", "bybit", "deribit", "kraken", "bitfinex"].map(makeRow));
  }

  if (path === "/api/venue-relaunch-estimate" && method === "GET") {
    const today = new Date();
    const _freePctForYear = (year: number): number => {
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(Math.min(new Date(year, 11, 31).getTime(), today.getTime()));
      if (yearEnd < yearStart) return 0;
      let free = 0;
      const total = Math.round((yearEnd.getTime() - yearStart.getTime()) / 86400000) + 1;
      const recentCutoff = new Date(today.getTime() - 29 * 86400000);
      const cur = new Date(yearStart);
      while (cur <= yearEnd) {
        if (cur.getDate() === 1 || cur >= recentCutoff) free++;
        cur.setDate(cur.getDate() + 1);
      }
      return Math.round((1000 * free) / total) / 10;
    };
    const rawRows = [
      ["COINBASE-SPOT", "cefi", 2024, 30],
      ["BINANCE-SPOT", "cefi", 2025, 120],
      ["BINANCE-SPOT", "cefi", 2026, 45],
      ["OKX-SPOT", "cefi", 2025, 85],
      ["BYBIT-LINEAR", "cefi", 2024, 50],
    ] as const;
    const rows = rawRows.map(([venue, ag, year, pending]) => {
      const pct = _freePctForYear(year);
      const now = Math.round((pending * pct) / 100);
      return {
        venue,
        asset_group: ag,
        year,
        pending_total: pending,
        est_now_unlockable: now,
        est_after_renewal: pending,
        free_pct: pct,
      };
    });
    const totalPending = rows.reduce((s, r) => s + r.pending_total, 0);
    const totalNow = rows.reduce((s, r) => s + r.est_now_unlockable, 0);
    return json({
      rows,
      summary: {
        total_pending: totalPending,
        total_now_unlockable: totalNow,
        total_after_renewal: totalPending,
        key_status: "mock",
      },
      assessed_at: new Date().toISOString(),
    });
  }

  // ─── Daily VM costs ───
  if (path.startsWith("/api/costs/daily")) {
    const date = new URL(url, "http://localhost").searchParams.get("date") ?? "2026-05-15";
    return json({
      date,
      total_usd: 12.34,
      by_asset_group: [
        { asset_group: "cefi", vm_count: 2, total_usd: 8.0, archetype_count: 1 },
        { asset_group: "defi", vm_count: 1, total_usd: 4.34, archetype_count: 1 },
      ],
      by_archetype: [
        { archetype: "carry_staked_basis", vm_count: 2, total_usd: 8.0 },
        { archetype: "arbitrage_price_dispersion", vm_count: 1, total_usd: 4.34 },
      ],
      by_vm: [
        {
          vm_name: "cefi-backfill-20260515",
          asset_group: "cefi",
          archetype: "carry_staked_basis",
          machine_type: "n1-standard-4",
          runtime_hours: 2.0,
          compute_usd: 7.6,
          disk_usd: 0.4,
          total_usd: 8.0,
        },
        {
          vm_name: "defi-backfill-20260515",
          asset_group: "defi",
          archetype: "arbitrage_price_dispersion",
          machine_type: "n1-standard-2",
          runtime_hours: 1.0,
          compute_usd: 4.0,
          disk_usd: 0.34,
          total_usd: 4.34,
        },
      ],
    });
  }

  // ─── VM events / health (smoke tests for DailyCosts + VmDetail) ───
  const vmEventsMatch = path.match(/^\/api\/vm\/([^/]+)\/events/);
  if (vmEventsMatch) {
    const vmName = decodeURIComponent(vmEventsMatch[1]);
    return json({
      vm_name: vmName,
      service: "instruments-service",
      date: "2026-05-15",
      hours_scanned: [0, 1],
      total_events: 2,
      events: [
        {
          event: "STARTED",
          service: "instruments-service",
          timestamp: "2026-05-15T00:00:01+00:00",
          severity: "INFO",
          correlation_id: null,
          details: null,
        },
        {
          event: "STOPPED",
          service: "instruments-service",
          timestamp: "2026-05-15T02:00:00+00:00",
          severity: "INFO",
          correlation_id: null,
          details: null,
        },
      ],
      truncated: false,
      next_page_token: null,
    });
  }
  const vmHealthMatch = path.match(/^\/api\/vm\/([^/]+)\/health/);
  if (vmHealthMatch) {
    const vmName = decodeURIComponent(vmHealthMatch[1]);
    return json({ vm_name: vmName, status: "healthy", event_count: 2 });
  }

  // ─── Treasury / client NAV endpoints (Phase 6 — wallet treasury) ───
  const clientTreasuryMatch = path.match(/^\/api\/clients\/([^/]+)\/treasury$/);
  if (clientTreasuryMatch) {
    const clientId = decodeURIComponent(clientTreasuryMatch[1]);
    return json({
      client_id: clientId,
      as_of: "2026-05-13T10:00:00+00:00",
      subscriptions: [
        {
          client_id: clientId,
          share_class_id: "USDC_CUTOVER_V1",
          archetype_id: "carry_staked_basis",
          allocation_pct: "60",
          max_drawdown_for_suspension_pct: "15",
          subscribed_at: "2026-05-10T09:00:00+00:00",
          suspended_at: null,
          suspension_reason: "",
          is_active: true,
        },
        {
          client_id: clientId,
          share_class_id: "USDC_CUTOVER_V1",
          archetype_id: "arbitrage_price_dispersion",
          allocation_pct: "40",
          max_drawdown_for_suspension_pct: "20",
          subscribed_at: "2026-05-10T09:00:00+00:00",
          suspended_at: null,
          suspension_reason: "",
          is_active: true,
        },
      ],
      treasury_attribution: [
        {
          source: "DEFI_HOT_WALLET",
          client_share_pct: "100",
          client_share_usd: "850000.00",
          source_nav_usd: "850000.00",
        },
        {
          source: "SUB_ACCOUNT_HYPERLIQUID",
          client_share_pct: "100",
          client_share_usd: "300000.00",
          source_nav_usd: "300000.00",
        },
        {
          source: "SUB_ACCOUNT_DRIFT",
          client_share_pct: "100",
          client_share_usd: "100000.00",
          source_nav_usd: "100000.00",
        },
      ],
      custody_ping_results: [
        {
          source: "DEFI_HOT_WALLET",
          is_reachable: true,
          balance_usd: "850000.00",
          as_of_timestamp: "2026-05-13T10:00:00+00:00",
          latency_ms: 42,
          error_message: "",
        },
        {
          source: "COPPER",
          is_reachable: false,
          balance_usd: null,
          as_of_timestamp: null,
          latency_ms: 0,
          error_message: "June-1 credential delivery pending",
        },
      ],
      allocations: [
        {
          archetype_id: "carry_staked_basis",
          share_class_id: "USDC_CUTOVER_V1",
          allocation_amount_usd: "750000.00",
          decision_event_id: "alloc_carry_staked_basis_demo",
          decided_at: "2026-05-13T10:00:00+00:00",
        },
      ],
      last_settled: null,
      nav_usd: "1250000.00",
    });
  }

  const clientSubsMatch = path.match(/^\/api\/clients\/([^/]+)\/subscriptions$/);
  if (clientSubsMatch) {
    const clientId = decodeURIComponent(clientSubsMatch[1]);
    return json({
      client_id: clientId,
      subscriptions: [
        {
          client_id: clientId,
          share_class_id: "USDC_CUTOVER_V1",
          archetype_id: "carry_staked_basis",
          allocation_pct: "60",
          max_drawdown_for_suspension_pct: "15",
          subscribed_at: "2026-05-10T09:00:00+00:00",
          suspended_at: null,
          suspension_reason: "",
          is_active: true,
        },
        {
          client_id: clientId,
          share_class_id: "USDC_CUTOVER_V1",
          archetype_id: "arbitrage_price_dispersion",
          allocation_pct: "40",
          max_drawdown_for_suspension_pct: "20",
          subscribed_at: "2026-05-10T09:00:00+00:00",
          suspended_at: null,
          suspension_reason: "",
          is_active: true,
        },
      ],
      onboarding_state: "LIVE",
    });
  }

  const clientWithdrawMatch = path.match(/^\/api\/clients\/([^/]+)\/withdrawal-request$/);
  if (clientWithdrawMatch && method === "POST") {
    return json({ request_id: "wr-mock-001", status: "pending_approval" }, 201);
  }

  if (path.startsWith("/api/treasury/rollup")) {
    return json({
      as_of: "2026-05-13T10:00:00+00:00",
      nav_usd: "1250000.00",
      sources: [
        { source: "DEFI_HOT_WALLET", nav_usd: "850000.00", is_reachable: true },
        { source: "SUB_ACCOUNT_HYPERLIQUID", nav_usd: "300000.00", is_reachable: true },
        { source: "SUB_ACCOUNT_DRIFT", nav_usd: "100000.00", is_reachable: true },
      ],
    });
  }

  // Client subscriptions (SLA tier / isolation) moved to unified-trading-system-ui
  // (`services/manage/subscriptions`) per the dual-cut cleanup 2026-06-12 — its mock
  // lives there now. The deployment-api `/subscriptions` backend is unchanged.

  // ─── Chaos injections (Phase 4b — controlled fault injection) ───
  if (path.startsWith("/chaos/injections")) {
    const idMatch = path.match(/^\/chaos\/injections\/([^/?]+)$/);
    if (idMatch && method === "DELETE") {
      return json({ revoked: decodeURIComponent(idMatch[1]) });
    }
    if (method === "POST") {
      const spec = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      return json(
        {
          injection_id: `chaos-${Date.now()}`,
          point: spec.point ?? "venue_latency",
          target_service: spec.target_service ?? "execution-service",
          parameters: spec.parameters ?? {},
          active_from: new Date().toISOString(),
          active_until: spec.active_until ?? null,
          created_by: "mock-operator",
          runtime_profile: spec.runtime_profile ?? "staging",
        },
        201,
      );
    }
    return json([
      _mockChaosInjection("chaos-venue-latency-001", "venue_latency", "execution-service", "staging"),
      _mockChaosInjection("chaos-rpc-timeout-002", "rpc_timeout", "market-tick-data-service", "paper"),
    ]);
  }

  return json({ error: "Mock: no handler", path }, 404);
}

function _mockVmDeployment(deploymentId: string, status: string) {
  const startedAt = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const lastHb = new Date(Date.now() - 30_000).toISOString();
  const completedAt = status === "running" ? null : new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const exitCode = status === "running" ? null : status === "completed" ? 0 : 1;
  return {
    deployment_id: deploymentId,
    vm_name: deploymentId.replace(/^vm-\d{4}-\d{2}-\d{2}-/, ""),
    asset_group: "tradfi",
    task: "backfill",
    mode: "batch",
    start_date: "2024-01-01",
    end_date: "2024-12-31",
    status,
    started_at: startedAt,
    last_heartbeat_at: lastHb,
    completed_at: completedAt,
    exit_code: exitCode,
    rows_in: status === "running" ? 18432 : 31_240,
    rows_out: status === "running" ? 18430 : 31_238,
    rows_error: status === "failed" ? 7 : 0,
    events_emitted: 412,
    log_uri: `gs://deployment-scripts-central-element-323112/vm-logs/${deploymentId}/run.log`,
  };
}

function _mockChaosInjection(injectionId: string, point: string, targetService: string, runtimeProfile: string) {
  return {
    injection_id: injectionId,
    point,
    target_service: targetService,
    parameters: { latency_ms: "250", probability: "0.05" },
    active_from: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    active_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    created_by: "mock-operator",
    runtime_profile: runtimeProfile,
  };
}

export function installDeploymentMockHandlers(enabled = MOCK_MODE) {
  if (!enabled) return;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (
      url.includes("/api/") ||
      url.includes("/cloud-builds/") ||
      url.includes("/service-status/") ||
      url.includes("/subscriptions/") ||
      url.includes("/subscriptions?") ||
      url.endsWith("/subscriptions") ||
      url.includes("/chaos/injections")
    ) {
      return handleRoute(url, init);
    }
    return original(input, init);
  };
}
