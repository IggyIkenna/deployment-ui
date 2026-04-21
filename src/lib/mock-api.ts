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
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T14:00:00Z",
  },
  {
    name: "corporate-actions",
    layer: 1,
    category: "data",
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-08T10:00:00Z",
  },
  {
    name: "market-tick-data-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["category", "venue", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T16:00:00Z",
  },
  {
    name: "market-data-processing-service",
    layer: 2,
    category: "ingestion",
    dimensions: ["category", "venue", "date"],
    status: "warning",
    lastDeployed: "2026-03-07T12:00:00Z",
  },
  {
    name: "features-calendar-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:00:00Z",
  },
  {
    name: "features-delta-one-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:30:00Z",
  },
  {
    name: "features-volatility-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "feature_group", "date"],
    status: "healthy",
    lastDeployed: "2026-03-09T18:45:00Z",
  },
  {
    name: "features-onchain-service",
    layer: 3,
    category: "features",
    dimensions: ["category", "feature_group", "date"],
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

const MOCK_CATEGORIES = [
  "equity",
  "crypto",
  "fx",
  "rates",
  "commodity",
  "sports",
];

const MOCK_VENUES_BY_CATEGORY: Record<string, string[]> = {
  equity: ["NYSE", "NASDAQ", "LSE", "TSE", "HKEX"],
  crypto: ["Binance", "OKX", "Bybit", "Kraken", "Coinbase"],
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
// object that carried no `categories`, which meant the full Phase-C UI
// surface never rendered in local dev / Playwright audits.
//
// Seed is deterministic: PREDICTION has high attempt / low capture (event-
// driven), CEFI/TRADFI/DEFI are dense ~99%, and every category carries
// at least one attempted_failed row in its first venue so the failures
// filter + retry affordance are both exercised.
function _mkVenue(
  dates_expected: number,
  captured: number,
  empty: number,
  failed: number,
) {
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
    completion_pct: Math.min(
      Math.round((captured / denom) * 10000) / 100,
      100,
    ),
    venue_start_date: "2024-01-01",
    capture_status_counts: {
      captured,
      empty_confirmed: empty,
      attempted_failed: failed,
    },
    attempt_coverage_pct: Math.min(
      Math.round((attempted / denom) * 10000) / 100,
      100,
    ),
    capture_coverage_pct: Math.min(
      Math.round((captured / denom) * 10000) / 100,
      100,
    ),
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
  const attemptPct = Math.min(
    Math.round((attempted / denom) * 10000) / 100,
    100,
  );
  const emptyRate =
    attempted > 0
      ? Math.round((empty / attemptedDenom) * 10000) / 10000
      : null;
  const failureRate = Math.round((failed / attemptedDenom) * 10000) / 10000;

  const perVenueExpected = Math.max(1, Math.floor(dates_expected / venues.length));
  let remainingFailed = failed;
  let remainingEmpty = empty;
  let remainingCaptured = captured;
  const venuesDict: Record<string, ReturnType<typeof _mkVenue>> = {};
  const failureRateByDim: Record<
    string,
    { failure_rate: number; attempted_failed_count: number }
  > = {};
  venues.forEach((v, idx) => {
    const vFailed = idx === 0 ? remainingFailed : 0;
    const split = Math.max(1, venues.length - idx);
    const vEmpty = remainingEmpty > 0 ? Math.floor(remainingEmpty / split) : 0;
    const vCaptured =
      remainingCaptured > 0 ? Math.floor(remainingCaptured / split) : 0;
    remainingFailed -= vFailed;
    remainingEmpty -= vEmpty;
    remainingCaptured -= vCaptured;
    venuesDict[v] = _mkVenue(perVenueExpected, vCaptured, vEmpty, vFailed);
    if (vFailed > 0) {
      const vAttempted = vCaptured + vEmpty + vFailed;
      failureRateByDim[v] = {
        failure_rate:
          Math.round((vFailed / Math.max(1, vAttempted)) * 10000) / 10000,
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
    },
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
  const fixturesPct =
    Math.round((fixturesFound / fixturesExpected) * 10000) / 100;

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
    },
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
      const capturedInstruments = expected_instruments.filter(
        (iid) => !missing_instruments.includes(iid),
      );
      const perInstrumentFound = Math.max(0, windowDays - 2);
      const found = capturedInstruments.length * perInstrumentFound;
      const missing = Math.max(0, expected - found);
      const pct =
        expected === 0
          ? 0
          : Math.min(Math.round((found / expected) * 10000) / 100, 100);
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
          { found_shards: number; expected_shards: number; completion_pct: number; missing_dates?: string[] }
        > = {};
        for (const iid of expected_instruments) {
          const iFound = missing_instruments.includes(iid) ? 0 : perInstrumentFound;
          const iPct =
            windowDays === 0
              ? 0
              : Math.min(Math.round((iFound / windowDays) * 10000) / 100, 100);
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
    const found = missingDataTypes.includes(dt)
      ? 0
      : Math.max(0, windowDays - 2);
    const missing = Math.max(0, expected - found);
    honest[dt] = {
      expected_shards: expected,
      found_shards: found,
      missing_shards: missing,
      completion_pct:
        expected === 0
          ? 0
          : Math.min(Math.round((found / expected) * 10000) / 100, 100),
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
  const base = _mkCategory("CEFI", "dense", 120, 118, 1, 1, [
    "BINANCE-SPOT",
    "BINANCE-FUTURES",
    "DERIBIT",
  ]);
  const venuesDict = base.venues as Record<string, ReturnType<typeof _mkVenue>>;
  const HONEST_AXIS = "per_venue_per_data_type_per_day";
  // BINANCE-SPOT — all declared dts captured (no missing).
  venuesDict["BINANCE-SPOT"] = {
    ...venuesDict["BINANCE-SPOT"],
    ..._mkMtdsHonest(
      ["trades", "orderbook_snapshot_1s", "ticker"],
      [],
      120,
      HONEST_AXIS,
    ),
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
 * seeded UAC instrument-ref for DEFI protocols, so UNISWAPV3-ETHEREUM now
 * declares 20 dex_pools and AAVEV3-ETHEREUM declares 10 lending_indices
 * instruments.  The 20-pool universe sits exactly at the aggregator's
 * `per_instrument` budget threshold (< 20) so it is intentionally
 * emitted WITHOUT a `per_instrument` dict — mirroring the live aggregator
 * behaviour and letting the UI exercise the "large universe" branch.
 */
function _mkDefiMtdsHonest(): ReturnType<typeof _mkCategory> {
  const base = _mkCategory("DEFI", "dense", 110, 102, 5, 3, [
    "UNISWAPV3-ETHEREUM",
    "AAVEV3-ETHEREUM",
  ]);
  const venuesDict = base.venues as Record<string, ReturnType<typeof _mkVenue>>;
  const HONEST_AXIS = "per_venue_per_data_type_per_day";
  const uniPools = Array.from({ length: 20 }, (_v, i) => `POOL-${String(i + 1).padStart(2, "0")}`);
  const aaveIndices = Array.from({ length: 10 }, (_v, i) => `IDX-${String(i + 1).padStart(2, "0")}`);
  venuesDict["UNISWAPV3-ETHEREUM"] = {
    ...venuesDict["UNISWAPV3-ETHEREUM"],
    ..._mkMtdsHonest(
      ["dex_pools"],
      [],
      90,
      HONEST_AXIS,
      {
        perInstrumentDataTypes: {
          // 20-element universe — hits the aggregator's "<20" gate, so
          // per_instrument is intentionally omitted to mirror live shape.
          dex_pools: {
            expected_instruments: uniPools,
            missing_instruments: uniPools.slice(17), // last 3 missing
          },
        },
      },
    ),
  } as ReturnType<typeof _mkVenue>;
  venuesDict["AAVEV3-ETHEREUM"] = {
    ...venuesDict["AAVEV3-ETHEREUM"],
    ..._mkMtdsHonest(
      ["lending_indices"],
      [],
      90,
      HONEST_AXIS,
      {
        perInstrumentDataTypes: {
          // 10-element universe — under the <20 budget, so per_instrument
          // detail is populated.
          lending_indices: {
            expected_instruments: aaveIndices,
            missing_instruments: [aaveIndices[3], aaveIndices[7]],
          },
        },
      },
    ),
  } as ReturnType<typeof _mkVenue>;
  return base;
}

const _MOCK_CATS = {
  CEFI: _mkCefiMtdsHonest(),
  TRADFI: _mkCategory("TRADFI", "dense", 100, 97, 2, 1, [
    "DATABENTO-DBEQ",
    "DATABENTO-GLBX",
  ]),
  DEFI: _mkDefiMtdsHonest(),
  // SPORTS uses the new `breakdown_axis: "data_type"` shape (2026-04-20).
  // Drilldown lives under `data_types`, not `venues`.
  SPORTS: _mkSportsByDataType(),
  PREDICTION: _mkCategory("PREDICTION", "event_driven", 800, 185, 550, 65, [
    "POLYMARKET",
  ]),
};

const _MOCK_TOTAL_EXPECTED = Object.values(_MOCK_CATS).reduce(
  (acc, c) => acc + c.dates_expected,
  0,
);
const _MOCK_TOTAL_CAPTURED = Object.values(_MOCK_CATS).reduce(
  (acc, c) => acc + c.dates_found,
  0,
);

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
  categories: _MOCK_CATS,
  mock: true,
};

const MOCK_CHECKLIST = {
  service: "instruments-service",
  overallScore: 87,
  isBlocked: false,
  categories: [
    {
      name: "Data Coverage",
      score: 95,
      items: [
        {
          id: "c1",
          label: "Equity coverage ≥ 95%",
          status: "pass",
          detail: "98.2% complete",
        },
        {
          id: "c2",
          label: "Crypto coverage ≥ 90%",
          status: "pass",
          detail: "94.1% complete",
        },
        {
          id: "c3",
          label: "FX coverage ≥ 90%",
          status: "warn",
          detail: "88.5% complete (below 90% threshold)",
        },
      ],
    },
    {
      name: "Build Health",
      score: 100,
      items: [
        {
          id: "b1",
          label: "Latest build passing",
          status: "pass",
          detail: "Build #1847 — 2026-03-10T08:00Z",
        },
        {
          id: "b2",
          label: "No critical CVEs",
          status: "pass",
          detail: "0 critical, 2 low severity",
        },
      ],
    },
    {
      name: "Deployment Readiness",
      score: 67,
      items: [
        {
          id: "d1",
          label: "Canary deployment validated",
          status: "fail",
          detail: "No canary run in last 7 days",
        },
        {
          id: "d2",
          label: "Rollback tested",
          status: "pass",
          detail: "Rollback tested 2026-03-08",
        },
        {
          id: "d3",
          label: "Alert thresholds configured",
          status: "warn",
          detail: "P99 latency alert missing",
        },
      ],
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
      category: [
        "data",
        "ingestion",
        "features",
        "ml",
        "execution",
        "monitoring",
      ][i % 6],
      dimensions: ["category", "date"],
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

async function handleRoute(url: string, init?: RequestInit): Promise<Response> {
  await delay();
  const method = init?.method?.toUpperCase() ?? "GET";
  const path = url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/\?.*$/, "")
    .replace("/api/v1/", "/api/");

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
      if (name === "category") {
        return {
          name: "category",
          type: "fixed",
          description: "Market category",
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
    return json({ upstream: [], downstream: [], dependents: [] });
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
    const cat =
      new URL(url, "http://x").searchParams.get("category") ?? "equity";
    return json({ venues: MOCK_VENUES_BY_CATEGORY[cat] ?? [] });
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

  // Venues
  if (path.startsWith("/api/venues")) {
    return json({ categories: {}, category: "", venues: [], data_types: [] });
  }

  // Deployments
  // Phase-C retry: /deployments/deploy-missing gets POSTed from the
  // drill-down retry button. Return a deployment-shaped payload so the
  // UI flips the button to the "Retried ✓" state.
  if (path === "/api/deployments/deploy-missing" && method === "POST") {
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
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
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
    const newDep = {
      id: `dep-${Date.now()}`,
      service: (body.service as string | undefined) ?? "unknown",
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      shards:
        (body.shards as number | undefined) ??
        Math.floor(Math.random() * 100) + 20,
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
    const shards = parseInt(
      new URL(url, "http://x").searchParams.get("shards") ?? "50",
    );
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
  if (path.match(/^\/api\/deployments\/(.+)$/)) {
    const id = path.split("/").pop();
    const dep =
      MOCK_DEPLOYMENTS.find((d) => d.id === id) ?? MOCK_DEPLOYMENTS[0];
    return json({ deployment: dep });
  }

  // Quota (standalone endpoint)
  if (path === "/api/quota" || path.startsWith("/api/quota")) {
    const shards = parseInt(
      new URL(url, "http://x").searchParams.get("shards") ?? "50",
    );
    return json({
      ...MOCK_QUOTA,
      estimatedCost: { ...MOCK_QUOTA.estimatedCost, total: shards * 0.18 },
    });
  }

  // Data status (standalone)
  if (path.match(/^\/api\/data-status/)) {
    return json(MOCK_DATA_STATUS);
  }

  // Cloud builds
  if (
    path === "/api/cloud-builds" ||
    path === "/cloud-builds/triggers" ||
    path === "/api/cloud-builds/triggers"
  ) {
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
    const body = init?.body
      ? (JSON.parse(init.body as string) as Record<string, unknown>)
      : {};
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
  if (
    path === "/api/service-status/overview" ||
    path === "/api/services/overview"
  ) {
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
      capabilities: [
        "batch_deploy",
        "live_deploy",
        "cloud_build",
        "rollback",
        "config_browse",
      ],
      version: "0.3.0",
    });
  }
  if (path.match(/^\/api\/capabilities\/service-categories\/.+/)) {
    return json({
      categories: ["CEFI", "DEFI", "TRADFI", "SPORTS", "PREDICTION"],
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

  // Data status turbo
  if (path.startsWith("/api/data-status/turbo/cache/clear")) {
    return json({ cleared: true });
  }
  if (
    path.startsWith("/api/data-status/turbo") ||
    path.startsWith("/api/data-status/manifest")
  ) {
    return json(MOCK_DATA_STATUS);
  }
  if (path.startsWith("/api/data-status/venue-filters")) {
    return json({
      venues: ["Binance", "OKX", "Bybit", "Coinbase"],
      categories: ["crypto", "equity", "fx"],
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

  return json({ error: "Mock: no handler", path }, 404);
}

export function installDeploymentMockHandlers(enabled = MOCK_MODE) {
  if (!enabled) return;

  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (
      url.includes("/api/") ||
      url.includes("/cloud-builds/") ||
      url.includes("/service-status/")
    ) {
      return handleRoute(url, init);
    }
    return original(input, init);
  };
}
