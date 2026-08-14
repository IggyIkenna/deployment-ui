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
    // TEAMS — axis flipped global_trigger_date -> per_league_trigger_date by P8
    // (deployment-api@fb0eec8), matching the IS writer + the UAC shard-atom SSOT.
    // So it MUST carry a populated `leagues` map: this fixture is what makes the
    // reclassification checkable in mock mode (it was previously absent entirely,
    // which is why the P8 browser check came back INCONCLUSIVE).
    // The per-league counts also model P8's honest-absence case: LA_LIGA has
    // expected trigger dates but 0 captured (legitimately empty off-season /
    // not-yet-captured, NOT a gap), while EPL has both boundary dates.
    TEAMS: {
      ..._mkVenue(6, 4, 0, 0),
      completion_pct: 66.67,
      found_shards: 4,
      expected_shards: 6,
      missing_shards: 2,
      unit: "trigger_dates",
      axis: "per_league_trigger_date",
      source: "api_football",
      expected_leagues: ["EPL", "LA_LIGA", "SERIE_A"],
      leagues: {
        EPL: { found_shards: 2, expected_shards: 2, missing_shards: 0, completion_pct: 100 },
        SERIE_A: { found_shards: 2, expected_shards: 2, missing_shards: 0, completion_pct: 100 },
        LA_LIGA: { found_shards: 0, expected_shards: 2, missing_shards: 2, completion_pct: 0 },
      },
    } as unknown as ReturnType<typeof _mkVenue>,
    // STANDINGS — per-league, the data_type P8 says TEAMS must now be consistent with.
    STANDINGS: {
      ..._mkVenue(9, 7, 0, 0),
      completion_pct: 77.78,
      found_shards: 7,
      expected_shards: 9,
      missing_shards: 2,
      unit: "daily_snapshots",
      axis: "per_league_periodic",
      source: "api_football",
      expected_leagues: ["EPL", "LA_LIGA", "SERIE_A"],
      leagues: {
        EPL: { found_shards: 3, expected_shards: 3, missing_shards: 0, completion_pct: 100 },
        LA_LIGA: { found_shards: 3, expected_shards: 3, missing_shards: 0, completion_pct: 100 },
        SERIE_A: { found_shards: 1, expected_shards: 3, missing_shards: 2, completion_pct: 33.33 },
      },
    } as unknown as ReturnType<typeof _mkVenue>,
    // VENUES — genuinely GLOBAL reference data (like LEAGUES): no per-league map,
    // so the UI renders P8's explicit "Global reference entity — no per-league
    // breakdown" affordance instead of silently omitting the section.
    VENUES: {
      ..._mkVenue(52, 52, 0, 0),
      completion_pct: 100,
      found_shards: 52,
      expected_shards: 52,
      missing_shards: 0,
      unit: "season_snapshots",
      axis: "global_season",
      source: "api_football",
      expected_leagues: [] as string[],
      leagues: {} as Record<string, never>,
    } as unknown as ReturnType<typeof _mkVenue>,
    // features-sports-service Phase-3 honest-coverage rollups (Phase 8.A,
    // features_sports_honest_coverage_2026_05_05.plan.md). These 3 keys are
    // FEATURES_SPORTS_DATA_TYPE_META in deployment-api's sports_helpers.py —
    // `sports_honest_coverage()`'s per-league breakdown for the feature
    // calculators, distinct from the raw instruments-service SPORTS entities
    // above. SportsFeatureCoverageCard reads these via the same
    // `data_types` map (this mock endpoint is service-agnostic, so they
    // render alongside the instruments-service entities in mock mode).
    FIXTURE_FEATURES: {
      ..._mkVenue(320, 300, 0, 0),
      completion_pct: 93.75,
      found_shards: 300,
      expected_shards: 320,
      missing_shards: 20,
      unit: "fixture_dates",
      axis: "per_league_per_fixture_date",
      source: "api_football",
      expected_leagues: ["EPL", "LA_LIGA"],
      leagues: {
        EPL: {
          found_shards: 160,
          expected_shards: 160,
          missing_shards: 0,
          missing_dates: [],
          missing_count: 0,
          completion_pct: 100,
          unit: "fixture_dates",
        },
        LA_LIGA: {
          found_shards: 140,
          expected_shards: 160,
          missing_shards: 20,
          missing_dates: ["2026-06-01", "2026-06-02"],
          missing_count: 20,
          completion_pct: 87.5,
          unit: "fixture_dates",
        },
      },
    } as unknown as ReturnType<typeof _mkVenue>,
    ODDS_FEATURES: {
      ..._mkVenue(320, 290, 0, 0),
      completion_pct: 90.63,
      found_shards: 290,
      expected_shards: 320,
      missing_shards: 30,
      unit: "fixture_dates",
      axis: "per_league_per_fixture_date",
      source: "footystats",
      expected_leagues: ["EPL", "LA_LIGA"],
      leagues: {
        EPL: {
          found_shards: 150,
          expected_shards: 160,
          missing_shards: 10,
          missing_dates: ["2026-05-10"],
          missing_count: 10,
          completion_pct: 93.75,
          unit: "fixture_dates",
        },
        LA_LIGA: {
          found_shards: 140,
          expected_shards: 160,
          missing_shards: 20,
          missing_dates: [],
          missing_count: 20,
          completion_pct: 87.5,
          unit: "fixture_dates",
        },
      },
    } as unknown as ReturnType<typeof _mkVenue>,
    DERIVED_FEATURES: {
      ..._mkVenue(347, 310, 0, 0),
      completion_pct: 89.34,
      found_shards: 310,
      expected_shards: 347,
      missing_shards: 37,
      unit: "fixture_dates",
      axis: "per_league_per_fixture_date",
      source: "api_football",
      expected_leagues: ["EPL"],
      leagues: {
        EPL: {
          found_shards: 310,
          expected_shards: 347,
          missing_shards: 37,
          missing_dates: [],
          missing_count: 37,
          completion_pct: 89.34,
          unit: "fixture_dates",
        },
      },
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

// Test-only hook (mirrors __mockErrors/__mockRequests/__mockBreakdownDelayMs): a spec
// can widen the STANDARD per-request delay (the one every route pays via the bare
// `await delay();` at the top of handleRoute) to make an otherwise-sub-100ms loading
// state (e.g. a skeleton) reliably observable, without touching call sites that pass
// their own explicit ms (those are unaffected).
function getStandardMockDelayMs(): number {
  const override = (window as typeof window & { __mockDelayMs?: number }).__mockDelayMs;
  return override ?? MOCK_DELAY_MS;
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

// ---- Deployment observability inventory mock data (keep in lockstep with
// deployment-api deployments_inventory.py — DeploymentItem shape). Covers every
// umbrella (live/batch/paper/experiment) × cloud (GCP/AWS) × kind — incl. the
// service/function kinds the backend does NOT yet census (Cloud Run services, ECS
// services, Lambda, Cloud Functions), mocked here to iterate on the UI before wiring.
// Names + machine types mirror the REAL live estate (gcloud/aws census 2026-07-08). ----

interface MockDeploymentItem {
  name: string;
  kind:
    | "VM"
    | "CLOUD_RUN_JOB"
    | "CLOUD_RUN_SERVICE"
    | "ECS_SERVICE"
    | "LAMBDA"
    | "CLOUD_FUNCTION"
    | "DISK"
    | "STATIC_IP"
    | "SCHEDULER";
  umbrella: "LIVE" | "BATCH" | "PAPER" | "EXPERIMENT" | "NONE"; // NONE = a service (Mode="—")
  // WS-D full-estate additions.
  launched_by?: string | null;
  last_modified_at?: string | null;
  has_unreleased_resources?: boolean | null;
  unreleased_resources?: {
    type: string;
    name: string;
    size_gb?: number | null;
    disk_type?: string | null;
    est_monthly_usd: number;
    cost_basis?: string | null;
  }[];
  cloud: "GCP" | "AWS";
  service: string;
  asset_group: string;
  status: string;
  last_run_at: string | null;
  exit_code: number | null;
  heartbeat_age_seconds: number | null;
  captured_progress: number | null;
  run_log_uri: string | null;
  // --- Aligned to deployment-api DeploymentItem (deployments_inventory.py:176) ---
  machine_type?: string | null;
  zone?: string | null;
  cost_actual_usd?: number | null; // WS-E — net cost on the most recent complete billing day (USD)
  cost_avg_7d_usd?: number | null; // WS-E — trailing-7-day average daily net cost (USD)
  cost_projected_24h_usd?: number | null; // WS-E — projected $/day if it runs 24h (USD)
  // "complete" | "partial" | undefined — whether cost_actual_usd is a full billing day or fell
  // back to a still-accruing partial day (WS-1 decision 4, 2026-07-20). Colour-only UI signal.
  cost_basis?: "complete" | "partial" | null;
  // "approx" | undefined — the last-run/overlap date is DERIVED rather than authoritative
  // (heartbeat-stale VM, single-timestamp kind, unmanaged-VM fallback). Colour-only UI signal,
  // reuses the cost_basis "partial" convention (WS-2 decision 4, 2026-07-20).
  basis?: "approx" | null;
  // Resource summary scalars (inline Resources column). Full vector is on /detail.
  cpu_pct?: number | null;
  mem_pct?: number | null;
  mem_slope?: number | null;
  disk_pct?: number | null;
  uptime_hours?: number | null;
  composite_health_status?:
    | "working"
    | "stalled"
    | "oom-risk"
    | "workload-dead"
    | "disk-full"
    | "hung"
    | "dead"
    | "overdue"
    | "on-time"
    | "paused"
    // Service (Cloud Run / ECS) verdicts — the live inventory folds these into the same field.
    | "serving"
    | "scaled-to-zero"
    | "degraded"
    | "unknown"
    | null;
  health_status?: string | null; // raw GCE instance status
  boot_disk_name?: string | null;
  rows_in?: number | null;
  rows_error?: number | null;
  events_emitted?: number | null;
  // Service structural fields (Open-Q7 sub-taxonomy).
  cluster?: string | null;
  desired_count?: number | null;
  running_count?: number | null;
  task_definition_revision?: number | null;
  runtime?: string | null;
  memory_size_mb?: number | null;
  package_type?: string | null;
  revision?: string | null;
  region?: string | null;
  // Artifact-pipeline cross-link (Phase 3b) — the image/tarball this VM booted, straight off its
  // registry entry. Undefined/"" on every mock row except the one seeded for the git_commit
  // deep-link regression test below.
  image_digest?: string | null;
  git_commit?: string | null;
  // --- Mock-only fields (NOT on the real contract; kept so the /detail popover mock has
  //     data to show; the UI list no longer reads these). ---
  net_recv_mbps?: number | null;
  object_delta?: number | null;
  workload_alive?: boolean | null;
  requests_per_min?: number | null;
  error_rate_pct?: number | null;
  p99_latency_ms?: number | null;
  invocations_24h?: number | null;
  running_tasks?: number | null;
  health_detail?: string | null;
}

const MOCK_DEPLOYMENT_INVENTORY: MockDeploymentItem[] = [
  // ── GCP VMs (backend-supported today) ──────────────────────────────────────
  {
    name: "defi-live-capture-1",
    kind: "VM",
    umbrella: "LIVE",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "defi",
    status: "running",
    last_run_at: "2026-06-22T08:30:00Z",
    exit_code: null,
    heartbeat_age_seconds: 42,
    captured_progress: 18234,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/defi-live-capture-1/run.log",
    git_commit: "a557471",
    machine_type: "n2-highmem-16",
    zone: "asia-northeast1-c",
    cost_actual_usd: 38.4,
    cost_avg_7d_usd: 38.4,
    cost_projected_24h_usd: 38.4,
    cost_basis: "complete",
    cpu_pct: 58,
    mem_pct: 71,
    uptime_hours: 52,
    rows_in: 20100,
    rows_error: 12,
    events_emitted: 18234,
    disk_pct: 41,
    object_delta: 120,
    workload_alive: true,
    composite_health_status: "working",
    health_detail: "shard advancing · +120 objects/5m · mem stable",
  },
  {
    name: "cefi-live-trading-1",
    kind: "VM",
    umbrella: "LIVE",
    cloud: "AWS",
    service: "execution-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-06-22T08:29:00Z",
    exit_code: null,
    heartbeat_age_seconds: 900,
    captured_progress: null,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/cefi-live-trading-1/run.log",
    machine_type: "m7i.xlarge",
    zone: "ap-northeast-1",
    cost_actual_usd: 41.2,
    cost_avg_7d_usd: 41.2,
    cost_projected_24h_usd: 41.2,
    cost_basis: "partial",
    cpu_pct: 4,
    mem_pct: 63,
    disk_pct: 38,
    net_recv_mbps: 0,
    uptime_hours: 30,
    object_delta: 0,
    workload_alive: true,
    composite_health_status: "stalled",
    health_detail: "websocket idle — 0 inbound ticks 12m, no new objects (cpu 4%)",
  },
  {
    name: "cefi-backfill-20260620",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "cefi",
    status: "succeeded",
    last_run_at: "2026-06-20T22:14:00Z",
    exit_code: 0,
    heartbeat_age_seconds: null,
    captured_progress: 412000,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/cefi-backfill-20260620/run.log",
    machine_type: "n2-highmem-16 (SPOT)",
    zone: "asia-northeast1-c",
    cost_actual_usd: 9.1,
    cost_avg_7d_usd: 9.1,
    cost_projected_24h_usd: 9.1,
    cpu_pct: 88,
    rows_in: 415000,
    rows_error: 300,
  },
  {
    name: "sports-backfill-20260621",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "sports",
    status: "failed",
    last_run_at: "2026-06-21T03:11:00Z",
    exit_code: 137,
    heartbeat_age_seconds: null,
    captured_progress: 0,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/sports-backfill-20260621/run.log",
    machine_type: "e2-highmem-4 (SPOT)",
    zone: "asia-northeast1-c",
    cost_actual_usd: 0.6,
    cost_avg_7d_usd: 0.6,
    cost_projected_24h_usd: 0.6,
    rows_in: 0,
    rows_error: 1,
  },
  {
    name: "exp-ml-018f4-20260619",
    kind: "VM",
    umbrella: "EXPERIMENT",
    cloud: "GCP",
    service: "ml-service",
    asset_group: "defi",
    status: "succeeded",
    last_run_at: "2026-06-19T14:00:00Z",
    exit_code: 0,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/exp-ml-018f4-20260619/run.log",
    machine_type: "a2-highgpu-1g",
    zone: "asia-northeast1-c",
    cost_actual_usd: 24.5,
    cost_avg_7d_usd: 24.5,
    cost_projected_24h_usd: 24.5,
    cpu_pct: 91,
  },
  {
    name: "defi-paper-trading-1",
    kind: "VM",
    umbrella: "PAPER",
    cloud: "GCP",
    service: "strategy-service",
    asset_group: "defi",
    status: "running",
    last_run_at: "2026-06-22T08:25:00Z",
    exit_code: null,
    heartbeat_age_seconds: 120,
    captured_progress: null,
    run_log_uri: "gs://deployment-scripts-prd/vm-logs/defi-paper-trading-1/run.log",
    machine_type: "n2-standard-8",
    zone: "asia-northeast1-c",
    cost_actual_usd: 11.4,
    cost_avg_7d_usd: 11.4,
    cost_projected_24h_usd: 11.4,
    cpu_pct: 22,
    mem_pct: 94,
    mem_slope: 2.3,
    disk_pct: 55,
    uptime_hours: 96,
    object_delta: 30,
    workload_alive: true,
    composite_health_status: "oom-risk",
    health_detail: "mem 94% climbing +2.3%/min → OOM in ~8m",
  },
  {
    name: "mtds-perp-funding-backfill",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-07-08T07:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: 30,
    captured_progress: 51000,
    run_log_uri: null,
    machine_type: "n2-highmem-16",
    zone: "asia-northeast1-c",
    cost_actual_usd: 32.0,
    cost_avg_7d_usd: 32.0,
    cost_projected_24h_usd: 32.0,
    cpu_pct: 1,
    mem_pct: 12,
    disk_pct: 44,
    uptime_hours: 18,
    object_delta: 0,
    workload_alive: false,
    composite_health_status: "workload-dead",
    health_detail: "daemon heartbeating (30s) but workload PID gone — OOM-killed, no exit written yet",
  },
  {
    name: "mtds-dex-swaps-backfill",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "defi",
    status: "running",
    last_run_at: "2026-07-08T06:30:00Z",
    exit_code: null,
    heartbeat_age_seconds: 25,
    captured_progress: 128000,
    run_log_uri: null,
    machine_type: "n2-highmem-16",
    zone: "asia-northeast1-c",
    cost_actual_usd: 33.5,
    cost_avg_7d_usd: 33.5,
    cost_projected_24h_usd: 33.5,
    cpu_pct: 28,
    mem_pct: 47,
    disk_pct: 97,
    net_recv_mbps: 6.2,
    uptime_hours: 20,
    object_delta: 0,
    workload_alive: true,
    composite_health_status: "disk-full",
    health_detail: "disk 97% — parquet writes failing; no new objects 14m",
  },
  {
    name: "tradfi-bf-cme-ohlcv-1m-es-2025",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "tradfi",
    status: "running",
    last_run_at: "2026-07-08T03:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: 2400,
    captured_progress: 4200,
    run_log_uri: null,
    machine_type: "e2-highmem-4 (SPOT)",
    zone: "asia-northeast1-c",
    cost_actual_usd: 0.9,
    cost_avg_7d_usd: 0.9,
    cost_projected_24h_usd: 0.9,
    cpu_pct: null,
    mem_pct: null,
    uptime_hours: 10,
    object_delta: 0,
    workload_alive: null,
    composite_health_status: "hung",
    health_detail: "heartbeat stale 40m but GCE reports RUNNING — whole-VM wedge (no /proc samples)",
  },
  {
    name: "cefi-instruments-backfill",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "instruments-service",
    asset_group: "cefi",
    status: "stopped",
    last_run_at: "2026-07-07T22:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "e2-standard-4",
    zone: "asia-northeast1-c",
    cost_actual_usd: 0,
    cost_avg_7d_usd: 0,
    cost_projected_24h_usd: 0,
    uptime_hours: null,
    composite_health_status: "dead",
    health_detail: "control-plane reports the instance TERMINATED — no live workload",
  },
  // ── GCP Cloud Run JOBS (registered ones supported; the last two are OFF-registry → hidden today) ──
  {
    name: "manifest-consolidator",
    kind: "CLOUD_RUN_JOB",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "all",
    status: "succeeded",
    last_run_at: "2026-06-22T08:00:00Z",
    exit_code: 0,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "2Gi·2vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 2.3,
    cost_avg_7d_usd: 2.3,
    cost_projected_24h_usd: 2.3,
  },
  {
    name: "funding-ensemble-paper-week",
    kind: "CLOUD_RUN_JOB",
    umbrella: "PAPER",
    cloud: "GCP",
    service: "strategy-service",
    asset_group: "cefi",
    status: "stale",
    last_run_at: "2026-06-21T06:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "1Gi·1vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 0.4,
    cost_avg_7d_usd: 0.4,
    cost_projected_24h_usd: 0.4,
    basis: "approx", // single-timestamp kind (Cloud Run job) — last_run_at is never authoritative
  },
  {
    name: "market-tick-cefi-binance-futures",
    kind: "CLOUD_RUN_JOB",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "market-tick-data-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-07-08T09:15:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: 88000,
    run_log_uri: null,
    machine_type: "4Gi·4vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 5.1,
    cost_avg_7d_usd: 5.1,
    cost_projected_24h_usd: 5.1,
    rows_in: 90000,
    rows_error: 40,
  },
  {
    name: "paper-trading-engine",
    kind: "CLOUD_RUN_JOB",
    umbrella: "PAPER",
    cloud: "GCP",
    service: "strategy-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-07-08T09:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "2Gi·2vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 1.7,
    cost_avg_7d_usd: 1.7,
    cost_projected_24h_usd: 1.7,
  },
  // ── GCP Cloud Run SERVICES (always-on prod — NOT censused by the backend today) ──
  {
    name: "uts-shared-deployment-api",
    kind: "CLOUD_RUN_SERVICE",
    umbrella: "NONE",
    cloud: "GCP",
    service: "deployment-api",
    asset_group: "all",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "512Mi·1vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 3.8,
    cost_avg_7d_usd: 3.8,
    cost_projected_24h_usd: 3.8,
    cpu_pct: 12,
    mem_pct: 34,
    uptime_hours: 168,
    requests_per_min: 240,
    error_rate_pct: 0.2,
    p99_latency_ms: 85,
    revision: "deployment-api-00042-abc",
    // Service-only composite verdict — regression guard for the crash on a health value outside the
    // VM/scheduler vocabulary (deployment_full_estate_cost_provenance: live serving Cloud Run svc).
    composite_health_status: "serving",
  },
  {
    name: "market-data-query-service",
    kind: "CLOUD_RUN_SERVICE",
    umbrella: "NONE",
    cloud: "GCP",
    service: "market-data-query-service",
    asset_group: "all",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "1Gi·2vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 6.2,
    cost_avg_7d_usd: 6.2,
    cost_projected_24h_usd: 6.2,
    cpu_pct: 27,
    mem_pct: 41,
    uptime_hours: 720,
    requests_per_min: 1350,
    error_rate_pct: 0.1,
    p99_latency_ms: 42,
    revision: "mdq-00311-def",
  },
  {
    name: "dp-alerting-subscriber",
    kind: "CLOUD_RUN_SERVICE",
    umbrella: "NONE",
    cloud: "GCP",
    service: "alerting",
    asset_group: "all",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "512Mi·1vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 1.4,
    cost_avg_7d_usd: 1.4,
    cost_projected_24h_usd: 1.4,
    cpu_pct: 6,
    mem_pct: 22,
    uptime_hours: 500,
    requests_per_min: 12,
    error_rate_pct: 0.0,
    p99_latency_ms: 60,
    revision: "alerting-00088-aaa",
  },
  {
    name: "quota-broker",
    kind: "CLOUD_RUN_SERVICE",
    umbrella: "NONE",
    cloud: "GCP",
    service: "quota-broker",
    asset_group: "all",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "512Mi·1vCPU",
    zone: "asia-northeast1",
    cost_actual_usd: 1.9,
    cost_avg_7d_usd: 1.9,
    cost_projected_24h_usd: 1.9,
    cpu_pct: 19,
    mem_pct: 38,
    uptime_hours: 300,
    requests_per_min: 88,
    error_rate_pct: 3.4,
    p99_latency_ms: 210,
    revision: "quota-broker-00104-zzz",
  },
  // ── AWS ECS/Fargate SERVICES (DeFi execution estate — NOT censused today) ──
  {
    name: "uts-execution-service-prod",
    kind: "ECS_SERVICE",
    umbrella: "NONE",
    cloud: "AWS",
    service: "execution-service",
    asset_group: "defi",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "1vCPU·2GB Fargate",
    zone: "ap-northeast-1",
    cost_actual_usd: 14.6,
    cost_avg_7d_usd: 14.6,
    cost_projected_24h_usd: 14.6,
    cpu_pct: 35,
    mem_pct: 52,
    uptime_hours: 240,
    requests_per_min: 60,
    error_rate_pct: 0.3,
    cluster: "uts-defi-prod",
    desired_count: 2,
    running_count: 2,
    task_definition_revision: 31,
    revision: "uts-execution-service-prod:31",
  },
  {
    name: "uts-strategy-service-prod",
    kind: "ECS_SERVICE",
    umbrella: "NONE",
    cloud: "AWS",
    service: "strategy-service",
    asset_group: "defi",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "0.5vCPU·1GB Fargate",
    zone: "ap-northeast-1",
    cost_actual_usd: 9.2,
    cost_avg_7d_usd: 9.2,
    cost_projected_24h_usd: 9.2,
    cpu_pct: 18,
    mem_pct: 44,
    uptime_hours: 240,
    cluster: "uts-defi-prod",
    desired_count: 2,
    running_count: 1,
    task_definition_revision: 27,
    revision: "uts-strategy-service-prod:27",
    // desired 2 / running 1 → genuinely degraded; another service-only verdict the row must render.
    composite_health_status: "degraded",
  },
  // ── AWS Lambda (NOT censused today) ──
  {
    name: "ses-email-forwarder",
    kind: "LAMBDA",
    umbrella: "NONE",
    cloud: "AWS",
    service: "email",
    asset_group: "all",
    status: "running",
    last_run_at: "2026-07-08T09:40:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "128MB",
    zone: "us-east-1",
    cost_actual_usd: 0.1,
    cost_avg_7d_usd: 0.1,
    cost_projected_24h_usd: 0.1,
    invocations_24h: 342,
    error_rate_pct: 0.0,
    p99_latency_ms: 210,
  },
  // ── GCP Cloud Function gen2 (NOT censused today) ──
  {
    name: "trigger-market-tick-cefi-job",
    kind: "CLOUD_FUNCTION",
    umbrella: "NONE",
    cloud: "GCP",
    service: "instruments-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-07-08T09:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    machine_type: "256MB gen2",
    zone: "asia-northeast1",
    cost_actual_usd: 0.2,
    cost_avg_7d_usd: 0.2,
    cost_projected_24h_usd: 0.2,
    invocations_24h: 24,
    error_rate_pct: 0.0,
  },
  // ── WS-D full-estate fixtures — unmanaged / leaked / orphaned / scheduled / lambda ──
  {
    // A 16-day zombie: unmanaged (adhoc) + stopped + still holding a data disk (leaked cost).
    name: "wsd-zombie-adhoc-vm",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "wsd-zombie-adhoc-vm",
    asset_group: "cefi",
    status: "stopped",
    last_run_at: "2026-06-23T17:16:12Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "adhoc",
    health_status: "TERMINATED",
    has_unreleased_resources: true,
    unreleased_resources: [
      {
        type: "DISK",
        name: "wsd-zombie-data",
        size_gb: 200,
        disk_type: "pd-ssd",
        est_monthly_usd: 44,
        cost_basis: "inferred",
      },
    ],
  },
  {
    // A running ad-hoc launch (a second adhoc row so the launched-by filter isolates >1).
    name: "wsd-onchain-canon-vm",
    kind: "VM",
    umbrella: "BATCH",
    cloud: "GCP",
    service: "wsd-onchain-canon-vm",
    asset_group: "defi",
    status: "running",
    last_run_at: "2026-07-09T12:30:56Z",
    exit_code: null,
    heartbeat_age_seconds: 40,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "adhoc",
    health_status: "RUNNING",
  },
  {
    // A truly-orphaned persistent disk (no owning VM) — a first-class DISK row.
    name: "wsd-orphan-disk-01",
    kind: "DISK",
    umbrella: "NONE",
    cloud: "GCP",
    service: "wsd-orphan-disk-01",
    asset_group: "",
    status: "stopped",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "unknown",
    has_unreleased_resources: true,
    unreleased_resources: [
      {
        type: "DISK",
        name: "wsd-orphan-disk-01",
        size_gb: 500,
        disk_type: "pd-standard",
        est_monthly_usd: 26,
        cost_basis: "inferred",
      },
    ],
  },
  {
    // A reserved static IP with no owner — a first-class STATIC_IP row.
    name: "wsd-orphan-ip-01",
    kind: "STATIC_IP",
    umbrella: "NONE",
    cloud: "GCP",
    service: "wsd-orphan-ip-01",
    asset_group: "",
    status: "stopped",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "unknown",
    region: "asia-northeast1",
    has_unreleased_resources: true,
    unreleased_resources: [{ type: "STATIC_IP", name: "wsd-orphan-ip-01", est_monthly_usd: 7, cost_basis: "inferred" }],
  },
  {
    // A Cloud Scheduler job that is OVERDUE (fired late / last attempt failed).
    name: "wsd-consolidator-cron",
    kind: "SCHEDULER",
    umbrella: "NONE",
    cloud: "GCP",
    service: "prd-manifest-consolidator-cefi",
    asset_group: "cefi",
    status: "failed",
    last_run_at: "2026-07-10T10:00:00Z",
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "control-plane",
    composite_health_status: "overdue",
  },
  {
    // AWS Lambda — last_run_at honestly-absent; last-MODIFIED shown with a tooltip.
    name: "wsd-webhook-lambda",
    kind: "LAMBDA",
    umbrella: "BATCH",
    cloud: "AWS",
    service: "wsd-webhook-lambda",
    asset_group: "cefi",
    status: "running",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    launched_by: "unknown",
    last_modified_at: "2026-06-22T09:00:00Z",
    runtime: "python3.13",
    memory_size_mb: 256,
  },
];

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
    promotionModel?: string | null;
    stagingDormantMode?: boolean;
    deployModel?: string | null;
    deployHost?: string | null;
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
    // Dual-cloud image signal (operator 2026-06-22) — the ImageCell renders GCP + AWS side-by-side
    // via image_gcp / image_aws props. image_gcp mirrors `image` (the active/primary cloud);
    // image_aws is null in this mock (no AWS builds seeded) so the AWS line shows "—".
    image_gcp: {
      last_build_status: ciStatus === "FAILING" ? "FAILURE" : "SUCCESS",
      last_build_sha: ciStatus === "FAILING" ? "fae1ed0" : "aaa1111",
      last_build_time: ciStatus === "FAILING" ? "2026-06-11T09:15:00Z" : "2026-06-11T07:30:00Z",
      last_build_log_url: "https://console.cloud.google.com/cloud-build/builds/mock-latest",
      last_success_sha: "aaa1111",
      last_success_time: "2026-06-11T07:30:00Z",
      last_success_log_url: "https://console.cloud.google.com/cloud-build/builds/mock-success",
      deployed_version: "1.2.0",
      image_stale: ciStatus === "FAILING",
      deploy_model: opts.deployModel ?? null,
      deploy_host: opts.deployHost ?? null,
    },
    image_aws: null,
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
    // Slack↔/repos parity (ci_status_repos_promotion_failure_parity_2026_06_25): an open promotion
    // PR stuck on a BLOCKING class (failing_check / conflicting / skip_ci_jammed) → the repo's
    // promotion is blocked, surfaced at the headline even when ci_status reads green. Derived from
    // prs (same per-PR signal the backend uses) so the mock can't drift from the real contract.
    promotion_blocked: prs.some(
      (pr) =>
        pr.stuck_class === "failing_check" || pr.stuck_class === "conflicting" || pr.stuck_class === "skip_ci_jammed",
    ),
    // WS-L staging-dormant: a repo promoting LDR→main directly (promotion_model=ldr_main) or under the
    // fleet toggle — drives isStagingDormant → hop-pills suppressed + the panel's "LDR→main" framing.
    promotion_model: opts.promotionModel ?? null,
    staging_dormant_mode: opts.stagingDormantMode ?? false,
    // dep-order (operator 2026-06-19): tier + deps holding this repo + repos this repo holds.
    tier,
    blocked_by: blockedBy,
    blocking,
    // Codebase-health metrics (2026-06-19): coverage%, QG fail reason, oversized-file counts.
    // FAILING repos: lower coverage + a qg_red_reason; healthy repos: high coverage, clean.
    codebase_health:
      repoType === "tool"
        ? null
        : {
            coverage_pct: ciStatus === "FAILING" ? 58 : ciStatus === "STAGING_GREEN" ? 74 : 87,
            qg_red_reason: ciStatus === "FAILING" ? "basedpyright" : ciStatus === "STAGING_GREEN" ? "pytest" : null,
            large_file_count: ciStatus === "FAILING" ? 2 : 0,
            warn_file_count: ciStatus === "FAILING" ? 3 : ciStatus === "STAGING_GREEN" ? 1 : 0,
          },
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
    // Slack↔/repos parity (ci_status_repos_promotion_failure_parity_2026_06_25): the PM PR-547 case —
    // a MAIN_GREEN repo whose LDR→main promotion PR's required quality-gates-v2 FAILED (paged Slack
    // CRITICAL). Content already squash-merged (zero deltas) so drain_stalled does NOT fire and the
    // per-branch SHAs read green — only promotion_blocked surfaces the failing promotion. Proves the
    // headline shows "PROMOTION FAILING" despite the green MAIN_GREEN status.
    mockRepoCiRow(
      "unified-trading-pm",
      "devops",
      "MAIN_GREEN",
      [mockRepoCiPr("unified-trading-pm", 547, "main", "failing_check", "blocked")],
      false,
      false,
      "0",
      [],
      [],
      {
        deltas: [
          { base: "staging", head: "live-defi-rollout", ahead_by: 0, behind_by: 0, files_changed: 0 },
          { base: "main", head: "staging", ahead_by: 0, behind_by: 0, files_changed: 0 },
          { base: "main", head: "live-defi-rollout", ahead_by: 0, behind_by: 0, files_changed: 0 },
        ],
        lagMin: null,
      },
    ),
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
      // WS-L "track the deployed artifact": agent-orchestrator runs from SOURCE on the VM — no image
      // build → the GCP image column reads "N/A · source-deployed", not a misleading "no access".
      deployModel: "source",
    }),
    // WS-L staging-dormant regression (operator 2026-06-28: dormant staging signals must SHOW muted,
    // not be hidden). A repo promoting LDR→main DIRECTLY (promotion_model=ldr_main) carrying REAL
    // LDR→staging (35f) + staging→main (14f) deltas: the hop pills + the "LDR→staging drain behind"
    // stall reason STILL render, but MUTED (grey, never red) + a "dormant" tag — so the data is visible
    // yet reads as ignored. Pairs with agent-orchestrator (the NON-dormant staging-to-main case whose
    // identical signals render RED/actionable) to prove dormancy only changes STYLING, not presence.
    // drain_stalled=false so the muted stall-reason chip (not the drain-stalled chip) is exercised.
    mockRepoCiRow("alerting-service", "service", "MAIN_GREEN", [], false, false, "service", [], [], {
      deltas: [
        { base: "staging", head: "live-defi-rollout", ahead_by: 20, behind_by: 0, files_changed: 35 },
        { base: "main", head: "staging", ahead_by: 8, behind_by: 0, files_changed: 14 },
        { base: "main", head: "live-defi-rollout", ahead_by: 24, behind_by: 0, files_changed: 4 },
      ],
      lagMin: 60,
      drainStalled: false,
      promotionModel: "ldr_main",
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

// Gap-4 escalations proxy (mirrors deployment-api _mock_escalations) — one dispatched
// entry (greeks-service, slot assigned) + one queued entry (execution-service, no slot yet),
// so the Repos-CI Agent column renders both "agent working" (blue) and "agent queued" (yellow).
function mockEscalations() {
  return {
    available: true,
    reason: "",
    escalations: [
      {
        escalation_id: "esc-001",
        status: "dispatched",
        repo: "greeks-service",
        pr_number: 547,
        wall_type: "failing_check",
        slot_id: 3,
        created_at: "2026-06-27T07:10:00Z",
        dispatched_at: "2026-06-27T07:12:00Z",
        attempts: 1,
      },
      {
        escalation_id: "esc-002",
        status: "queued",
        repo: "execution-service",
        pr_number: 312,
        wall_type: "skip_ci_jammed",
        slot_id: null,
        created_at: "2026-06-27T07:15:00Z",
        dispatched_at: null,
        attempts: 0,
      },
    ],
  };
}

// Version-coherence panel (mirrors deployment-api routes/version_coherence.py's own mock fixture —
// one repo per verdict class so every chip tone is exercised, pinned by the playwright regression
// spec tests/smoke/verdict-store-panels.spec.ts).
function mockVersionCoherenceOverview() {
  return {
    generated_at: "2026-07-27T12:00:00+00:00",
    source: "mock",
    repos: {
      "unified-trading-library": { verdict: "OK", reasons: [], checked_at: "2026-07-27T11:30:00Z" },
      "instruments-service": {
        verdict: "VERSION_SPLIT",
        reasons: ["instruments-service: version split (source pyproject.version != manifest SSOT)"],
        checked_at: "2026-07-27T11:30:00Z",
      },
      "deployment-api": {
        verdict: "VESTIGIAL_SCALAR_DRIFT",
        reasons: ["deployment-api: repositories{}.version=0.42.0 != versions{}=0.57.0"],
        checked_at: "2026-07-27T11:30:00Z",
      },
      "strategy-service": {
        verdict: "DEP_FLOOR_UNSATISFIABLE",
        reasons: [
          "strategy-service -> unified-trading-library: versions{}=0.48.0 does not satisfy declared range '>=0.60.0,<1.0.0'",
        ],
        checked_at: "2026-07-27T11:30:00Z",
      },
    },
  };
}

// Change-freeze panel (mirrors deployment-api routes/change_freeze.py's own mock fixture — one
// BLOCKED + one CLEAR check_type so the banner's both states are exercised).
function mockChangeFreezeStatus() {
  return {
    generated_at: "2026-07-27T12:00:00+00:00",
    source: "mock",
    checks: {
      PROD_DEPLOY: {
        verdict: "BLOCKED",
        reason: "US market open volatility window (freeze-us-open): 13:25 to 13:55 UTC",
        checked_at: "2026-07-27T13:30:00Z",
      },
      AUTONOMOUS: { verdict: "CLEAR", reason: null, checked_at: "2026-07-27T13:30:00Z" },
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
  const entries: {
    kind: string;
    timestamp: string;
    repo: string;
    workflow_name: string;
    severity: string;
    conclusion: string;
    message: string;
    run_url: string | null;
    alert_class?: string | null;
    deployment_target?: string | null;
  }[] = [
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
    {
      // Infra/deployment alert (parity #4) — carries a deployment target → an internal /deployments link.
      // Timestamp kept EARLIER than the CI alerts so it never displaces alert-entry-0 in existing specs.
      kind: "vm_down",
      timestamp: "2026-06-10T11:00:00Z",
      repo: "deployment-service",
      workflow_name: "vm-watchdog",
      severity: "CRITICAL",
      conclusion: "failure",
      message: "VM DOWN: cefi-binance-futures-backfill stopped heartbeating (umbrella=batch)",
      run_url: null,
      alert_class: "vm_down",
      deployment_target: "cefi-binance-futures-backfill",
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
  const ordered = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return {
    generated_at: new Date().toISOString(),
    source: "mock",
    alerts: ordered,
    streams,
    // Fixture is small + static — always a single, uncapped page (mirrors deployment-api's
    // _mock_alerts()).
    days: 30,
    total_count: ordered.length,
    returned_count: ordered.length,
    offset: 0,
    limit: ordered.length,
    capped: false,
  };
}

// --- Cost observability mocks (mirror deployment-api routes/costs.py shapes) ---
const MOCK_COST_CLOUDS: Record<string, { base: number; wobble: number; placeholder: boolean; delta: number }> = {
  gcp: { base: 480, wobble: 70, placeholder: false, delta: 12.4 },
  aws: { base: 22, wobble: 9, placeholder: false, delta: -5.2 },
  github: { base: 8.8, wobble: 0.6, placeholder: true, delta: 0.1 },
};
function mockCostDates(days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
  );
}
/** The resolved window for a mock cost query — mirrors the real service's `_resolve_window`. */
interface MockCostWindow {
  days: number;
  dates: string[];
  start: string;
  end: string;
}
/**
 * Resolve `start_date`+`end_date` (inclusive) else the trailing `days`, exactly as the backend does.
 *
 * Mock mode has to honour the range for the same reason the fixtures are copied from the UAC SSOT
 * rather than invented: a mock that quietly ignored `start_date` would answer every window with
 * "last 30 days", so the picker would look like it worked while the numbers never moved — mock mode
 * agreeing with a bug, which is worse than having no mock.
 */
function mockCostWindow(params: URLSearchParams): MockCostWindow {
  const start = params.get("start_date");
  const end = params.get("end_date");
  if (start && end) {
    const dates: string[] = [];
    for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    if (dates.length > 0) return { days: dates.length, dates, start, end };
  }
  const days = Number(params.get("days") ?? 30);
  const dates = mockCostDates(days);
  return { days, dates, start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" };
}
function mockCostDaily(cloud: string, days: number): number[] {
  const c = MOCK_COST_CLOUDS[cloud];
  return Array.from({ length: days }, (_, i) => Math.max(0, +(c.base + c.wobble * Math.sin(i / 3)).toFixed(4)));
}
function mockCostSummary(win: MockCostWindow) {
  const days = win.days;
  const clouds = ["gcp", "aws", "github"].map((cloud) => {
    const daily = mockCostDaily(cloud, days);
    const net = +daily.reduce((a, b) => a + b, 0).toFixed(2);
    // GCP carries ~20% promotional credit (mirrors the real billing export); AWS/GitHub have none.
    const credit = cloud === "gcp" ? -+(net * 0.2).toFixed(2) : 0;
    const gross = +(net - credit).toFixed(2); // net = gross + credit (credit ≤ 0)
    // GCP bills in GBP; mock native at a fixed 0.75 rate. USD-native clouds mirror the USD values.
    const rate = cloud === "gcp" ? 0.75 : 1;
    return {
      cloud,
      total: net,
      gross,
      credit,
      delta_pct: MOCK_COST_CLOUDS[cloud].delta,
      daily,
      is_placeholder: MOCK_COST_CLOUDS[cloud].placeholder,
      currency: cloud === "gcp" ? "GBP" : "USD",
      total_native: +(net * rate).toFixed(2),
      gross_native: +(gross * rate).toFixed(2),
      credit_native: +(credit * rate).toFixed(2),
    };
  });
  const total = +clouds.reduce((a, c) => a + c.total, 0).toFixed(2);
  const gross = +clouds.reduce((a, c) => a + c.gross, 0).toFixed(2);
  const credit = +clouds.reduce((a, c) => a + c.credit, 0).toFixed(2);
  return {
    days,
    start_date: win.start,
    end_date: win.end,
    total,
    gross,
    credit,
    run_rate_daily: +(total / days).toFixed(2),
    delta_pct: 8.1,
    dates: win.dates,
    clouds,
    // A window that ENDS in the past has nothing unreconciled in it — the provisional band is a
    // trailing-edge artifact, so a historical range must not claim one.
    provisional_days: win.end >= mockCostDates(1)[0] ? 2 : 0,
    generated_at: new Date().toISOString(),
  };
}
function mockCostTimeseries(win: MockCostWindow, cloud: string) {
  const clouds = cloud === "all" ? ["gcp", "aws", "github"] : [cloud];
  const daily: Record<string, number[]> = {};
  clouds.forEach((c) => (daily[c] = mockCostDaily(c, win.days)));
  return {
    days: win.days,
    start_date: win.start,
    end_date: win.end,
    clouds,
    points: win.dates.map((date, i) => ({ date, values: Object.fromEntries(clouds.map((c) => [c, daily[c][i]])) })),
  };
}
// ── Artifact pipeline (mirrors deployment-api routes/artifacts.py) — /ops/artifacts page ──────────
// Representative build history: image + tarball lanes, GCP + AWS, a cross-lane commit (built both
// ways), a duplicated commit (wasted), and one structured failure with a step timeline — enough for
// the page's stat band, row filters, and failure drawer to be exercised by the smoke spec.
type MockBuildOverrides = {
  repo: string;
  lane: "image" | "tarball";
  cloud: "gcp" | "aws";
  status: string;
  sha: string;
  started_at: string;
  duration: string;
  trigger?: string;
  branch?: string;
  produced?: string;
  build_id?: string;
  failure?: string;
  failure_type?: string;
  failure_detail?: string;
  log_url?: string;
  dup?: boolean;
  cross_lane?: boolean;
  steps?: { name: string; status: string; seconds: number }[];
};
function mockBuild(o: MockBuildOverrides) {
  return {
    repo: o.repo,
    lane: o.lane,
    cloud: o.cloud,
    status: o.status,
    trigger: o.trigger ?? `${o.repo}-build`,
    sha: o.sha,
    branch: o.branch ?? "main",
    started_at: o.started_at,
    duration: o.duration,
    produced: o.produced ?? "",
    build_id: o.build_id ?? `${o.repo}-${o.sha}`,
    failure: o.failure ?? "",
    failure_type: o.failure_type ?? "",
    failure_detail: o.failure_detail ?? "",
    log_url: o.log_url ?? "",
    dup: o.dup ?? false,
    cross_lane: o.cross_lane ?? false,
    steps: o.steps ?? [],
  };
}
function mockArtifactBuilds(params: URLSearchParams) {
  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  const days = Number(params.get("days") ?? 14);
  const start =
    params.get("start_date") ?? new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const end = params.get("end_date") ?? now.toISOString().slice(0, 10);

  const rows = [
    mockBuild({
      repo: "deployment-api",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "a557471",
      started_at: at(1),
      duration: "9m02s",
      produced: "asia-northeast1-docker.pkg.dev/…/deployment-api:a557471",
    }),
    mockBuild({
      repo: "unified-trading-library",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "4b2f8bc",
      started_at: at(2),
      duration: "7m59s",
    }),
    mockBuild({
      repo: "features",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "abc1234",
      started_at: at(3),
      duration: "6m10s",
      cross_lane: true,
    }),
    mockBuild({
      repo: "features",
      lane: "tarball",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "abc1234",
      started_at: at(3.2),
      duration: "22s",
      cross_lane: true,
    }),
    mockBuild({
      repo: "deployment-service",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "f000ee3",
      started_at: at(4),
      duration: "3m42s",
      dup: true,
    }),
    mockBuild({
      repo: "deployment-service",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      sha: "f000ee3",
      started_at: at(4.3),
      duration: "3m40s",
      dup: true,
    }),
    mockBuild({
      repo: "market-tick-data-service",
      lane: "image",
      cloud: "gcp",
      status: "FAILURE",
      sha: "16204df",
      started_at: at(5),
      duration: "1m18s",
      failure: "docker build exited 1",
      failure_type: "USER_BUILD_STEP",
      failure_detail: "Step #3 - 'docker-build': COPY failed: no source files",
      log_url: "https://console.cloud.google.com/cloud-build/builds/mock",
      steps: [
        { name: "lint", status: "SUCCESS", seconds: 4 },
        { name: "docker-build", status: "FAILURE", seconds: 74 },
      ],
    }),
    mockBuild({
      repo: "execution-service",
      lane: "image",
      cloud: "aws",
      status: "SUCCESS",
      sha: "9e11c02",
      started_at: at(30),
      duration: "5m03s",
      trigger: "codebuild-execution",
    }),
    // Real Cloud Build / CodeBuild ids are globally unique — even a dup-SHA or cross-lane pair are
    // two distinct builds. Stamp unique ids so the (build_id-keyed) rows reconcile correctly.
  ].map((r, i) => ({ ...r, build_id: `cb-${1000 + i}` }));

  const completed = rows.filter((r) => r.status === "SUCCESS" || r.status === "FAILURE");
  const failed = rows.filter((r) => r.status === "FAILURE").length;
  const success = rows.filter((r) => r.status === "SUCCESS").length;
  return {
    days,
    start_date: start,
    end_date: end,
    generated_at: now.toISOString(),
    rows,
    stats: {
      total: rows.length,
      success_rate: completed.length ? +((100 * success) / completed.length).toFixed(1) : 0,
      failed,
      median_duration_sec: 479, // formats to 7m59s in the tile
      wasted_dup: 1, // the f000ee3 pair
    },
  };
}

type MockDeployOverrides = {
  workload: string;
  revision: string;
  cloud: "gcp" | "aws";
  digest: string;
  change_type: "new" | "config" | "rollback" | "failed";
  at: string;
  held_for?: string;
  live?: boolean;
  deployer?: string;
};
function mockDeploy(o: MockDeployOverrides) {
  return {
    workload: o.workload,
    revision: o.revision,
    cloud: o.cloud,
    digest: o.digest,
    built_from: "",
    resolvable: false,
    change_type: o.change_type,
    at: o.at,
    held_for: o.held_for ?? "",
    live: o.live ?? false,
    deployer: o.deployer ?? "Cloud Build",
    link_kind: "revision",
    section: "",
  };
}
function mockArtifactDeploys(params: URLSearchParams) {
  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  const days = Number(params.get("days") ?? 7);
  const start =
    params.get("start_date") ?? new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const end = params.get("end_date") ?? now.toISOString().slice(0, 10);

  const rows = [
    mockDeploy({
      workload: "uts-shared-deployment-api",
      revision: "uts-shared-deployment-api-00255-rtk",
      cloud: "gcp",
      digest: "sha256:c05dd3d678ef",
      change_type: "new",
      at: at(1),
      live: true,
    }),
    mockDeploy({
      workload: "uts-shared-deployment-api",
      revision: "uts-shared-deployment-api-00254-djz",
      cloud: "gcp",
      digest: "sha256:261137b83e42",
      change_type: "config",
      at: at(3.6),
      held_for: "2h36m",
    }),
    mockDeploy({
      workload: "deployment-dashboard",
      revision: "deployment-dashboard-00221-pbq",
      cloud: "gcp",
      digest: "sha256:37a9ab503fb9",
      change_type: "new",
      at: at(2),
      live: true,
    }),
    mockDeploy({
      workload: "deployment-service",
      revision: "deployment-service-00001-lqw",
      cloud: "gcp",
      digest: "sha256:83803e21331f",
      change_type: "failed",
      at: at(20),
      live: true, // the newest attempt Cloud Run has, even though it never went ready
      deployer: "unified-trading-sa",
    }),
  ];

  const total = rows.length;
  const configOnly = rows.filter((r) => r.change_type === "config").length;
  const failed = rows.filter((r) => r.change_type === "failed").length;
  const liveNow = rows.filter((r) => r.live).length;
  return {
    days,
    start_date: start,
    end_date: end,
    generated_at: now.toISOString(),
    rows,
    stats: {
      total,
      config_only_pct: total ? +((100 * configOnly) / total).toFixed(1) : 0,
      live_now: liveNow,
      failed,
    },
  };
}
type MockImageRow = {
  repo: string;
  cloud: "gcp" | "aws";
  registry: string;
  image_count: number;
  tags: string[];
  last_pushed: string;
  running_on: string;
  state: string;
  size_bytes: number | null;
  is_aggregate?: boolean;
  note?: string;
};
function mockImage(o: MockImageRow) {
  return { is_aggregate: false, note: "", ...o };
}
function mockArtifactImages() {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
  const rows = [
    mockImage({
      repo: "deployment-api",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 270,
      tags: ["a557471", "0.10.0"],
      last_pushed: daysAgo(0.1),
      running_on: "uts-shared-deployment-api",
      state: "running",
      size_bytes: 1_699_956_926,
    }),
    mockImage({
      repo: "deployment-service",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 165,
      tags: ["f000ee3"],
      last_pushed: daysAgo(3),
      running_on: "deployment-service",
      state: "running",
      size_bytes: 1_028_196_313,
    }),
    mockImage({
      repo: "market-tick-data-service",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 1901,
      tags: ["9e11c02"],
      last_pushed: daysAgo(1),
      running_on: "",
      state: "active",
      size_bytes: 996_130_088,
    }),
    mockImage({
      repo: "retired-legacy-service",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 3,
      tags: ["deadbee"],
      last_pushed: daysAgo(120),
      running_on: "",
      state: "legacy",
      size_bytes: 512_000_000,
    }),
    mockImage({
      repo: "execution-service",
      cloud: "aws",
      registry: "ECR",
      image_count: 0,
      tags: [],
      last_pushed: "",
      running_on: "",
      state: "parked",
      size_bytes: null,
      note: "AWS ECR not read yet (parked, no credits)",
    }),
    // Phase 3d — the GCS tarball-manifest bucket's Artifacts-view row (distinct `registry` key so it
    // never collides with the AR rows above, sharing the "deployment-service" repo name).
    mockImage({
      repo: "deployment-service",
      cloud: "gcp",
      registry: "gcs-tarball-bucket",
      image_count: 2,
      tags: ["f000ee3"],
      last_pushed: daysAgo(0.2),
      running_on: "",
      state: "active",
      size_bytes: 42_000_000,
    }),
  ];
  return {
    generated_at: now.toISOString(),
    rows,
    stats: {
      total_repos: rows.length,
      running: rows.filter((r) => r.state === "running").length,
      parked: rows.filter((r) => r.state === "parked").length,
      legacy: rows.filter((r) => r.state === "legacy").length,
      empty: rows.filter((r) => r.state === "empty").length,
    },
  };
}

type MockRunningVersion = {
  version: string;
  artifact: string;
  digest: string;
  built_from: string;
  drift: string[];
  hosts: { name: string; kind: string; launched_at: string }[];
  why: string;
};
type MockRunningGroup = {
  service: string;
  lane: "image" | "tarball";
  cloud: "gcp" | "aws";
  version: MockRunningVersion;
};
function mockArtifactRunning() {
  const now = new Date();
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000).toISOString();
  const groups: MockRunningGroup[] = [
    {
      service: "uts-shared-deployment-api",
      lane: "image",
      cloud: "gcp",
      version: {
        version: ":a557471",
        artifact: "unified-trading-system/deployment-api",
        digest: "sha256:c05dd3d678ef",
        built_from: "a557471",
        drift: ["ok"],
        hosts: [{ name: "uts-shared-deployment-api", kind: "Cloud Run svc", launched_at: hoursAgo(1) }],
        why: "resolves to deployment-api@a557471 (main), built by deployment-api-build.",
      },
    },
    {
      service: "deployment-dashboard",
      lane: "image",
      cloud: "gcp",
      version: {
        version: ":latest",
        artifact: "unified-trading-system/deployment-dashboard",
        digest: "sha256:37a9ab503fb9",
        built_from: "",
        drift: ["floating"],
        hosts: [{ name: "deployment-dashboard", kind: "Cloud Run svc", launched_at: hoursAgo(2) }],
        why: "the resolved image is tagged only :latest — no SHA-traceable tag, so a future push could silently change what this digest means without a new deploy.",
      },
    },
    {
      service: "deployment-service",
      lane: "image",
      cloud: "gcp",
      version: {
        version: "sha256:83803e21331",
        artifact: "",
        digest: "sha256:83803e21331f",
        built_from: "",
        drift: ["unknown"],
        hosts: [{ name: "deployment-service", kind: "Cloud Run svc", launched_at: hoursAgo(20) }],
        why: "digest sha256:83803e21331f… isn't in the current Artifact Registry inventory (deleted, or never pushed via CI).",
      },
    },
    {
      service: "greeks-service",
      lane: "image",
      cloud: "gcp",
      version: {
        version: ":6aad829",
        artifact: "unified-trading-system/greeks-service",
        digest: "sha256:0764487cfac3",
        built_from: "6aad829",
        drift: ["ok", "hand"],
        hosts: [{ name: "greeks-service", kind: "Cloud Run svc", launched_at: hoursAgo(6) }],
        why: "resolves to greeks-service@6aad829 (main), built by greeks-service-build. deployed by someone@example.com, not the CI pipeline.",
      },
    },
  ];
  const groupRows = groups.map((g) => ({
    service: g.service,
    lane: g.lane,
    cloud: g.cloud,
    fragmented: false,
    frag_note: "",
    versions: [g.version],
  }));
  const allVersions = groups.map((g) => g.version);
  return {
    generated_at: now.toISOString(),
    groups: groupRows,
    stats: {
      services: groups.length,
      versions: groups.length,
      fragmented: 0,
      floating: allVersions.filter((v) => v.drift.includes("floating")).length,
      hand: allVersions.filter((v) => v.drift.includes("hand")).length,
      unknown: allVersions.filter((v) => v.drift.includes("unknown")).length,
    },
  };
}

type MockHealthCondition = {
  condition: string;
  severity: "high" | "med" | "low" | "deferred";
  count: string;
  area: string;
  tab: string;
  meaning: string;
  evidence: string;
};
function mockArtifactHealth() {
  const conditions: MockHealthCondition[] = [
    {
      condition: "AWS builds/deploys/registry are not read yet",
      severity: "deferred",
      count: "all AWS",
      area: "cross-cutting · AWS",
      tab: "pipe",
      meaning: "The AWS estate is deliberately stopped while credits are unavailable — parked, not broken.",
      evidence: "AWS CodeBuild/App Runner/ECS/ECR providers are not yet wired into this page.",
    },
    {
      condition: "A workload is serving its newest revision even though that revision never went ready",
      severity: "high",
      count: "1",
      area: "deploy · GCP",
      tab: "deploy",
      meaning: "Cloud Run has nothing newer to fall back to, so a broken deploy is still what's live.",
      evidence: "deployment-service",
    },
    {
      condition: "Builds failed in the last 7 days",
      severity: "med",
      count: "1",
      area: "pipeline · CI",
      tab: "pipe",
      meaning: "Each failure blocked that commit from reaching a registry image.",
      evidence: "market-tick-data-service",
    },
    {
      condition: "A commit was built more than once in the last 7 days",
      severity: "low",
      count: "1",
      area: "pipeline · CI",
      tab: "pipe",
      meaning: "Wasted compute — the second build produces an identical artifact to the first.",
      evidence: "see the Pipeline tab's 'dup' badge",
    },
    {
      condition: "A live workload resolves to an image tagged only :latest",
      severity: "med",
      count: "1",
      area: "running · GCP",
      tab: "running",
      meaning:
        "No SHA-traceable tag — a future push could silently change what this digest means without a new deploy.",
      evidence: "deployment-dashboard",
    },
    {
      condition: "A live workload was deployed by something other than the CI pipeline",
      severity: "med",
      count: "1",
      area: "running · GCP",
      tab: "running",
      meaning: "Bypasses the build record this page's provenance chain relies on.",
      evidence: "greeks-service",
    },
    {
      condition: "VM tarball-lane workloads carry no measured git commit yet",
      severity: "med",
      count: "fleet",
      area: "running · GCP tarball lane",
      tab: "running",
      meaning:
        "The GCE VM registry entry's git_commit/image_digest fields are stamped \"\" at launch today, so What's running can only cover the Cloud Run (image) lane until the launch-time stamp change lands.",
      evidence: "plans/active/artifact_pipeline_observability_2026_07_17.md § Honest gaps",
    },
    {
      condition: "A registry repo has accumulated hundreds of images with no lifecycle/GC policy",
      severity: "low",
      count: "1901",
      area: "artifacts · GCP AR",
      tab: "art",
      meaning: "market-tick-data-service alone carries 1901 images — storage cost keeps climbing with no expiry.",
      evidence: "repo=market-tick-data-service",
    },
  ];
  const high = conditions.filter((c) => c.severity === "high").length;
  const med = conditions.filter((c) => c.severity === "med").length;
  const low = conditions.filter((c) => c.severity === "low").length;
  const deferred = conditions.filter((c) => c.severity === "deferred").length;
  return {
    generated_at: new Date().toISOString(),
    conditions,
    stats: { high, med, low, deferred, real_defects: high + med + low },
  };
}

function mockCostBreakdown(dimension: string, cloud: string, win: MockCostWindow) {
  const days = win.days;
  const scale = days / 30;
  // 6th element = purchase_option (spot | on-demand | other); only meaningful for compute rows
  // on the resource/service dimensions, mirrors the backend's rank-based fold onto those groups.
  type Row = [string, string | null, number, string, string, string?];
  const fixtures: Record<string, Row[]> = {
    service: [
      // Backfill fleet defaults to SPOT (codex/05-infrastructure/spot-vms-for-backfill.md) — the
      // Compute Engine rollup shows spot since most of its underlying instance-core lines are.
      ["Compute Engine", "gcp", 5560, "GCP", "other", "spot"],
      ["Cloud Storage", "gcp", 4707, "GCP", "other", "other"],
      ["Cloud Run", "gcp", 3946, "GCP", "other", "other"],
      ["Amazon EC2", "aws", 93, "AWS", "other", "on-demand"],
      ["GitHub Actions", "github", 212, "GitHub", "other", "other"],
      ["Copilot (3 seats)", "github", 57, "GitHub", "other", "other"],
    ],
    resource: [
      ["mtds-perp-funding-backfill", "gcp", 255, "Compute Engine", "vm", "spot"],
      ["mtds-dex-swaps-backfill", "gcp", 242, "Compute Engine", "vm", "spot"],
      ["i-0c9b283b31d6b5ca7", "aws", 46, "Amazon EC2", "vm", "on-demand"],
      ["central-element-323112-events", "gcp", 2494, "Cloud Storage", "bucket", "other"],
      ["market-data-tick-cefi-central-element-323112", "gcp", 771, "Cloud Storage", "bucket", "other"],
      ["unified-trading-instruments-defi-427895769566", "aws", 2, "Amazon S3", "bucket", "other"],
      // Cost-waste evidence resources (mirror the live audit findings) — an idle reserved IP and
      // an orphaned disk with no matching running VM. Neither carries the compute purchase-option
      // axis (IP/disk SKUs, not instance core/ram) — "other".
      ["harsh-static-ip", "gcp", 5.95, "Compute Engine", "other", "other"],
      ["ikenna-windows-tokyo-restored", "gcp", 68.62, "Compute Engine", "disk", "other"],
      // Backup-artifact + billing-history-reconstructed waste kinds (mirror the live audit's 2nd
      // pass, 2026-07-23) — a forgotten custom image/machine-image/snapshot, and a VM's disk still
      // billing after its own compute usage stopped (the label carries "(idle since <date>)" exactly
      // like the real backend's synthetic row, so the UI's longer-label rendering gets exercised).
      ["kenny-mega-cpu-deletable-windows-image-000042", "gcp", 2.22, "Compute Engine", "other", "other"],
      ["windows-dev-image-20251221", "gcp", 3.03, "Compute Engine", "other", "other"],
      ["market-tick-backfill-base", "gcp", 1.11, "Compute Engine", "other", "other"],
      [
        "cefi-binance-futures-2020-heavy-20260712-084547 (idle since 2026-07-13)",
        "gcp",
        0.57,
        "Compute Engine",
        "other",
        "other",
      ],
    ],
    bucket: [
      ["central-element-323112-events", "gcp", 2494, "GCS", "bucket"],
      ["market-data-tick-cefi-central-element-323112", "gcp", 771, "GCS", "bucket"],
      ["unified-trading-instruments-defi-427895769566", "aws", 2, "S3", "bucket"],
    ],
    region: [
      ["asia-northeast1", "gcp", 14200, "GCP", "other"],
      ["ap-northeast-1", "aws", 190, "AWS", "other"],
      ["global", "github", 292, "GitHub", "other"],
    ],
    day: mockCostDates(days).map((d, i) => [d, null, +(510 + 80 * Math.sin(i / 3)).toFixed(2), "", "other"] as Row),
    // The audit's #1 finding — the top cost driver hidden inside a service rollup
    // (mirrors the real "Regional Coldline Class A Operations" line item).
    sku: [
      ["Regional Coldline Class A Operations", "gcp", 2870, "Cloud Storage", "other"],
      ["N2 Instance Core running in Americas", "gcp", 1840, "Compute Engine", "vm"],
      ["Cloud Run CPU Allocation Time", "gcp", 1230, "Cloud Run", "other"],
      ["EC2 Compute - Compute Instance", "aws", 62, "Amazon EC2", "vm"],
      ["GitHub Actions Linux minutes", "github", 180, "GitHub Actions", "other"],
    ],
    // "By label" (GCP business labels). A large set so pagination + filter are exercisable; the named
    // values ("(unlabeled)", "manifest-consolidator", "market-data-raw") mirror the live purpose split
    // and let the filter regression match a known row.
    label: [
      ["(unlabeled)", "gcp", 8956, "GCP label", "other"],
      ["manifest-consolidator", "gcp", 3685, "GCP label", "other"],
      ["market-data-raw", "gcp", 945, "GCP label", "other"],
      ...Array.from({ length: 125 }, (_, i): Row => [
        `purpose-${i + 1}`,
        "gcp",
        +(400 - i * 2.5).toFixed(2),
        "GCP label",
        "other",
      ]),
    ],
  };
  // Bucket-only: avg GB stored over the window + storage-class split (never scaled by `days` —
  // it's a window-average, not a sum). cost_per_gb is derived after cost is scaled below.
  const BUCKET_STORAGE: Record<string, Record<string, number>> = {
    "central-element-323112-events": { Standard: 12000, Nearline: 4000, Coldline: 2000, Archive: 500 },
    "market-data-tick-cefi-central-element-323112": { Standard: 6200 },
    "unified-trading-instruments-defi-427895769566": { Standard: 40 },
  };
  // Bucket-only: net-cost split weights {storage, egress} (operations = remainder) — mirrors the
  // backend's _cost_component. The events bucket is operations-dominated (~all Class-A writes on
  // little storage); cefi is storage-dominated. Parts sum EXACTLY to the row's net cost.
  const BUCKET_COMPONENT_WEIGHTS: Record<string, { storage: number; egress: number }> = {
    "central-element-323112-events": { storage: 0.0002, egress: 0.002 },
    "market-data-tick-cefi-central-element-323112": { storage: 0.75, egress: 0.009 },
    "unified-trading-instruments-defi-427895769566": { storage: 0.5, egress: 0.1 },
  };
  // Resource-only: VM machine specs (from GCP system_labels, no Compute API) — AWS carries no
  // machine-spec equivalent, so i-0c9b283b31d6b5ca7 is deliberately absent here.
  const VM_MACHINE_SPECS: Record<string, { machine_type: string; vcpu: number; memory_gb: number }> = {
    "mtds-perp-funding-backfill": { machine_type: "e2-highmem-8", vcpu: 8, memory_gb: 64 },
    "mtds-dex-swaps-backfill": { machine_type: "e2-standard-4", vcpu: 4, memory_gb: 16 },
  };
  // Resource-only: cost-waste flags — a row IS the idle/orphaned resource (its own cost is the
  // waste amount), never a cross-referenced sub-amount on another row.
  const RESOURCE_WASTE: Record<
    string,
    | "idle_static_ip"
    | "orphaned_disk"
    | "orphaned_image"
    | "orphaned_machine_image"
    | "orphaned_snapshot"
    | "stopped_vm_disk"
  > = {
    "harsh-static-ip": "idle_static_ip",
    "ikenna-windows-tokyo-restored": "orphaned_disk",
    "kenny-mega-cpu-deletable-windows-image-000042": "orphaned_image",
    "windows-dev-image-20251221": "orphaned_machine_image",
    "market-tick-backfill-base": "orphaned_snapshot",
    "cefi-binance-futures-2020-heavy-20260712-084547 (idle since 2026-07-13)": "stopped_vm_disk",
  };
  // "Waste" dimension — the SAME per-resource rows as "resource", filtered to just the
  // waste-flagged ones (mirrors the real backend: dimension=waste reuses _by_resource's
  // classification, it doesn't re-derive its own fixture set).
  fixtures.waste = fixtures.resource.filter(([label]) => label in RESOURCE_WASTE);
  let rows = (fixtures[dimension] ?? fixtures.service).map(([label, c, cost, detail, kind, purchase]) => {
    const net = +(cost * scale).toFixed(2);
    // GCP rows carry ~20% promotional credit (mirrors mockCostSummary + the real billing
    // export); AWS/GitHub/cross-cloud (day, cloud=null) rows have none.
    const credit = c === "gcp" ? -+(net * 0.2).toFixed(2) : 0;
    const gross = +(net - credit).toFixed(2); // net = gross + credit (credit <= 0)
    const rate = c === "gcp" ? 0.75 : 1; // GCP bills in GBP; native at a fixed mock rate
    // Keyed by resource_kind, not the query dimension — the real backend's `_by_resource` attaches
    // storage detail to bucket rows whether the caller asked for dimension=bucket or dimension=resource
    // (the leaf "Top storage buckets" table sources from the latter).
    const storageClassGb = kind === "bucket" ? (BUCKET_STORAGE[label] ?? null) : null;
    const storageGb = storageClassGb ? Object.values(storageClassGb).reduce((a, gb) => a + gb, 0) : null;
    // Bucket net-cost composition (storage/operations/egress), summing exactly to `net`.
    let costByComponent: Record<string, number> | null = null;
    if (kind === "bucket") {
      const w = BUCKET_COMPONENT_WEIGHTS[label] ?? { storage: 0.5, egress: 0.05 };
      const storage = +(net * w.storage).toFixed(2);
      const egress = +(net * w.egress).toFixed(2);
      costByComponent = { storage, operations: +(net - storage - egress).toFixed(2), egress };
    }
    const spec = dimension === "resource" || dimension === "waste" ? VM_MACHINE_SPECS[label] : undefined;
    const wasteKind = dimension === "resource" || dimension === "waste" ? (RESOURCE_WASTE[label] ?? "") : "";
    return {
      label,
      cloud: c,
      cost: net,
      gross,
      credit,
      detail,
      resource_kind: kind,
      share_pct: 0,
      is_provisional: dimension === "day" && label >= mockCostDates(days)[days - 2],
      storage_gb: storageGb,
      storage_class_gb: storageClassGb,
      // $/GB is the STORAGE-component rate over stored GB (matches the backend), not total/GB — an
      // ops-heavy bucket's total/GB would read a nonsense rate.
      cost_per_gb: storageGb ? +((costByComponent?.storage ?? net) / storageGb).toFixed(4) : null,
      cost_by_component: costByComponent,
      machine_type: spec?.machine_type ?? "",
      vcpu: spec?.vcpu ?? null,
      memory_gb: spec?.memory_gb ?? null,
      is_idle: wasteKind !== "",
      waste_kind: wasteKind,
      purchase_option: purchase ?? "other",
      currency: c === "gcp" ? "GBP" : "USD",
      cost_native: +(net * rate).toFixed(2),
      gross_native: +(gross * rate).toFixed(2),
      credit_native: +(credit * rate).toFixed(2),
    };
  });
  if (cloud !== "all") rows = rows.filter((r) => r.cloud === cloud || r.cloud === null);
  const total = +rows.reduce((a, r) => a + r.cost, 0).toFixed(2);
  rows.forEach((r) => (r.share_pct = total ? +((r.cost / total) * 100).toFixed(1) : 0));
  rows.sort((a, b) => b.cost - a.cost);
  // total_groups = distinct groups before the backend's top-N cap; the mock fixtures are small
  // (< cap) so nothing is folded, but the field is present so the UI's coverage hint renders.
  return { dimension, cloud, days, start_date: win.start, end_date: win.end, total, total_groups: rows.length, rows };
}

// ── Consolidator mock: animate the backlog so the sparklines actually move in dev ──
// Driven by a per-request tick (NOT Date.now) so it stays deterministic per poll count.
let _consolidatorPollTick = 0;
/** Producing: pending sawtooths up then drops to 0 (accumulate → merge → repeat). */
function _sawtooth(tick: number, peak: number): number {
  return tick % (peak + 1);
}
/** Stale/behind: pending climbs monotonically and sticks near the cap (never drains). */
function _climb(tick: number, start: number, cap: number): number {
  return Math.min(start + tick, cap);
}

/** `grace_hours=` query-param reader for the /api/fleet/orphans mock — falls back on missing/NaN. */
function _mockGraceHoursFromUrl(url: string, fallback: number): number {
  const m = url.match(/[?&]grace_hours=([^&]+)/);
  if (!m) return fallback;
  const parsed = Number(decodeURIComponent(m[1]));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Mirrors deployment-api's _fleet_inventory._cost_incurred_usd — monthly_disk_usd prorated by
// elapsed stopped-time (same 30.44 avg-days-per-month constant), so the mock's "cost so far"
// figures move in lockstep with the real backend's math instead of drifting via hardcoded values.
const _MOCK_AVG_HOURS_PER_MONTH = 24 * 30.44;
function _mockCostIncurredUsd(monthlyUsd: number, stoppedAgeHours: number): number {
  return Math.round((monthlyUsd * stoppedAgeHours * 100) / _MOCK_AVG_HOURS_PER_MONTH) / 100;
}

async function handleRoute(url: string, init?: RequestInit): Promise<Response> {
  await delay(getStandardMockDelayMs());
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

  // Cost observability (mirrors deployment-api routes/costs.py) — /ops/costs page
  if (path.startsWith("/api/costs/")) {
    const params = new URL(url, "http://mock").searchParams;
    const win = mockCostWindow(params);
    const cloud = params.get("cloud") ?? "all";
    const dimension = params.get("dimension") ?? "service";
    if (path === "/api/costs/summary") {
      // Test-only hook (mirrors __mockBreakdownDelayMs): make ONE window's summary resolve slower
      // than a later one so a spec can deterministically reproduce the out-of-order-response race
      // that `loadCore`'s reqId guard exists to stop. Keyed by the full `start:end` window — a
      // `days`-only key can't tell two same-length windows apart, which is the whole hazard.
      const winDelay = (window as typeof window & { __mockSummaryDelayMs?: Record<string, number> })
        .__mockSummaryDelayMs?.[`${win.start}:${win.end}`];
      if (winDelay) await delay(winDelay);
      return json(mockCostSummary(win));
    }
    if (path === "/api/costs/breakdown") {
      // Test-only hook (mirrors __mockErrors/__mockRequests): a spec can make one dimension's
      // response resolve slower than another to deterministically reproduce the out-of-order-
      // response race the stale-during-refetch fix guards against (see
      // tests/smoke/cost-observability.spec.ts).
      const extraDelay = (window as typeof window & { __mockBreakdownDelayMs?: Record<string, number> })
        .__mockBreakdownDelayMs?.[dimension];
      if (extraDelay) await delay(extraDelay);
      return json(mockCostBreakdown(dimension, cloud, win));
    }
    if (path === "/api/costs/timeseries") return json(mockCostTimeseries(win, cloud));
  }

  // Artifact pipeline (mirrors deployment-api routes/artifacts.py) — /ops/artifacts page. All five
  // views are live: builds, deploys, images (registry), running (the digest→build join), health.
  if (path.startsWith("/api/artifacts/")) {
    const params = new URL(url, "http://mock").searchParams;
    if (path === "/api/artifacts/builds") return json(mockArtifactBuilds(params));
    if (path === "/api/artifacts/deploys") return json(mockArtifactDeploys(params));
    if (path === "/api/artifacts/images") return json(mockArtifactImages());
    if (path === "/api/artifacts/running") return json(mockArtifactRunning());
    if (path === "/api/artifacts/health") return json(mockArtifactHealth());
  }

  // Repo-CI dashboard (mirrors deployment-api routes/repo_ci.py mock fixtures —
  // every stuck class + stuck-in-SIT + the live SIT-run panel, pinned by the
  // playwright regression spec tests/e2e/repos-stuck-panel.spec.ts)
  if (path === "/api/repo-ci/alerts") {
    return json(mockRepoCiAlerts());
  }
  // Unified alert ledger — all classes (INFRA P1 will extend with non-CI kinds).
  if (path === "/api/alerts") {
    return json(mockRepoCiAlerts());
  }
  if (path === "/api/repo-ci/overview") {
    return json(mockRepoCiOverview());
  }
  if (path === "/api/repo-ci/escalations") {
    return json(mockEscalations());
  }
  // Firestore verdict-store panels (monitoring_control_plane_master_2026_06_10.md) — read-only
  // proxies of unified-trading-pm's version-coherence-check.yml / change-freeze-check.yml verdicts.
  if (path === "/api/version-coherence/overview") {
    return json(mockVersionCoherenceOverview());
  }
  if (path === "/api/change-freeze/status") {
    return json(mockChangeFreezeStatus());
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

  // Health rollup — the cockpit landing's "is everything OK?" tiles (Phase 1).
  if (path === "/api/health/overview") {
    return json({
      generated_at: "2026-06-24T07:00:00+00:00",
      overall: "degraded",
      tiles: [
        {
          id: "fleet",
          label: "Fleet VMs",
          status: "ok",
          value: "180 running, 0 zombie, 0 OOM, 12 stopped",
          detail_href: "/api/fleet/vm-census",
        },
        {
          id: "consolidator",
          label: "Manifest Consolidator",
          status: "degraded",
          value: "DOWN for: cefi",
          detail_href: "/api/health/consolidator",
        },
        {
          id: "coverage",
          label: "Data Coverage",
          status: "ok",
          value: "5 asset_groups tracked",
          detail_href: "/api/data-status/coverage-summary",
        },
        {
          id: "alerts",
          label: "Open Alerts",
          status: "ok",
          value: "0 open (0 crit, 0 warn)",
          detail_href: "/api/alerts",
        },
        {
          id: "gh_budget",
          label: "GitHub Budget",
          status: "ok",
          value: "4200/5000 REST core remaining",
          detail_href: "/api/repos/gh-rate-limit",
        },
        {
          id: "cost",
          label: "Daily Cost",
          status: "ok",
          value: "$12.40 today (3 VMs)",
          detail_href: "/api/costs/summary",
        },
      ],
    });
  }

  // Manifest-consolidator drill-down — per-asset_group index freshness (Phase 1).
  if (path === "/api/health/consolidator") {
    const mkAg = (
      ag: string,
      status: string,
      age: number,
      fallback: boolean,
      detail: string,
      pending = 0,
      total = 0,
    ) => ({
      asset_group: ag,
      bucket: `market-data-tick-${ag}-prd-mock`,
      status,
      index_age_seconds: age,
      staleness_budget_seconds: 120,
      per_vm_shard_fallback_active: fallback,
      last_successful_run_at: "2026-06-24T06:55:00+00:00",
      pending_shard_count: pending,
      total_shard_count: total,
      detail,
    });
    const mkC = (
      category: string,
      kind: string,
      asset_group: string | null,
      status: string,
      verdict: string,
      age: number | null,
      pending: number,
      total: number,
      detail: string,
      rows?: number | null,
      sizeBytes?: number | null,
    ) => {
      // Empty/unknown buckets have no readable index → null absolutes; otherwise derive a
      // plausible size/row-count from the fan-in width, overridable per row (e.g. defi's 442 MB).
      const noIndex = verdict === "empty" || verdict === "unknown";
      // Execution truth: fired_but_empty = a recent SUCCEEDED run against a stale index; stale_output
      // = the run itself failed/old; everything else = a healthy recent success.
      const execStatus = verdict === "stale_output" ? "failed" : noIndex ? "pending" : "succeeded";
      const execExit = execStatus === "succeeded" ? 0 : execStatus === "failed" ? 1 : null;
      // Dark data-correctness actors (phantom reconcile + empty re-probe) only run on the
      // market-data / instruments manifests → those buckets carry audit summaries; others don't.
      const audits = kind === "market-data" || kind === "instruments";
      return {
        category,
        kind,
        asset_group,
        job_name: `uts-prod-manifest-consolidator-${category}`,
        bucket: `${category}-prd-mock`,
        status,
        verdict,
        index_age_seconds: age,
        // Cadence-matched budget (mirrors the backend catalog): live market-data ticks
        // (defi/tradfi/sports/prediction) = 120s; every other consolidator = 86400s.
        staleness_budget_seconds:
          kind === "market-data" && asset_group !== null && asset_group !== "cefi" ? 120 : 86400,
        // Matches the live-verified estate — every consolidator's Cloud Scheduler cron is this
        // same literal (see gen_consolidator_catalog.py); mock mode should look like production.
        trigger_cron: "*/1 * * * *",
        last_successful_run_at: age === null ? null : "2026-06-24T06:55:00+00:00",
        pending_shard_count: pending,
        total_shard_count: total,
        // Oldest un-absorbed shard ≈ the index age when a backlog is waiting (merge-stuck-for).
        oldest_pending_shard_age_seconds: pending > 0 && age !== null ? age : null,
        index_row_count: noIndex ? null : (rows ?? (total + 1) * 5200 + 4000),
        index_size_bytes: noIndex ? null : (sizeBytes ?? (total + 1) * 240_000 + 160_000),
        execution_status: execStatus,
        execution_last_run_at: execStatus === "pending" ? null : "2026-06-24T06:59:30+00:00",
        execution_exit_code: execExit,
        // Self-reported run summary — every mkC consolidator is LIVE (reporting a latest.json). The
        // run verdict maps the endpoint verdict back to produced/empty/failed.
        run_reporting: true,
        run_verdict:
          verdict === "fired_but_empty" || verdict === "empty"
            ? "empty"
            : verdict === "stale_output"
              ? "failed"
              : "produced",
        run_last_run_at: "2026-06-24T06:59:35+00:00",
        run_shards_changed: pending,
        run_rows_added: pending * 1000,
        run_duration_ms: 8400,
        // Last phantom audit + empty re-probe (cefi carries phantoms → amber; defi a reprobe
        // disagreement + reclassify). Non-audit kinds report null (the card shows no audit row).
        phantom_audit_at: audits ? "2026-07-12T02:00:00+00:00" : null,
        phantom_count: audits ? (asset_group === "cefi" ? 2 : 0) : null,
        phantom_triage_link: audits && asset_group === "cefi" ? "mock://phantom-triage/triage_cefi_mock.jsonl" : null,
        reprobe_audit_at: audits ? "2026-07-13T05:00:00+00:00" : null,
        reprobe_new_empties: audits ? pending + 3 : null,
        reprobe_disagreements: audits ? (asset_group === "defi" ? 1 : 0) : null,
        reprobe_reclassified: audits ? (asset_group === "defi" ? 1 : 0) : null,
        detail,
      };
    };
    // Per-poll animation state (deterministic per poll count, no Date.now):
    // producing cards sawtooth, stale cards climb-and-stick, so sparklines move.
    const tick = ++_consolidatorPollTick;
    const defiAge = 2600 + tick * 30;
    const defiPending = _climb(tick, 6, 14);
    const onchainPending = _climb(tick, 3, 8);
    return json({
      generated_at: "2026-06-24T07:00:00+00:00",
      overall: "critical",
      asset_groups: [
        mkAg(
          "cefi",
          "critical",
          2457,
          true,
          "index 2457s (> 120s budget) while per-VM shards exist — consolidator behind/DOWN",
          47,
          48,
        ),
        mkAg("defi", "ok", 25, false, "index heartbeat 25s old (<= 120s budget)", 2, 6),
        mkAg("tradfi", "ok", 20, false, "index heartbeat 20s old (<= 120s budget)", 1, 5),
        mkAg("sports", "ok", 25, false, "index heartbeat 25s old (<= 120s budget)", 0, 4),
        mkAg("prediction", "ok", 11, false, "index heartbeat 11s old (<= 120s budget)", 1, 3),
      ],
      consolidators: [
        mkC(
          "market-data-defi",
          "market-data",
          "defi",
          "critical",
          "stale_output",
          defiAge,
          defiPending,
          defiPending,
          `index ${defiAge}s (> 120s budget) while ${defiPending} per-VM shards wait — 442 MB index OOMs the merge, consolidator behind/DOWN`,
          12_400_000,
          463_470_592,
        ),
        mkC(
          "market-data-cefi",
          "market-data",
          "cefi",
          "ok",
          "producing",
          242,
          _sawtooth(tick, 6),
          9,
          "index heartbeat 242s old (<= 86400s budget) — absorbing a live shard backlog",
          3_100_000,
          92_000_000,
        ),
        mkC(
          "market-data-tradfi",
          "market-data",
          "tradfi",
          "ok",
          "producing",
          52,
          _sawtooth(tick, 3),
          4,
          "index heartbeat 52s old (<= 120s budget) — absorbing a live shard backlog",
          840_000,
          23_000_000,
        ),
        mkC(
          "market-data-sports",
          "market-data",
          "sports",
          "ok",
          "produced",
          6,
          0,
          0,
          "index heartbeat 6s old (<= 120s budget)",
          128_000,
          4_200_000,
        ),
        mkC(
          "market-data-prediction",
          "market-data",
          "prediction",
          "ok",
          "produced",
          13,
          0,
          0,
          "index heartbeat 13s old (<= 120s budget)",
          96_000,
          3_100_000,
        ),
        mkC(
          "instruments-cefi",
          "instruments",
          "cefi",
          "ok",
          "producing",
          40,
          _sawtooth(tick, 4),
          12,
          "index heartbeat 40s old (<= 86400s budget) — absorbing a reference-data refresh",
        ),
        mkC(
          "instruments-defi",
          "instruments",
          "defi",
          "ok",
          "produced",
          7,
          0,
          0,
          "index heartbeat 7s old (<= 120s budget)",
        ),
        mkC(
          "instruments-sports",
          "instruments",
          "sports",
          "ok",
          "produced",
          14,
          0,
          0,
          "index heartbeat 14s old (<= 120s budget)",
        ),
        mkC(
          "features-delta-one-cefi",
          "features-delta-one",
          "cefi",
          "ok",
          "produced",
          14,
          0,
          0,
          "index heartbeat 14s old (<= 86400s budget)",
        ),
        mkC(
          "features-onchain-defi",
          "features-onchain",
          "defi",
          "critical",
          "fired_but_empty",
          90000 + tick * 60, // genuinely stale vs the 86400s features budget (climb-and-stick)
          onchainPending,
          onchainPending + 4,
          "execution SUCCEEDED 30s ago yet the index is > 86400s old — the job ran green but wrote nothing",
          6_200_000,
          214_000_000,
        ),
        mkC(
          "features-volatility-cefi",
          "features-volatility",
          "cefi",
          "degraded",
          "unknown",
          null,
          0,
          0,
          "could not read _index/availability_index.parquet — transient read error, not necessarily unhealthy",
        ),
        mkC(
          "features-sports",
          "features",
          "sports",
          "ok",
          "produced",
          14,
          0,
          0,
          "index heartbeat 14s old (<= 120s budget)",
        ),
        mkC("gas-fees", "gas-fees", null, "ok", "produced", 17, 0, 3, "index heartbeat 17s old (<= 120s budget)"),
        mkC(
          "execution-cefi",
          "execution",
          "cefi",
          "degraded",
          "empty",
          null,
          0,
          0,
          "index missing; no per-VM shards — genuinely empty bucket, not an outage",
        ),
        mkC(
          "execution-defi",
          "execution",
          "defi",
          "degraded",
          "empty",
          null,
          0,
          0,
          "index missing; no per-VM shards — genuinely empty bucket, not an outage",
        ),
        mkC(
          "strategy",
          "strategy",
          null,
          "degraded",
          "empty",
          null,
          0,
          0,
          "index missing; no per-VM shards — genuinely empty bucket, not an outage",
        ),
        mkC(
          "ml-training-artifacts",
          "ml-training-artifacts",
          null,
          "degraded",
          "empty",
          null,
          0,
          0,
          "index missing; no per-VM shards — genuinely empty bucket, not an outage",
        ),
        // A DEAD consolidator — declared in the catalog but never fired up, so it publishes no
        // latest.json → run_reporting:false. The card shows "not reporting", never a fake all-clear.
        {
          category: "instruments-prediction",
          kind: "instruments",
          asset_group: "prediction",
          job_name: "uts-prod-manifest-consolidator-instruments-prediction",
          bucket: "instruments-store-prediction-prd-mock",
          status: "degraded",
          verdict: "empty",
          index_age_seconds: null,
          staleness_budget_seconds: 86400,
          trigger_cron: "*/1 * * * *",
          last_successful_run_at: null,
          pending_shard_count: 0,
          total_shard_count: 0,
          oldest_pending_shard_age_seconds: null,
          index_row_count: null,
          index_size_bytes: null,
          execution_status: "pending",
          execution_last_run_at: null,
          execution_exit_code: null,
          run_reporting: false,
          run_verdict: null,
          run_last_run_at: null,
          run_shards_changed: null,
          run_rows_added: null,
          run_duration_ms: null,
          detail: "no index and no shards — consolidator not yet fired up (not reporting)",
        },
      ],
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
    // instruments-service entries mirror the UAC SSOT verbatim
    // (unified_api_contracts/registry/data_status_axis_matrix.py —
    // SHARD_AXIS_MATRIX / BREAKDOWN_AXES / PRIMARY_AXIS). Copying the REAL axes
    // matters: `isHierarchicalDrilldownRedundant` (P5) decides purely on whether
    // an IS asset_group's shard axes are a subset of {venue, chain}, and
    // `BreakdownsAccordion` (P4-A) only mounts when breakdown_axes is non-empty
    // — a hand-waved shape here would make mock mode agree with a bug.
    return json({
      shard_axes: {
        "market-tick-data-service": {
          prediction: ["venue", "canonical_question_group", "data_type"],
        },
        "instruments-service": {
          cefi: ["venue"],
          tradfi: ["venue"],
          defi: ["venue", "chain"],
          sports: ["data_type", "league_id"],
          prediction: ["venue", "canonical_question_group"],
        },
      },
      display_axes: {
        "market-tick-data-service": { prediction: [] },
        "instruments-service": { cefi: [], tradfi: [], defi: [], sports: [], prediction: [] },
      },
      primary_axis: {
        "market-tick-data-service": { prediction: "venue" },
        "instruments-service": {
          cefi: "venue",
          tradfi: "venue",
          defi: "venue",
          sports: "data_type",
          prediction: "venue",
        },
      },
      breakdown_axes: {
        "market-tick-data-service": {
          prediction: ["canonical_question_group", "data_type"],
        },
        "instruments-service": {
          cefi: ["instrument_type", "data_type"],
          tradfi: ["instrument_type", "data_type"],
          defi: ["instrument_type", "data_type"],
          sports: ["source"],
          prediction: ["data_type"],
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
  // Deployment observability — unified inventory + per-umbrella summary (Phase 2 of
  // deployment_observability_parity_live_batch_paper_2026_06_22.md). These MUST precede
  // the single-segment `/api/deployments/[^/]+$` handler below (which would otherwise
  // swallow `/api/deployments/inventory`). Mirrors deployment-api@5df5f01 shapes.
  if (path === "/api/deployments/inventory") {
    const reqUrl = new URL(url, "http://x");
    const umbrella = (reqUrl.searchParams.get("umbrella") ?? "").toUpperCase();
    const cloud = (reqUrl.searchParams.get("cloud") ?? "").toUpperCase();
    const status = reqUrl.searchParams.get("status") ?? "";
    const assetGroup = reqUrl.searchParams.get("asset_group") ?? "";
    // WS-2 date-range overlap (`?date_from=&date_to=`) — the mock has no started_at/completed_at
    // registry interval to replicate the real `_vm_overlap_basis` formula against, so it filters on
    // the one timestamp every mock row already carries (`last_run_at`), inclusive on both ends. A
    // row with no timestamp signal at all (last_run_at: null — always-on services, orphans) is
    // NEVER filtered out, matching the backend's honest-absence pass-through.
    const dateFrom = reqUrl.searchParams.get("date_from") ?? "";
    const dateTo = reqUrl.searchParams.get("date_to") ?? "";
    let items = MOCK_DEPLOYMENT_INVENTORY;
    if (umbrella) {
      // EXPERIMENT folds under BATCH — a BATCH query returns experiment targets too.
      const keep = umbrella === "BATCH" ? ["BATCH", "EXPERIMENT"] : [umbrella];
      items = items.filter((i) => keep.includes(i.umbrella));
    }
    if (cloud) items = items.filter((i) => i.cloud === cloud);
    if (status) items = items.filter((i) => i.status === status);
    if (assetGroup) items = items.filter((i) => i.asset_group === assetGroup);
    if (dateFrom) items = items.filter((i) => !i.last_run_at || i.last_run_at >= dateFrom);
    if (dateTo) items = items.filter((i) => !i.last_run_at || i.last_run_at <= `${dateTo}T23:59:59Z`);
    const counts_by_kind: Record<string, number> = {};
    for (const i of items) counts_by_kind[i.kind] = (counts_by_kind[i.kind] ?? 0) + 1;
    // WS-2 date-range archive floor (decision 5) — mirrors the backend's `_archive_floor_date`
    // (30-day GCS retention): set only alongside a date-range request; `out_of_range` when the
    // requested `date_from` predates that floor, so the UI can show the explicit banner.
    let archiveFloor: string | null = null;
    let dateRangeOutOfRange = false;
    if (dateFrom || dateTo) {
      const floor = new Date();
      floor.setUTCDate(floor.getUTCDate() - 29);
      archiveFloor = floor.toISOString().slice(0, 10);
      dateRangeOutOfRange = Boolean(dateFrom) && dateFrom < archiveFloor;
    }
    return json({
      items,
      total: items.length,
      vm_count: items.filter((i) => i.kind === "VM").length,
      cloud_run_job_count: items.filter((i) => i.kind === "CLOUD_RUN_JOB").length,
      counts_by_kind,
      archive_floor: archiveFloor,
      date_range_out_of_range: dateRangeOutOfRange,
    });
  }
  // Region options for the selector (WS-D reconciliation) — default pinned first + the "all" sentinel.
  if (path === "/api/deployments/regions") {
    return json({
      default: "asia-northeast1",
      regions: ["asia-northeast1", "europe-west1", "europe-west3", "us-central1", "us-east1"],
      all_value: "all",
    });
  }
  // GET /api/deployments/{name}/detail — per-target D.1 metric vector + the thin item.
  // Mirrors deployment-api DeploymentDetailResponse (deployments_inventory.py:238). The metric
  // fields are null for a kind without /proc capture (services/jobs) — honest absence, never 0.
  {
    const detailMatch = path.match(/^\/api\/deployments\/(.+)\/detail$/);
    if (detailMatch) {
      const name = decodeURIComponent(detailMatch[1]);
      const row = MOCK_DEPLOYMENT_INVENTORY.find((i) => i.name === name);
      if (!row) return json({ detail: `no target ${name}` }, 404);
      const isVm = row.kind === "VM";
      const isJob = row.kind === "CLOUD_RUN_JOB";
      const toBytes = (mbps: number | null | undefined) => (mbps == null ? null : Math.round(mbps * 125000));
      return json({
        item: row,
        cpu_pct: isVm ? (row.cpu_pct ?? null) : null,
        mem_pct: isVm ? (row.mem_pct ?? null) : null,
        mem_slope: isVm ? (row.mem_slope ?? null) : null,
        disk_pct: isVm ? (row.disk_pct ?? null) : null,
        io_write_rate_bytes_sec: isVm && row.object_delta != null ? row.object_delta * 4096 : null,
        net_recv_rate_bytes_sec: isVm ? toBytes(row.net_recv_mbps) : null,
        workload_alive: isVm ? (row.workload_alive ?? null) : null,
        // WS-D #11/#12 — Cloud Run job run-history (last N executions) + the manifest object-delta hint.
        run_history: isJob
          ? [
              {
                name: `${name}-exec-3`,
                status: row.status,
                started_at: "2026-07-10T06:00:00Z",
                completed_at: "2026-07-10T06:05:00Z",
                duration_seconds: 300,
              },
              {
                name: `${name}-exec-2`,
                status: "succeeded",
                started_at: "2026-07-09T06:00:00Z",
                completed_at: "2026-07-09T06:04:30Z",
                duration_seconds: 270,
              },
              {
                name: `${name}-exec-1`,
                status: "succeeded",
                started_at: "2026-07-08T06:00:00Z",
                completed_at: "2026-07-08T06:06:00Z",
                duration_seconds: 360,
              },
            ]
          : [],
        object_delta: isJob ? (row.object_delta ?? null) : null,
      });
    }
  }
  // GET /api/vm-resources/rolling + /api/vm-resources/process-category — rolling-window
  // aggregate (deployment_durable_operational_data_bigquery_2026_07_21.md). Derives a plausible
  // avg/min/max/p95 from each VM row's point-in-time cpu_pct/mem_pct/disk_pct so the comparison
  // page + WorkHealthCard window selector have real-shaped data to render against in mock mode.
  if (path === "/api/vm-resources/rolling") {
    const reqUrl = new URL(url, "http://x");
    const window = (reqUrl.searchParams.get("window") ?? "1h") as "1h" | "4h" | "24h" | "1wk";
    const vmNameFilter = reqUrl.searchParams.get("vm_name");
    const vmRows = MOCK_DEPLOYMENT_INVENTORY.filter(
      (i) => i.kind === "VM" && i.cpu_pct != null && (!vmNameFilter || i.name === vmNameFilter),
    );
    const rows = vmRows.map((row) => {
      const cpu = row.cpu_pct ?? 0;
      const mem = row.mem_pct ?? 0;
      const disk = row.disk_pct ?? 0;
      return {
        vm_name: row.name,
        service: row.service ?? "",
        avg_cpu_pct: cpu,
        min_cpu_pct: Math.max(0, cpu - 15),
        max_cpu_pct: Math.min(100, cpu + 10),
        p95_cpu_pct: Math.min(100, cpu + 7),
        avg_mem_pct: mem,
        min_mem_pct: Math.max(0, mem - 10),
        max_mem_pct: Math.min(100, mem + 8),
        p95_mem_pct: Math.min(100, mem + 5),
        avg_disk_pct: disk,
        min_disk_pct: Math.max(0, disk - 3),
        max_disk_pct: Math.min(100, disk + 3),
        p95_disk_pct: Math.min(100, disk + 2),
        sample_count: window === "1h" ? 60 : window === "4h" ? 240 : window === "24h" ? 1440 : 10080,
      };
    });
    return json({ window, rows });
  }
  if (path === "/api/vm-resources/process-category") {
    const reqUrl = new URL(url, "http://x");
    const window = (reqUrl.searchParams.get("window") ?? "1h") as "1h" | "4h" | "24h" | "1wk";
    const vmName = reqUrl.searchParams.get("vm_name") ?? "";
    // All 5 real categories (categorize() in process_category_sampler.py) -- a live pull
    // against i-0c9b283b31d6b5ca7 confirmed the shape: mostly "other" (every non-agent host
    // process), a handful of "ci" (Runner.Listener), a few "worker_agent"/"ao_plan_work"
    // (interactive vs tmux_spawn-dispatched claude sessions), and exactly one "orchestrator".
    return json({
      vm_name: vmName,
      window,
      rows: [
        {
          category: "other",
          avg_cpu_pct: 2,
          max_cpu_pct: 15,
          avg_mem_pct: 1,
          max_mem_pct: 4,
          distinct_pids: 452,
          sample_count: 60,
        },
        {
          category: "worker_agent",
          avg_cpu_pct: 45,
          max_cpu_pct: 88,
          avg_mem_pct: 30,
          max_mem_pct: 55,
          distinct_pids: 5,
          sample_count: 60,
        },
        {
          category: "ao_plan_work",
          avg_cpu_pct: 38,
          max_cpu_pct: 82,
          avg_mem_pct: 26,
          max_mem_pct: 48,
          distinct_pids: 10,
          sample_count: 60,
        },
        {
          category: "ci",
          avg_cpu_pct: 8,
          max_cpu_pct: 25,
          avg_mem_pct: 5,
          max_mem_pct: 12,
          distinct_pids: 39,
          sample_count: 60,
        },
        {
          category: "orchestrator",
          avg_cpu_pct: 4,
          max_cpu_pct: 10,
          avg_mem_pct: 6,
          max_mem_pct: 9,
          distinct_pids: 1,
          sample_count: 60,
        },
      ],
    });
  }
  // GET /api/watchdog/kill-events — watchdog kill/violation events
  // (watchdog_kill_events_deployment_observability_2026_08_05.md). Mirrors
  // deployment-api routes/watchdog_events.py's WatchdogKillEventsResponse: optional vm_name
  // filter + hours lookback, newest first. The fixture models the resource-watchdog's payload
  // shape (reason strings like `rss:<kb>kB > <kb>kB`, a `killed` boolean that's false on a
  // dry-run), one row per queryable VM.
  if (path === "/api/watchdog/kill-events") {
    const reqUrl = new URL(url, "http://x");
    const hours = Number(reqUrl.searchParams.get("hours") ?? 24);
    const vmName = reqUrl.searchParams.get("vm_name") ?? null;
    return json({
      hours,
      vm_name: vmName,
      rows: [
        {
          ts: "2026-08-05T00:40:11Z",
          vm_name: vmName ?? "i-0c9b283b31d6b5ca7",
          pid: 3188231,
          slot_id: "slot-4",
          command: "python -m pytest tests/data_pipeline --maxfail=3",
          reason: "rss:51204000kB > 8388608kB",
          rss_mb: 51204,
          limit_mb: 8388,
          pressure_level: "critical",
          killed: true,
        },
        {
          ts: "2026-08-05T00:31:47Z",
          vm_name: vmName ?? "i-0c9b283b31d6b5ca7",
          pid: 4182332,
          slot_id: "slot-11",
          command: "uv run claude --resume",
          reason: "swap:5242880kB > 4194304kB",
          rss_mb: 28760,
          limit_mb: 8388,
          pressure_level: "high",
          killed: false,
        },
      ],
    });
  }
  // GET /api/deployments/{name}/run-log/{metadata,tail,download} — WS-4 run.log viewer
  // (deployment_ui_vm_log_viewer_2026_07_20.md). Mirrors deployment-api's
  // RunLogMetadataResponse/RunLogTailResponse/RunLogDownloadResponse. A row with
  // run_log_uri present resolves "live" (or, for sports-backfill-20260621, "archive" —
  // simulating the live path past its 14-day TTL, so the archive-fallback banner has a
  // real regression target); run_log_uri: null resolves the honest exists=false absence
  // (matches the real resolver's behaviour for a VM that predates the final-snapshot writer).
  {
    const runLogMatch = path.match(/^\/api\/deployments\/(.+)\/run-log\/(metadata|tail|download)$/);
    if (runLogMatch) {
      const name = decodeURIComponent(runLogMatch[1]);
      const kind = runLogMatch[2];
      const row = MOCK_DEPLOYMENT_INVENTORY.find((i) => i.name === name);
      const exists = Boolean(row?.run_log_uri);
      const location: "live" | "archive" | null = !exists
        ? null
        : name === "sports-backfill-20260621"
          ? "archive"
          : "live";
      const uri = row?.run_log_uri ?? "";
      const sizeBytes = exists ? 842_331 : null;
      const lastModified = exists ? "2026-07-21T04:00:00Z" : null;
      if (kind === "metadata") {
        return json({ name, exists, location, uri, size_bytes: sizeBytes, last_modified: lastModified });
      }
      if (kind === "tail") {
        const reqUrl = new URL(url, "http://x");
        const linesParam = reqUrl.searchParams.get("lines");
        const maxLines = linesParam ? Math.max(1, Math.min(Number(linesParam), 300)) : 300;
        const lines = exists
          ? Array.from({ length: Math.min(12, maxLines) }, (_, i) => `[mock] ${name} run.log line ${i + 1}`)
          : [];
        return json({
          name,
          exists,
          location,
          uri,
          size_bytes: sizeBytes,
          last_modified: lastModified,
          lines,
          line_count: lines.length,
          tail_bytes: lines.reduce((s, l) => s + l.length + 1, 0),
        });
      }
      // download
      return json({
        name,
        exists,
        location,
        download_url: exists
          ? `https://storage.googleapis.com/deployment-scripts-mock/${name}/run.log?mock-signed`
          : "",
        expires_in_seconds: exists ? 900 : 0,
      });
    }
  }
  {
    const summaryMatch = path.match(/^\/api\/deployments\/umbrella\/([^/]+)\/summary$/);
    if (summaryMatch) {
      const umbrella = summaryMatch[1].toUpperCase();
      const keep = umbrella === "BATCH" ? ["BATCH", "EXPERIMENT"] : [umbrella];
      const scoped = MOCK_DEPLOYMENT_INVENTORY.filter((i) => keep.includes(i.umbrella));
      const counts: Record<string, number> = {};
      for (const i of scoped) counts[i.status] = (counts[i.status] ?? 0) + 1;
      const failures = scoped
        .filter((i) => i.status === "failed")
        .sort((a, b) => (b.last_run_at ?? "").localeCompare(a.last_run_at ?? ""));
      const lastFailure = failures[0]
        ? { name: failures[0].name, exit_code: failures[0].exit_code, last_run_at: failures[0].last_run_at }
        : null;
      return json({
        umbrella,
        total: scoped.length,
        counts_by_status: counts,
        stale_count: counts["stale"] ?? 0,
        last_failure: lastFailure,
      });
    }
  }
  if (path === "/api/deployments") {
    const deps = getStressDeployments();
    return json({
      deployments: deps,
      total_count: deps.length,
      has_more: false,
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
  // Per-deployment manifest-derived freshness (Phase 4.5). The deployment's
  // ShardResponsibility resolves which asset_group's availability-index heartbeat counts;
  // a `none` responsibility (gateway/control-plane) honestly reports `liveness_only`.
  // Mirrors deployment-api@f05a1dc GET /api/deployments/{id}/freshness.
  if (path.match(/^\/api\/deployments\/(.+)\/freshness$/)) {
    const id = decodeURIComponent(path.split("/")[3]);
    // A small fixture keyed on the mock LIVE inventory rows so the cockpit Live feed-health
    // column + the Health Data-Coverage tile render fresh / stale / liveness-only honestly.
    const FRESHNESS: Record<string, Record<string, unknown>> = {
      "defi-live-capture-1": {
        responsibility: "asset_group_capture",
        asset_group: "defi",
        mode: "live",
        freshness_status: "fresh",
        index_age_seconds: 48,
        staleness_budget_seconds: 300,
        per_vm_shard_fallback_active: false,
        oldest_available_at: "2026-06-22T08:29:00Z",
        detail: "consolidated availability index 48s old (budget 300s) — fresh",
      },
      "cefi-live-trading-1": {
        responsibility: "asset_group_capture",
        asset_group: "cefi",
        mode: "live",
        freshness_status: "stale",
        index_age_seconds: 4200,
        staleness_budget_seconds: 300,
        per_vm_shard_fallback_active: true,
        oldest_available_at: "2026-06-22T07:19:00Z",
        detail: "consolidated availability index 70m old (budget 300s) — STALE, per-VM shard fallback active",
      },
    };
    const found = FRESHNESS[id];
    if (found) return json({ deployment_id: id, ...found });
    // Default: liveness-only (a gateway / control-plane / unclassified target).
    return json({
      deployment_id: id,
      responsibility: "none",
      asset_group: null,
      mode: null,
      freshness_status: "liveness_only",
      index_age_seconds: null,
      staleness_budget_seconds: null,
      per_vm_shard_fallback_active: false,
      oldest_available_at: null,
      detail: "liveness-only (gateway / control-plane — no data-freshness obligation)",
    });
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
    // Service-aware (2026-07-17): this handler previously returned the SINGLE
    // PREDICTION entry below regardless of `?service=`, so the instruments-service
    // page rendered no cefi/tradfi/defi cards in mock mode at all — which is why
    // the P5/P7/P4-A browser checks kept coming back INCONCLUSIVE rather than
    // passing or failing. The instruments-service branch below carries the real
    // per-asset-group shape so those three behaviours are actually exercisable:
    //   * P5  — cefi/tradfi/defi shard axes ⊆ {venue, chain} => the redundant
    //           hierarchical drilldown is suppressed; sports/prediction keep it.
    //   * P7  — ONLY defi carries `extras.chains`; cefi must render venue-only.
    //   * P4-A — `instrument_type` breakdowns deliberately mix canonical
    //           (SPOT_PAIR/PERPETUAL/FUTURE) with legacy-lowercase (`spot`,
    //           `perpetual`) and the blank `__legacy__` sentinel, so
    //           `canonicalInstrumentTypeLabel` + the axis-aware "(unlabeled)" vs
    //           "(legacy — pre-job_id)" rendering both have real inputs.
    // Read from the RAW `url`, not `path` — handleRoute strips the query string
    // out of `path` (`.replace(/\?.*$/, "")`), so a searchParams read there is
    // always empty. Same convention as the other query-aware handlers above.
    const serviceParam = new URL(url, "http://x").searchParams.get("service");
    if (serviceParam === "instruments-service") {
      return json({
        service: "instruments-service",
        asset_groups: {
          CEFI: {
            total_shards: 79_943,
            total_instrument_rows: 4_850_000,
            total_instruments: 424_465,
            unique_dates: 2_670,
            unique_venues: 29,
            sub_dimension_label: "venues",
            group_axis: "venue",
            date_range: { start: "2019-03-30", end: "2026-07-17" },
            latest_day: "2026-07-17",
            latest_day_instruments: { "BINANCE-SPOT": 1198, DERIBIT: 334_468 },
            latest_day_total: 335_666,
            breakdowns: {
              instrument_type: {
                SPOT_PAIR: 20_653,
                PERPETUAL: 24_007,
                FUTURE: 5_589,
                OPTION: 3_120,
                spot: 502,
                perpetual: 1_150,
                __legacy__: 13_046,
              },
              data_type: { instruments: 79_659, __legacy__: 284 },
            },
          },
          DEFI: {
            total_shards: 175_172,
            total_instrument_rows: 3_030_000,
            total_instruments: 10_883,
            unique_dates: 2_666,
            unique_venues: 63,
            sub_dimension_label: "venues",
            group_axis: "venue",
            date_range: { start: "2021-04-23", end: "2026-07-17" },
            latest_day: "2026-07-17",
            latest_day_instruments: { "UNISWAP_V3-ETHEREUM": 473, "AAVE_V3-ETHEREUM": 113 },
            latest_day_total: 586,
            breakdowns: {
              instrument_type: {
                POOL: 7_212,
                SPOT_ASSET: 1_389,
                A_TOKEN: 1_117,
                DEBT_TOKEN: 1_060,
                LST: 3,
                STAKING: 3,
                __legacy__: 65_443,
              },
              data_type: { instruments: 175_172 },
            },
            // P7: chains are a DEFI-only sub-dimension (defi shard axes are
            // ("venue","chain")). cefi above deliberately has none.
            extras: { chains: { ETHEREUM: 5_120, BASE: 2_310, ARBITRUM: 1_880, POLYGON: 940, SOLANA: 633 } },
          },
          TRADFI: {
            total_shards: 27_159,
            total_instrument_rows: 47_189_618,
            total_instruments: 1_173_803,
            unique_dates: 1_820,
            unique_venues: 6,
            sub_dimension_label: "venues",
            group_axis: "venue",
            date_range: { start: "2019-06-04", end: "2026-07-17" },
            latest_day: "2026-07-17",
            latest_day_instruments: { CME: 74_005, CBOE: 12_400 },
            latest_day_total: 86_405,
            breakdowns: {
              instrument_type: {
                OPTION: 69_704,
                COMBO: 4_437,
                FUTURE: 347,
                EQUITY: 2_100,
                ETF: 480,
                INDEX: 96,
              },
              data_type: { instruments: 27_159 },
            },
          },
          SPORTS: {
            total_shards: 5_353_331,
            total_instrument_rows: 5_353_331,
            total_instruments: 27_240,
            unique_dates: 1_400,
            unique_venues: 12,
            sub_dimension_label: "data types",
            group_axis: "data_type",
            date_range: { start: "2022-08-01", end: "2026-07-17" },
            latest_day: "2026-07-17",
            latest_day_instruments: { FIXTURES: 320, TEAMS: 40 },
            latest_day_total: 360,
            // sports breaks down on `source` (UAC BREAKDOWN_AXES), not instrument_type.
            breakdowns: {
              source: {
                api_football: 4_890_000,
                mdps_odds_horizon_bucket: 356_131,
                instruments_service: 100_472,
                odds_api: 6_728,
              },
            },
          },
          PREDICTION: {
            total_shards: 26_762,
            total_instrument_rows: 2_673_230,
            total_instruments: 2_673_230,
            unique_dates: 900,
            unique_venues: 2,
            sub_dimension_label: "question groups",
            group_axis: "canonical_question_group",
            date_range: { start: "2023-01-01", end: "2026-07-17" },
            latest_day: "2026-07-17",
            latest_day_instruments: { POLYMARKET: 1_400, KALSHI: 900 },
            latest_day_total: 2_300,
            breakdowns: {
              data_type: { prediction_market_lifecycle: 25_053, prediction_canonical_question_group: 1_709 },
            },
          },
        },
        totals: {
          shards: 5_662_367,
          instrument_rows: 63_096_179,
          dates_across_asset_groups: 2_670,
          latest_day_instruments: 425_317,
          unique_instruments: 4_309_631,
        },
        totals_source: "rollup",
        served_from: "mock",
        mock: true,
      });
    }
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
  if ((path === "/cloud-builds/trigger" || path === "/api/cloud-builds/trigger") && method === "POST") {
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
    // Symbol-search click-through — SPORTS branch (2026-07-21). The generic
    // MOCK_DATA_STATUS fixture's per-asset-group `dates_found_list`/
    // `dates_missing_list` are always `[]` (an unfiltered fixture never
    // populates them), which would make every league's day-level panel look
    // permanently empty in mock mode. Mirror the real backend's
    // `secondary_axis=league_id` row-filter carve-out with a small
    // deterministic found/missing day split scoped to the requested league +
    // date range, so the click-through panel has something real to render.
    const qp = new URL(url, "http://mock").searchParams;
    const secondaryAxis = qp.get("secondary_axis");
    const leagueId = qp.get("league_id");
    if (path.startsWith("/api/data-status/manifest") && secondaryAxis === "league_id" && leagueId) {
      const start = qp.get("start_date") ?? "2025-01-01";
      const end = qp.get("end_date") ?? "2025-01-10";
      const days: string[] = [];
      const endD = new Date(`${end}T00:00:00Z`);
      for (
        let d = new Date(`${start}T00:00:00Z`);
        d.getTime() <= endD.getTime() && days.length < 30;
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        days.push(d.toISOString().split("T")[0]);
      }
      const foundDays = days.filter((_, i) => i % 3 !== 0);
      const missingDays = days.filter((_, i) => i % 3 === 0);
      const completionPct = days.length > 0 ? Math.round((foundDays.length / days.length) * 10000) / 100 : 0;
      return json({
        service: qp.get("service") ?? "market-tick-data-service",
        date_range: { start, end, days: days.length },
        mode: "turbo",
        sub_dimension: "league_id",
        overall_completion_pct: completionPct,
        overall_dates_found: foundDays.length,
        overall_dates_expected: days.length,
        asset_groups: {
          SPORTS: {
            asset_group: "SPORTS",
            bucket: "mock-bucket-sports",
            prefixes_queried: days.length,
            dates_expected: days.length,
            dates_found: foundDays.length,
            dates_missing: missingDays.length,
            completion_pct: completionPct,
            missing_dates: missingDays,
            dates_found_count: foundDays.length,
            dates_found_list: foundDays,
            dates_missing_count: missingDays.length,
            dates_missing_list: missingDays,
          },
        },
        mock: true,
      });
    }
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
          // P4-B: on-chain BASE-leg address (real WETH mainnet address, so the
          // copyable affordance renders against a plausible value in mock mode).
          // The two rows below deliberately OMIT the field — that is the honest
          // CeFi shape (no on-chain address), and it keeps the mock exercising
          // both branches of the render gate.
          base_asset_contract_address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
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
  // P6 phase-1 catalogue explorer (data_status_page_ux_and_canonicalisation_
  // 2026_07_16) — availability-derived "captured instruments" list. Mirrors
  // the real response shape (deployment-api routes/data_status/_catalogue.py):
  // a handful of rows spanning every capture_status + a mix of is_mvp so the
  // MVP toggle + badges have something real to narrow/exercise in mock mode.
  if (path.startsWith("/api/data-status/download-catalogue-csv")) {
    const csv =
      "instrument_id,name,venue,instrument_type,data_type,capture_status,error_reason,attempted_at,is_mvp\n" +
      "BINANCE-SPOT-BTCUSDT,,BINANCE-SPOT,SPOT_PAIR,instruments,captured,,2026-07-15T00:10:00+00:00,True\n" +
      "BINANCE-SPOT-ETHUSDT,,BINANCE-SPOT,SPOT_PAIR,instruments,captured,,2026-07-15T00:10:00+00:00,True\n" +
      "KRX:EQUITY:005930,Samsung Electronics,KRX,EQUITY,instruments,captured,,2026-07-15T00:10:00+00:00,True\n" +
      "DERIBIT-BTC-26SEP26-100000-C,,DERIBIT,OPTION,instruments,empty_confirmed,,2026-07-14T00:12:00+00:00,False\n" +
      "OKX-DOGEUSDT,,OKX-SPOT,SPOT_PAIR,instruments,attempted_failed,RATE_LIMIT_HIT,2026-07-13T00:14:00+00:00,False\n";
    return new Response(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "X-Row-Count": "5" },
    });
  }
  // Catalogue Explorer filter dropdowns (F3, round-3 UI review) — MUST precede
  // the "/api/data-status/catalogue" prefix below (which this path also starts
  // with); without a dedicated handler it fell through to the catalogue-rows
  // shape, whose response has no `venues` array → CatalogueExplorer crashed on
  // `.map`. Distinct values mirror the mock catalogue rows.
  if (path.startsWith("/api/data-status/catalogue-filter-options")) {
    const params = new URL(url, "http://mock").searchParams;
    return json({
      service: params.get("service") || "instruments-service",
      asset_group: (params.get("asset_group") || "cefi").toLowerCase(),
      venues: ["BINANCE-SPOT", "DERIBIT", "OKX-SPOT"],
      instrument_types: ["OPTION", "SPOT_PAIR"],
      data_types: ["instruments"],
      mock: true,
    });
  }
  // Cross-service E2E pipeline trace (GAP G-TRACE) — the PipelineTraceCard panel.
  // Mirrors a real observed shape (upstream stages captured, a downstream stage
  // never attempted) so mock mode exercises the same "found the stuck hop" UI
  // path as real data. Path is `/pipeline-trace`, so it must precede the
  // broader `/api/data-status/...` prefixes below.
  if (path.startsWith("/api/data-status/pipeline-trace")) {
    const reqUrl = new URL(url, "http://mock");
    const instrument = reqUrl.searchParams.get("instrument") ?? "";
    const date = reqUrl.searchParams.get("date") ?? "";
    const assetGroup = (reqUrl.searchParams.get("asset_group") ?? "cefi").toLowerCase();
    const capturedHop = (stage: number, service: string) => ({
      stage,
      service,
      status: "captured" as const,
      error_reason: "",
      attempted_at: "2026-08-04T07:01:10.073250+00:00",
      written_at: "2026-08-04T07:01:10.073250+00:00",
    });
    const neverAttemptedHop = (stage: number, service: string) => ({
      stage,
      service,
      status: "never_attempted" as const,
      error_reason: "",
      attempted_at: "",
      written_at: "",
    });
    // A well-established pair (BTC-USDT) is fully captured through the whole
    // chain; anything else mirrors the real observed shape (upstream captured,
    // a downstream stage never attempted) — deterministic on the instrument
    // string so the two UI states (all-clear vs. stuck) are both reachable
    // through this same client-side-intercepted mock path (no real network
    // request is ever made in mock mode, so a Playwright `page.route` override
    // cannot drive this endpoint — see tests/smoke/pipeline_trace_card.spec.ts).
    const allCaptured = instrument.toUpperCase().includes("BTC-USDT");
    const hops = allCaptured
      ? [
          capturedHop(1, "instruments-service"),
          capturedHop(2, "market-tick-data-service"),
          capturedHop(3, "market-data-processing-service"),
          capturedHop(4, "features-onchain-service"),
          capturedHop(4, "features-delta-one-service"),
          capturedHop(4, "features-volatility-service"),
          capturedHop(5, "strategy-service"),
          capturedHop(6, "execution-service"),
        ]
      : [
          neverAttemptedHop(1, "instruments-service"),
          capturedHop(2, "market-tick-data-service"),
          capturedHop(3, "market-data-processing-service"),
          neverAttemptedHop(4, "features-onchain-service"),
          neverAttemptedHop(4, "features-delta-one-service"),
          neverAttemptedHop(4, "features-volatility-service"),
          neverAttemptedHop(5, "strategy-service"),
          neverAttemptedHop(6, "execution-service"),
        ];
    return json({
      instrument,
      date,
      asset_group: assetGroup,
      hops,
      stuck_at: allCaptured ? null : "instruments-service",
      mock: true,
    });
  }
  // RAW distinct-values enumeration (honest-coverage-rollup sourced) — the
  // server-side canonical-drift surface consumed by the DistinctValuesPanel.
  // Carries NON-canonical duplicate spellings (AAVE/AAVE_V3, lending/LENDING,
  // dex_pools/dex_pool_state, HYPERLIQUID) each with an `is_canonical` flag so
  // mock mode exercises the same badge path as real data. Path is
  // `/distinct-values/{asset_group}`, so it must precede the broader
  // `/api/data-status/...` prefixes below.
  if (path.startsWith("/api/data-status/distinct-values")) {
    const assetGroup = (path.split("/").pop() || "defi").toLowerCase();
    return json({
      asset_group: assetGroup,
      source: "honest-coverage-rollup",
      source_date: "2026-07-18",
      generated_at: "2026-07-18T02:14:00+00:00",
      axes: {
        venues: [
          { value: "AAVE", is_canonical: false },
          { value: "AAVE_V3", is_canonical: false },
          { value: "UNISWAP_V3-ETHEREUM", is_canonical: true },
          { value: "COMPOUND", is_canonical: false },
        ],
        instrument_types: [
          { value: "LENDING", is_canonical: true },
          { value: "lending", is_canonical: false },
          { value: "POOL", is_canonical: true },
          { value: "pool", is_canonical: false },
        ],
        data_types: [
          { value: "dex_pool_state", is_canonical: true },
          { value: "dex_pools", is_canonical: false },
          { value: "dex_swaps", is_canonical: false },
        ],
        chains: [
          { value: "ETHEREUM", is_canonical: true },
          { value: "ARBITRUM", is_canonical: true },
          { value: "HYPERLIQUID", is_canonical: false },
        ],
      },
      non_canonical_count: { venues: 3, instrument_types: 2, data_types: 2, chains: 1 },
      mock: true,
    });
  }
  // Axis Value Census (Track-6 restoration, cefi_consolidated_closeout_2026_07_18)
  // — the non-canonical-naming / duplication detector. Deliberately shows raw
  // NON-canonicalised duplicate spellings (spot / SPOT_PAIR / spot_pair) so
  // mock mode exercises the same "flag likely duplicates" UI path as real data.
  if (path.startsWith("/api/data-status/axis-value-census")) {
    const params = new URL(url, "http://mock").searchParams;
    return json({
      service: params.get("service") || "instruments-service",
      asset_group: (params.get("asset_group") || "cefi").toLowerCase(),
      row_count: 7,
      axes: {
        venue: [
          { value: "BINANCE-SPOT", count: 3 },
          { value: "DERIBIT", count: 2 },
          { value: "OKX-SPOT", count: 2 },
        ],
        chain: [
          { value: "ETHEREUM", count: 4 },
          { value: "SOLANA", count: 3 },
        ],
        instrument_type: [
          { value: "SPOT_PAIR", count: 2 },
          { value: "spot", count: 1 },
          { value: "spot_pair", count: 1 },
          { value: "OPTION", count: 2 },
          { value: "PERPETUAL", count: 1 },
        ],
        data_type: [{ value: "instruments", count: 7 }],
        source: [
          { value: "tardis", count: 5 },
          { value: "databento", count: 2 },
        ],
        pipeline_mode: [
          { value: "batch_tardis", count: 5 },
          { value: "live_tardis", count: 2 },
        ],
        timeframe: [
          { value: "1m", count: 3 },
          { value: "1h", count: 2 },
          { value: "1d", count: 2 },
        ],
        quote_asset: [
          { value: "USDT", count: 3 },
          { value: "USDC", count: 2 },
          { value: "BTC", count: 1 },
          { value: "ETH", count: 1 },
        ],
        margin_type: [
          { value: "coin", count: 3 },
          { value: "usd", count: 4 },
        ],
      },
      truncated_axes: [],
      mock: true,
    });
  }
  if (path.startsWith("/api/data-status/catalogue")) {
    const params = new URL(url, "http://mock").searchParams;
    const venue = params.get("venue")?.trim().toUpperCase() || "";
    const instrumentType = params.get("instrument_type")?.trim().toUpperCase() || "";
    const dataType = params.get("data_type")?.trim().toUpperCase() || "";
    const search = params.get("search")?.trim().toLowerCase() || "";
    const mvpOnly = params.get("mvp_only") === "true";
    const limit = Number(params.get("limit") ?? 50);
    const offset = Number(params.get("offset") ?? 0);

    const allRows = [
      {
        instrument_id: "BINANCE-SPOT-BTCUSDT",
        name: "",
        venue: "BINANCE-SPOT",
        instrument_type: "SPOT_PAIR",
        data_type: "instruments",
        capture_status: "captured",
        error_reason: "",
        attempted_at: "2026-07-15T00:10:00+00:00",
        is_mvp: true,
      },
      {
        instrument_id: "BINANCE-SPOT-ETHUSDT",
        name: "",
        venue: "BINANCE-SPOT",
        instrument_type: "SPOT_PAIR",
        data_type: "instruments",
        capture_status: "captured",
        error_reason: "",
        attempted_at: "2026-07-15T00:10:00+00:00",
        is_mvp: true,
      },
      {
        // Opaque 6-digit KRX code carrying a human-readable issuer name — the
        // Deliverable-1 case the Name column exists to render.
        instrument_id: "KRX:EQUITY:005930",
        name: "Samsung Electronics",
        venue: "KRX",
        instrument_type: "EQUITY",
        data_type: "instruments",
        capture_status: "captured",
        error_reason: "",
        attempted_at: "2026-07-15T00:10:00+00:00",
        is_mvp: true,
      },
      {
        instrument_id: "DERIBIT-BTC-26SEP26-100000-C",
        name: "",
        venue: "DERIBIT",
        instrument_type: "OPTION",
        data_type: "instruments",
        capture_status: "empty_confirmed",
        error_reason: "",
        attempted_at: "2026-07-14T00:12:00+00:00",
        is_mvp: false,
      },
      {
        instrument_id: "OKX-DOGEUSDT",
        name: "",
        venue: "OKX-SPOT",
        instrument_type: "SPOT_PAIR",
        data_type: "instruments",
        capture_status: "attempted_failed",
        error_reason: "RATE_LIMIT_HIT",
        attempted_at: "2026-07-13T00:14:00+00:00",
        is_mvp: false,
      },
    ];

    const filtered = allRows.filter((row) => {
      if (venue && row.venue !== venue) return false;
      if (instrumentType && row.instrument_type !== instrumentType) return false;
      if (dataType && row.data_type !== dataType) return false;
      if (mvpOnly && !row.is_mvp) return false;
      if (search && !row.instrument_id.toLowerCase().includes(search)) return false;
      return true;
    });

    return json({
      service: "instruments-service",
      asset_group: (params.get("asset_group") || "cefi").toLowerCase(),
      venue: params.get("venue") || null,
      instrument_type: params.get("instrument_type") || null,
      data_type: params.get("data_type") || null,
      label: "captured instruments (availability-derived)",
      instruments: filtered.slice(offset, offset + limit),
      total_count: filtered.length,
      limit,
      offset,
      has_more: offset + limit < filtered.length,
      search: params.get("search") || "",
      mvp_only: mvpOnly,
      mock: true,
    });
  }
  // Cross-category canonical-symbol search (Gap 3) — checked BEFORE the
  // generic `/api/data-status/instruments` prefix match below, which would
  // otherwise swallow this path too (`startsWith` matches both) and return
  // the wrong `{instruments: [...]}` shape instead of `InstrumentSearchResponse`
  // (`{matches: [...]}`) — `searchInstruments()` would then hand back
  // `matches: undefined` and the symbol-search results `.map()` would throw.
  // A handful of representative rows spanning every asset_group (including a
  // SPORTS league_id-only row) so both symbol-search click-through branches
  // have something real to click in mock mode.
  if (path === "/api/data-status/instruments/search") {
    const qp = new URL(url, "http://mock").searchParams;
    const query = qp.get("query") ?? "";
    const limit = Number(qp.get("limit") ?? 50);
    const allMatches = [
      {
        canonical_id: "BINANCE-FUTURES:PERPETUAL:BTC-USDT",
        asset_group: "CEFI",
        venue: "BINANCE-FUTURES",
        instrument_type: "PERPETUAL",
      },
      {
        canonical_id: "BINANCE-SPOT:SPOT_PAIR:BTC-USDT",
        asset_group: "CEFI",
        venue: "BINANCE-SPOT",
        instrument_type: "SPOT_PAIR",
      },
      {
        canonical_id: "DATABENTO-DBEQ:EQUITY:AAPL",
        asset_group: "TRADFI",
        venue: "DATABENTO-DBEQ",
        instrument_type: "EQUITY",
      },
      {
        canonical_id: "UNISWAP_V3:POOL:USDC-WETH-500",
        asset_group: "DEFI",
        venue: "UNISWAP_V3",
        instrument_type: "POOL",
      },
      {
        canonical_id: "POLYMARKET:MARKET:WILL-BTC-100K-2026",
        asset_group: "PREDICTION",
        venue: "POLYMARKET",
        instrument_type: "MARKET",
      },
      { canonical_id: "EPL", asset_group: "SPORTS", venue: "SPORTSDATA", instrument_type: "league" },
      { canonical_id: "BUNDESLIGA", asset_group: "SPORTS", venue: "SPORTSDATA", instrument_type: "league" },
    ];
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = allMatches.filter((m) => {
      const haystack = m.canonical_id.toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
    return json({
      query,
      asset_group: null,
      matches: filtered.slice(0, limit),
      total_matches: filtered.length,
      truncated: filtered.length > limit,
      asset_groups_searched: ["CEFI", "TRADFI", "DEFI", "SPORTS", "PREDICTION"],
    });
  }
  if (path.startsWith("/api/data-status/instruments")) {
    return json({
      instruments: ["BTC/USDT", "ETH/USDT", "AAPL", "MSFT"],
      error: null,
    });
  }
  if (path.startsWith("/api/data-status/instrument-availability")) {
    // Bug B (2026-07-21, see client.ts `RawInstrumentAvailabilityResponse`
    // comment): the real backend returns `{daily_availability, summary, ...}`,
    // not `{overall, by_data_type}` — the stale shape previously here made
    // `getInstrumentAvailability()` throw (`for (const dt of raw.data_types)`
    // over `undefined`) the moment either the manual "Instrument-Level
    // Search" flow or the symbol-search click-through called it in mock mode.
    const qp = new URL(url, "http://mock").searchParams;
    const venue = qp.get("venue") ?? "MOCK-VENUE";
    const instrument_type = qp.get("instrument_type") ?? "SPOT_PAIR";
    const instrument = qp.get("instrument") ?? "MOCK-SYMBOL";
    const start = qp.get("start_date") ?? "2025-01-01";
    const end = qp.get("end_date") ?? "2025-01-10";
    const dataTypeParam = qp.get("data_type");
    const dataTypes = dataTypeParam ? [dataTypeParam] : ["trades", "book_snapshot_5"];
    const days: string[] = [];
    const endD = new Date(`${end}T00:00:00Z`);
    for (
      let d = new Date(`${start}T00:00:00Z`);
      d.getTime() <= endD.getTime() && days.length < 30;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      days.push(d.toISOString().split("T")[0]);
    }
    const dailyAvailability: Record<string, Record<string, boolean>> = {};
    days.forEach((day, i) => {
      const perType: Record<string, boolean> = {};
      dataTypes.forEach((dt, j) => {
        perType[dt] = (i + j) % 4 !== 0;
      });
      dailyAvailability[day] = perType;
    });
    const availableDays = days.filter((day) => dataTypes.some((dt) => dailyAvailability[day][dt]));
    const missingDays = days.filter((day) => dataTypes.every((dt) => !dailyAvailability[day][dt]));
    const totalCells = days.length * dataTypes.length;
    const availableCells = Object.values(dailyAvailability).reduce(
      (acc, perType) => acc + Object.values(perType).filter(Boolean).length,
      0,
    );
    return json({
      venue,
      instrument_type,
      instrument,
      date_range: { start, end },
      effective_range: { start, end },
      data_types: dataTypes,
      daily_availability: dailyAvailability,
      summary: {
        total_days: days.length,
        available_days: availableDays.length,
        missing_days: missingDays.length,
        availability_rate: totalCells > 0 ? Math.round((availableCells / totalCells) * 10000) / 100 : 0,
      },
      error: null,
    });
  }

  // P2 lifecycle cards (new-listings / upcoming-expiries) — plan
  // data_status_page_ux_and_canonicalisation_2026_07_16 P2. A handful of
  // representative rows so the cards render something in mock mode. Mirrors
  // the real ``CatalogueLifecycleRow`` shape (deployment-api
  // routes/catalogue_lifecycle.py).
  if (path.startsWith("/api/instruments/new-listings")) {
    const params = new URL(url, "http://mock").searchParams;
    const limit = Number(params.get("limit") ?? 50);
    const offset = Number(params.get("offset") ?? 0);
    const allNewListings = [
      {
        instrument_id: "BINANCE-SPOT-SOLUSDT",
        instrument_type: "SPOT_PAIR",
        asset_group: "cefi",
        venue: "BINANCE-SPOT",
        chain: "",
        base_asset: "SOL",
        raw_symbol: "SOLUSDT",
        available_from: "2026-07-15",
        available_to: "",
        mvp: true,
        available_from_is_venue_first_day: false,
      },
      {
        instrument_id: "AAVE_V3-ETHEREUM-POOL-WETH",
        instrument_type: "POOL",
        asset_group: "defi",
        venue: "AAVE_V3",
        chain: "ETHEREUM",
        base_asset: "WETH",
        raw_symbol: "AAVE-V3-WETH-POOL",
        available_from: "2026-07-12",
        available_to: "",
        mvp: false,
        available_from_is_venue_first_day: false,
      },
      // Models the REAL onboarding-flood false positive found on prod GCS
      // 2026-07-17 (COINBASE-CDE: 99 rows all stamped the venue's first
      // captured day, with expiries out to 2030) so mock mode renders the
      // "listing date unconfirmed" affordance.
      {
        instrument_id: "COINBASE-CDE:FUTURE:BTC-USD@LIN-20301220",
        instrument_type: "FUTURE",
        asset_group: "cefi",
        venue: "COINBASE-CDE",
        chain: "",
        base_asset: "BTC",
        raw_symbol: "BTC-20DEC30-CDE",
        available_from: "2026-07-10",
        available_to: "2030-12-20",
        mvp: false,
        available_from_is_venue_first_day: true,
      },
    ];
    return json({
      new_listings: allNewListings.slice(offset, offset + limit),
      total_count: allNewListings.length,
      limit,
      offset,
      has_more: offset + limit < allNewListings.length,
      mock: true,
    });
  }
  // P9 fixtures browser (operator request) — league -> day -> fixtures rows.
  // Mirrors the real ``FixturesByLeagueAndDay`` shape (deployment-api
  // routes/fixtures_browse.py).
  if (path.startsWith("/api/fixtures/browse")) {
    // Honour the date/league/team narrows (operator ask 2026-07-17) rather than
    // always returning the full set — an unfiltered mock makes the filter bar
    // look BROKEN locally (you type a team and nothing changes).
    // Structural local mirror of the client's `FixtureRow` — declared here
    // rather than imported from ../api/client to avoid a circular import
    // (client.ts pulls in this module to intercept fetches).
    type MockFixtureRow = {
      fixture_id: string;
      kickoff_utc: string;
      league_id: string;
      home_team_id: string;
      away_team_id: string;
      home_team_name: string;
      away_team_name: string;
      venue_id: string;
      venue_name: string;
      status: string;
      round: string;
    };
    const browseQs = new URLSearchParams(path.split("?")[1] ?? "");
    const teamNeedle = (browseQs.get("team") ?? "").trim().toLowerCase();
    const leagueNeedle = (browseQs.get("league_id") ?? "").trim();
    const startDay = (browseQs.get("start_date") ?? "").trim();
    const endDay = (browseQs.get("end_date") ?? "").trim();
    const allLeagues: Record<string, Record<string, MockFixtureRow[]>> = {
      EPL: {
        "2026-07-16": [
          {
            fixture_id: "epl-1001",
            kickoff_utc: "2026-07-16T15:00:00+00:00",
            league_id: "EPL",
            home_team_id: "t-ars",
            away_team_id: "t-che",
            home_team_name: "Arsenal",
            away_team_name: "Chelsea",
            venue_id: "v-emi",
            venue_name: "Emirates Stadium",
            status: "NS",
            round: "Regular Season - 1",
          },
        ],
        "2026-07-17": [
          {
            fixture_id: "epl-1002",
            kickoff_utc: "2026-07-17T18:30:00+00:00",
            league_id: "EPL",
            home_team_id: "t-liv",
            away_team_id: "t-mci",
            home_team_name: "Liverpool",
            away_team_name: "Manchester City",
            venue_id: "v-anf",
            venue_name: "Anfield",
            status: "NS",
            round: "Regular Season - 1",
          },
        ],
      },
      MLS: {
        "2026-07-16": [
          {
            fixture_id: "mls-2001",
            kickoff_utc: "2026-07-16T23:00:00+00:00",
            league_id: "MLS",
            home_team_id: "t-lafc",
            away_team_id: "t-lag",
            home_team_name: "LAFC",
            away_team_name: "LA Galaxy",
            venue_id: "v-bmo",
            venue_name: "BMO Stadium",
            status: "NS",
            round: "Regular Season",
          },
        ],
      },
    };

    // league_names map (F1, round-3 UI review) — the real backend resolves the
    // catalogue league_id to a human display_name (UAC); mirror it so the mock
    // exercises the name-rendering path (unmapped ids stay absent → raw id).
    const LEAGUE_DISPLAY_NAMES: Record<string, string> = {
      EPL: "English Premier League",
      MLS: "Major League Soccer",
    };
    // F9 (operator 2026-07-18): case-insensitive SUBSTRING on the raw id OR its
    // resolved human name — mirrors the real backend's `league_matches_filter`
    // (previously an exact match, so typing a human league name like
    // "Allsvenskan" returned 0 rows even though the underlying id resolves to it).
    const leagueNeedleLower = leagueNeedle.toLowerCase();
    const matchesLeague = (lid: string): boolean =>
      !leagueNeedleLower ||
      lid.toLowerCase().includes(leagueNeedleLower) ||
      (LEAGUE_DISPLAY_NAMES[lid]?.toLowerCase().includes(leagueNeedleLower) ?? false);
    const matchesTeam = (fx: MockFixtureRow): boolean =>
      !teamNeedle ||
      [fx.home_team_name, fx.away_team_name, fx.home_team_id, fx.away_team_id].some((v) =>
        String(v).toLowerCase().includes(teamNeedle),
      );
    const inDayRange = (day: string): boolean => (!startDay || day >= startDay) && (!endDay || day <= endDay);

    const filteredLeagues: Record<string, Record<string, MockFixtureRow[]>> = {};
    for (const [lid, byDay] of Object.entries(allLeagues)) {
      if (!matchesLeague(lid)) {
        continue;
      }
      for (const [day, fixtures] of Object.entries(byDay)) {
        if (!inDayRange(day)) {
          continue;
        }
        const kept = fixtures.filter(matchesTeam);
        if (kept.length > 0) {
          (filteredLeagues[lid] ??= {})[day] = kept;
        }
      }
    }
    const leagueNames: Record<string, string> = {};
    for (const lid of Object.keys(filteredLeagues)) {
      const name = LEAGUE_DISPLAY_NAMES[lid];
      if (name) {
        leagueNames[lid] = name;
      }
    }
    return json({ leagues: filteredLeagues, league_names: leagueNames, mock: true });
  }
  // F9 (2026-07-18) — flat "next N days" upcoming-fixtures mock, sibling to
  // ``/api/fixtures/browse`` above. Self-contained (a couple of duplicated
  // rows rather than sharing ``allLeagues``, which is block-scoped to the
  // browse handler above) — same convention as that handler's local
  // ``MockFixtureRow`` type (module docstring: avoid a circular import back
  // into ../api/client). Includes a non-EPL league (Allsvenskan's numeric
  // catalogue id) so the human-name substring filter has something to prove.
  if (path.startsWith("/api/fixtures/upcoming")) {
    // Structural local mirror of the client's ``UpcomingFixture`` — declared
    // here (not shared with the browse block's ``MockFixtureRow`` above,
    // which is block-scoped to that ``if``) for the same self-containment
    // reason documented on that type.
    type MockUpcomingRow = {
      fixture_id: string;
      kickoff_utc: string;
      league_id: string;
      home_team_id: string;
      away_team_id: string;
      home_team_name: string;
      away_team_name: string;
      venue_id: string;
      venue_name: string;
      status: string;
      round: string;
    };
    const upcomingQs = new URLSearchParams(path.split("?")[1] ?? "");
    const upcomingLeagueNeedle = (upcomingQs.get("league_id") ?? "").trim().toLowerCase();
    const UPCOMING_LEAGUE_DISPLAY_NAMES: Record<string, string> = {
      EPL: "English Premier League",
      "113": "Allsvenskan",
    };
    const allUpcoming: MockUpcomingRow[] = [
      {
        fixture_id: "epl-1001",
        kickoff_utc: "2026-07-16T15:00:00+00:00",
        league_id: "EPL",
        home_team_id: "t-ars",
        away_team_id: "t-che",
        home_team_name: "Arsenal",
        away_team_name: "Chelsea",
        venue_id: "v-emi",
        venue_name: "Emirates Stadium",
        status: "NS",
        round: "Regular Season - 1",
      },
      {
        fixture_id: "swe-3001",
        kickoff_utc: "2026-07-19T17:00:00+00:00",
        league_id: "113",
        home_team_id: "t-mff",
        away_team_id: "t-aik",
        home_team_name: "Malmo FF",
        away_team_name: "AIK",
        venue_id: "v-eleda",
        venue_name: "Eleda Stadion",
        status: "NS",
        round: "Round 20",
      },
    ];
    const upcomingMatchesLeague = (lid: string): boolean =>
      !upcomingLeagueNeedle ||
      lid.toLowerCase().includes(upcomingLeagueNeedle) ||
      (UPCOMING_LEAGUE_DISPLAY_NAMES[lid]?.toLowerCase().includes(upcomingLeagueNeedle) ?? false);
    const filteredUpcoming = allUpcoming.filter((fx) => upcomingMatchesLeague(fx.league_id));
    const upcomingLeagueNames: Record<string, string> = {};
    for (const fx of filteredUpcoming) {
      const name = UPCOMING_LEAGUE_DISPLAY_NAMES[fx.league_id];
      if (name) {
        upcomingLeagueNames[fx.league_id] = name;
      }
    }
    return json({ fixtures: filteredUpcoming, league_names: upcomingLeagueNames, mock: true });
  }
  if (path.startsWith("/api/instruments/upcoming-expiries")) {
    const params = new URL(url, "http://mock").searchParams;
    const limit = Number(params.get("limit") ?? 50);
    const offset = Number(params.get("offset") ?? 0);
    const allExpiries = [
      {
        instrument_id: "CME-ESU6",
        instrument_type: "FUTURE",
        asset_group: "tradfi",
        venue: "CME",
        chain: "",
        base_asset: "ES",
        raw_symbol: "ESU6",
        available_from: "2026-06-01",
        available_to: "2026-09-19",
        mvp: true,
        available_from_is_venue_first_day: false,
      },
      {
        instrument_id: "DERIBIT-BTC-26SEP26-100000-C",
        instrument_type: "OPTION",
        asset_group: "cefi",
        venue: "DERIBIT",
        chain: "",
        base_asset: "BTC",
        raw_symbol: "BTC-26SEP26-100000-C",
        available_from: "2026-06-15",
        available_to: "2026-09-26",
        mvp: false,
        available_from_is_venue_first_day: false,
      },
    ];
    return json({
      upcoming_expiries: allExpiries.slice(offset, offset + limit),
      total_count: allExpiries.length,
      limit,
      offset,
      has_more: offset + limit < allExpiries.length,
      mock: true,
    });
  }
  // P3 prediction-catalogue browser — plan
  // data_status_page_ux_and_canonicalisation_2026_07_16 P3. Representative
  // rows across every ``PredictionMarketCategory`` so the category <select> +
  // cqg sub-filter + search have something real to narrow in mock mode.
  // Mirrors the real ``PredictionCatalogueRow`` shape (deployment-api
  // routes/prediction_catalogue.py / services/prediction_catalogue.py).
  if (path.startsWith("/api/data-status/prediction-catalogue")) {
    const params = new URL(url, "http://mock").searchParams;
    const category = params.get("category")?.trim().toLowerCase() || "";
    const cqg = params.get("canonical_question_group")?.trim() || "";
    const venue = params.get("venue")?.trim().toUpperCase() || "";
    const search = params.get("search")?.trim().toLowerCase() || "";
    const limit = Number(params.get("limit") ?? 50);
    const offset = Number(params.get("offset") ?? 0);

    const allRows = [
      {
        instrument_id: "POLYMARKET-BITCOIN-UP-OR-DOWN-JUNE-24-2026",
        instrument_type: "PREDICTION_MARKET",
        venue: "POLYMARKET",
        label: "bitcoin-up-or-down-june-24-2026",
        canonical_question_group: "crypto-price-prediction",
        category: "crypto",
        underlying: "BTC",
        available_from: "2026-06-01",
        available_to: "2026-06-24",
        mvp: true,
      },
      {
        instrument_id: "KALSHI-ETH-PRICE-EOD-JUL16",
        instrument_type: "PREDICTION_MARKET",
        venue: "KALSHI",
        label: "eth-price-above-4000-eod-july-16-2026",
        canonical_question_group: "crypto-price-prediction",
        category: "crypto",
        underlying: "ETH",
        available_from: "2026-07-01",
        available_to: "2026-07-16",
        mvp: true,
      },
      {
        instrument_id: "KALSHI-FED-RATE-DECISION-JUL2026",
        instrument_type: "PREDICTION_MARKET",
        venue: "KALSHI",
        label: "fed-funds-rate-decision-july-2026",
        canonical_question_group: "fed-rate-decisions",
        category: "financial",
        underlying: "FED_FUNDS_RATE",
        available_from: "2026-06-10",
        available_to: "2026-07-30",
        mvp: false,
      },
      {
        instrument_id: "POLYMARKET-NBA-FINALS-2026-WINNER",
        instrument_type: "PREDICTION_MARKET",
        venue: "POLYMARKET",
        label: "nba-finals-2026-winner",
        canonical_question_group: "sports-championship-winner",
        category: "sports",
        underlying: "NBA_FINALS",
        available_from: "2026-04-01",
        available_to: "2026-06-20",
        mvp: false,
      },
      {
        instrument_id: "KALSHI-NYC-HIGH-TEMP-JUL16",
        instrument_type: "PREDICTION_MARKET",
        venue: "KALSHI",
        label: "nyc-high-temp-above-95f-july-16-2026",
        canonical_question_group: "weather-temperature-threshold",
        category: "weather",
        underlying: "NYC_TEMP",
        available_from: "2026-07-15",
        available_to: "2026-07-16",
        mvp: false,
      },
      {
        instrument_id: "POLYMARKET-OSCARS-2027-BEST-PICTURE",
        instrument_type: "PREDICTION_MARKET",
        venue: "POLYMARKET",
        label: "oscars-2027-best-picture-winner",
        canonical_question_group: "entertainment-awards-winner",
        category: "entertainment",
        underlying: "OSCARS_BEST_PICTURE",
        available_from: "2026-06-01",
        available_to: "2027-03-01",
        mvp: false,
      },
      {
        instrument_id: "POLYMARKET-2026-MIDTERM-SENATE-CONTROL",
        instrument_type: "PREDICTION_MARKET",
        venue: "POLYMARKET",
        label: "2026-midterm-senate-control",
        canonical_question_group: "election-outcome",
        category: "politics",
        underlying: "US_SENATE",
        available_from: "2026-01-01",
        available_to: "2026-11-03",
        mvp: true,
      },
      {
        instrument_id: "KALSHI-MISC-OTHER-EVENT-42",
        instrument_type: "PREDICTION_MARKET",
        venue: "KALSHI",
        label: "instrument-id-fallback-example-42",
        canonical_question_group: "other-misc",
        category: "other",
        underlying: "OTHER",
        available_from: "2026-05-01",
        available_to: "2026-08-01",
        mvp: false,
      },
    ];

    const categoryCounts: Record<string, number> = {};
    const cqgCounts: Record<string, number> = {};
    for (const row of allRows) {
      categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1;
      cqgCounts[row.canonical_question_group] = (cqgCounts[row.canonical_question_group] ?? 0) + 1;
    }

    const filtered = allRows.filter((row) => {
      if (category && row.category !== category) return false;
      if (cqg && row.canonical_question_group !== cqg) return false;
      if (venue && row.venue !== venue) return false;
      if (search && !row.label.toLowerCase().includes(search) && !row.instrument_id.toLowerCase().includes(search)) {
        return false;
      }
      return true;
    });

    return json({
      rows: filtered.slice(offset, offset + limit),
      total: filtered.length,
      category_counts: categoryCounts,
      cqg_counts: cqgCounts,
      mock: true,
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
          source: "SUB_ACCOUNT_DYDX",
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
        { source: "SUB_ACCOUNT_DYDX", nav_usd: "100000.00", is_reachable: true },
      ],
    });
  }

  // Client subscriptions (SLA tier / isolation) moved to unified-trading-system-ui
  // (`services/manage/subscriptions`) per the dual-cut cleanup 2026-06-12 — its mock
  // lives there now. The deployment-api `/subscriptions` backend is unchanged.

  // ─── Chaos injections (Phase 4b — controlled fault injection) ───
  if (path.startsWith("/api/chaos/injections")) {
    const idMatch = path.match(/^\/api\/chaos\/injections\/([^/?]+)$/);
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
    // Real backend shape is the `{injections: [...]}` envelope (not a bare array) — match it
    // so the smoke exercises the client's unwrap path (guards the Chaos-tab crash regression).
    return json({
      injections: [
        _mockChaosInjection("chaos-venue-latency-001", "venue_latency", "execution-service", "staging"),
        _mockChaosInjection("chaos-rpc-timeout-002", "rpc_timeout", "market-tick-data-service", "paper"),
      ],
    });
  }

  // Stopped/orphaned-VM inventory — GET /api/fleet/orphans → OrphanInventoryResponse.
  // One reapable ephemeral, one within-grace, one paused-live, one keep-labelled. grace_hours-aware
  // (mirrors deployment-api's real `_verdict()` gate) so the operator-adjustable min-age input has
  // something real to assert against: only "reap"/"keep_within_grace" baseline entries are
  // grace-gated — "keep_not_ephemeral"/"keep_retained" never flip regardless of grace_hours.
  if (path === "/api/fleet/orphans") {
    const graceHoursParam = _mockGraceHoursFromUrl(url, 24);
    const baseOrphans = [
      {
        name: "cefi-binance-spot-20260601",
        zone: "asia-northeast1-c",
        status: "TERMINATED",
        lifecycle_class: "EPHEMERAL_BATCH",
        stopped_age_hours: 120,
        boot_disk_gb: 50,
        boot_disk_type: "pd-standard",
        monthly_disk_usd: 2.6,
        graceGated: true,
      },
      {
        name: "tradfi-databento-recent",
        zone: "asia-northeast1-c",
        status: "STOPPED",
        lifecycle_class: "EPHEMERAL_BATCH",
        stopped_age_hours: 2,
        boot_disk_gb: 50,
        boot_disk_type: "pd-standard",
        monthly_disk_usd: 2.6,
        graceGated: true,
      },
      {
        // 3min-old — proves the UI's client-side MIN_REAP_GRACE_MINUTES (10) floor actually holds:
        // a literal grace_hours=0.0167 (1min, unclamped) would also catch this one (reapable=3);
        // clamped to the 10min floor it correctly stays within-grace (reapable=2).
        name: "just-stopped-vm-20260722",
        zone: "asia-northeast1-c",
        status: "STOPPED",
        lifecycle_class: "EPHEMERAL_BATCH",
        stopped_age_hours: 0.05,
        boot_disk_gb: 25,
        boot_disk_type: "pd-standard",
        monthly_disk_usd: 1.3,
        graceGated: true,
      },
      {
        name: "strategy-live-eth-20260601",
        zone: "asia-northeast1-c",
        status: "TERMINATED",
        lifecycle_class: "LONG_LIVED_LIVE",
        stopped_age_hours: 240,
        boot_disk_gb: 50,
        boot_disk_type: "pd-ssd",
        monthly_disk_usd: 11.05,
        graceGated: false,
        verdict: "keep_not_ephemeral" as const,
      },
      {
        name: "cefi-keepme-20260601",
        zone: "asia-northeast1-c",
        status: "TERMINATED",
        lifecycle_class: "EPHEMERAL_BATCH",
        stopped_age_hours: 240,
        boot_disk_gb: 50,
        boot_disk_type: "pd-standard",
        monthly_disk_usd: 2.6,
        graceGated: false,
        verdict: "keep_retained" as const,
      },
    ];
    const orphans = baseOrphans.map(({ graceGated, verdict, ...rest }) => {
      const reapable = graceGated ? rest.stopped_age_hours >= graceHoursParam : false;
      return {
        ...rest,
        cost_incurred_usd: _mockCostIncurredUsd(rest.monthly_disk_usd, rest.stopped_age_hours),
        reapable,
        verdict: graceGated ? (reapable ? "reap" : "keep_within_grace") : (verdict ?? "keep_not_ephemeral"),
      };
    });
    const reapableOrphans = orphans.filter((o) => o.reapable);
    return json({
      generated_at: "2026-06-30T09:00:00+00:00",
      grace_hours: graceHoursParam,
      stopped_total: orphans.length,
      reapable_total: reapableOrphans.length,
      monthly_idle_usd: Math.round(orphans.reduce((sum, o) => sum + o.monthly_disk_usd, 0) * 100) / 100,
      monthly_reapable_usd: Math.round(reapableOrphans.reduce((sum, o) => sum + o.monthly_disk_usd, 0) * 100) / 100,
      total_idle_cost_incurred_usd: Math.round(orphans.reduce((sum, o) => sum + o.cost_incurred_usd, 0) * 100) / 100,
      total_reapable_cost_incurred_usd:
        Math.round(reapableOrphans.reduce((sum, o) => sum + o.cost_incurred_usd, 0) * 100) / 100,
      orphans,
    });
  }
  // Reap orphans — POST /api/fleet/reap (dry-run by default) → ReapResponse. Same grace_hours-aware
  // candidate set as GET /api/fleet/orphans above, read from the request body instead of the query string.
  if (path === "/api/fleet/reap" && method === "POST") {
    let dryRun = true;
    let graceHoursParam = 24;
    try {
      const body = init?.body ? (JSON.parse(String(init.body)) as { dry_run?: boolean; grace_hours?: number }) : {};
      dryRun = body.dry_run ?? true;
      graceHoursParam = typeof body.grace_hours === "number" ? body.grace_hours : 24;
    } catch {
      dryRun = true;
    }
    const graceGatedCandidates = [
      { name: "cefi-binance-spot-20260601", zone: "asia-northeast1-c", monthly_disk_usd: 2.6, stopped_age_hours: 120 },
      { name: "tradfi-databento-recent", zone: "asia-northeast1-c", monthly_disk_usd: 2.6, stopped_age_hours: 2 },
      { name: "just-stopped-vm-20260722", zone: "asia-northeast1-c", monthly_disk_usd: 1.3, stopped_age_hours: 0.05 },
    ];
    const candidates = graceGatedCandidates.filter((c) => c.stopped_age_hours >= graceHoursParam);
    const results = candidates.map(({ stopped_age_hours: _stopped_age_hours, ...c }) => ({
      ...c,
      deleted: !dryRun,
    }));
    return json({
      dry_run: dryRun,
      grace_hours: graceHoursParam,
      candidate_total: candidates.length,
      reaped_total: dryRun ? 0 : candidates.length,
      monthly_reclaimed_usd: dryRun
        ? 0
        : Math.round(candidates.reduce((s, c) => s + c.monthly_disk_usd, 0) * 100) / 100,
      results,
    });
  }
  // Delete a single stopped instance — DELETE /api/fleet/instances/{name}?zone=… → DeleteInstanceResponse.
  const fleetDeleteMatch = path.match(/^\/api\/fleet\/instances\/([^/]+)$/);
  if (fleetDeleteMatch && method === "DELETE") {
    return json({ name: decodeURIComponent(fleetDeleteMatch[1]), zone: "asia-northeast1-c", deleted: true });
  }
  // VM operator controls — POST /api/vm/admin/{vm}/(pause|resume|cancel) → AdminActionResult (202).
  const vmAdminMatch = path.match(/^\/api\/vm\/admin\/([^/]+)\/(pause|resume|cancel)$/);
  if (vmAdminMatch && method === "POST") {
    const action = vmAdminMatch[2];
    const status = action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "running";
    return json(
      { action, status, message: `VM '${decodeURIComponent(vmAdminMatch[1])}' ${action} accepted (mock).` },
      202,
    );
  }
  // Per-fixture coverage drilldown for one (day, league_id) — powers
  // `<FixtureBreakdown>`, both the pre-existing per-league date-badge drill
  // and the symbol-search click-through's day panel. Pre-existing gap: no
  // handler existed for this path at all, so it fell through to the generic
  // `/api/data-status/*` fallback below (the big turbo MOCK_DATA_STATUS
  // payload, which has no `fixtures` field) — `FixtureBreakdown` then threw
  // reading `data.fixtures.length`, crashing the whole Data Status tab's
  // ErrorBoundary the first time ANY league/day breakdown was expanded in
  // mock mode. A few representative fixtures spanning every coverage state
  // across the real `_FIXTURE_ENTITIES` set (deployment-api
  // data_status_drilldown/_fixtures_pools.py) so the drilldown has
  // something real to render.
  if (path === "/api/data-status/fixtures/breakdown") {
    const qp = new URL(url, "http://mock").searchParams;
    const day = qp.get("day") ?? "2026-01-01";
    const league_id = qp.get("league_id") ?? "EPL";
    const entities = [
      "FIXTURES",
      "FIXTURE_STATS",
      "FIXTURE_LINEUPS",
      "FIXTURE_EVENTS",
      "PLAYER_STATS",
      "INJURIES",
      "XG",
      "WEATHER",
    ];
    const coverageStates = ["captured", "captured", "empty_confirmed", "missing"] as const;
    const teams: Array<[string, string]> = [
      ["Arsenal", "Chelsea"],
      ["Liverpool", "Man City"],
      ["Spurs", "Newcastle"],
    ];
    const fixtures = teams.map(([home, away], i) => {
      const coverage: Record<string, (typeof coverageStates)[number]> = {};
      entities.forEach((entity, j) => {
        coverage[entity] = coverageStates[(i + j) % coverageStates.length];
      });
      const summary = { captured: 0, empty_confirmed: 0, missing: 0, failed: 0 };
      Object.values(coverage).forEach((s) => {
        summary[s] += 1;
      });
      return {
        fixture_id: `${league_id.toLowerCase()}-${day}-${i + 1}`,
        kickoff_utc: `${day}T15:00:00+00:00`,
        home_team_name: home,
        away_team_name: away,
        status: "FT",
        venue_id: `v-${i + 1}`,
        coverage,
        coverage_summary: summary,
      };
    });
    return json({
      day,
      league_id,
      af_league_id: 39,
      fixtures_expected: fixtures.length,
      fixtures,
      status: "resolved",
    });
  }
  // Generic /api/data-status/* fallback (the turbo coverage-summary shape) —
  // MUST be the last data-status check in this function. Every specific
  // /api/data-status/<endpoint> handler above (catalogue, prediction-catalogue,
  // instruments-for-shard, honest-coverage, turbo, manifest, venue-filters,
  // list-files, download-catalogue-csv, instruments, instrument-availability,
  // ...) needs to match FIRST; this used to sit near the top of the function
  // (pre-dating most of those routes, added 2026-06-16) and silently shadowed
  // every one of them for over a month — any /api/data-status/<anything> request
  // matched this regex before reaching its own specific handler further down,
  // so those endpoints always got the big turbo MOCK_DATA_STATUS payload instead
  // of their own real response shape (found 2026-07-17 while browser-verifying
  // the Catalogue Explorer — it silently returned {asset_groups: {...}} instead
  // of {instruments: [...], total_count, label, ...}). Keep this LAST.
  if (path.match(/^\/api\/data-status/)) {
    return json(MOCK_DATA_STATUS);
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
