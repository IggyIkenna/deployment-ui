import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * instruments-service data-status mock fixtures (plan
 * data_status_page_ux_and_canonicalisation_2026_07_16, C1/P3 follow-up).
 *
 * These assertions deliberately go through the REAL mock router
 * (`installDeploymentMockHandlers` -> `window.fetch`) rather than importing the
 * fixture objects directly. That is the whole point: a catch-all
 * `/api/data-status` handler silently shadowed every specific data-status
 * handler for a month (fixed in deployment-ui@0c817d2) and **no component test
 * caught it**, because they all `vi.mock` their client function and never touch
 * the dispatcher. Asserting through the router is what makes these fixtures
 * trustworthy — and pins the routing fix against regression.
 */
describe("mock-api — instruments-service data-status fixtures", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_MOCK_API", "true");
    vi.stubGlobal("window", {
      fetch: vi.fn(),
      location: { origin: "http://localhost:5173" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function install() {
    const { installDeploymentMockHandlers } = await import("./mock-api");
    installDeploymentMockHandlers(true);
  }

  it("shard-axis-matrix carries instruments-service axes matching the UAC SSOT", async () => {
    await install();
    const body = await (await window.fetch("/api/config/shard-axis-matrix")).json();

    // Verbatim from unified_api_contracts/registry/data_status_axis_matrix.py.
    expect(body.shard_axes["instruments-service"]).toEqual({
      cefi: ["venue"],
      tradfi: ["venue"],
      defi: ["venue", "chain"],
      sports: ["data_type", "league_id"],
      prediction: ["venue", "canonical_question_group"],
    });
    // BREAKDOWN_AXES — what gates BreakdownsAccordion mounting (P4-A).
    expect(body.breakdown_axes["instruments-service"].cefi).toEqual(["instrument_type", "data_type"]);
    expect(body.breakdown_axes["instruments-service"].sports).toEqual(["source"]);
    // The pre-existing MTDS entry must survive.
    expect(body.shard_axes["market-tick-data-service"].prediction).toBeTruthy();
  });

  it("P5: IS cefi/tradfi/defi axes are a subset of {venue, chain}; sports/prediction are not", async () => {
    await install();
    const body = await (await window.fetch("/api/config/shard-axis-matrix")).json();
    const axes = body.shard_axes["instruments-service"];
    const subsetOfVenueChain = (a: string[]) => a.every((x) => x === "venue" || x === "chain");

    // This is exactly the predicate isHierarchicalDrilldownRedundant applies —
    // so mock mode can now genuinely exercise the P5 suppression both ways.
    expect(subsetOfVenueChain(axes.cefi)).toBe(true);
    expect(subsetOfVenueChain(axes.tradfi)).toBe(true);
    expect(subsetOfVenueChain(axes.defi)).toBe(true);
    expect(subsetOfVenueChain(axes.sports)).toBe(false);
    expect(subsetOfVenueChain(axes.prediction)).toBe(false);
  });

  it("coverage-summary is service-aware and returns real IS asset groups", async () => {
    await install();
    const body = await (await window.fetch("/api/data-status/coverage-summary?service=instruments-service")).json();

    expect(body.service).toBe("instruments-service");
    // Previously this returned a single PREDICTION entry for ANY service, so no
    // cefi/tradfi/defi card ever rendered on the IS page in mock mode.
    expect(Object.keys(body.asset_groups).sort()).toEqual(["CEFI", "DEFI", "PREDICTION", "SPORTS", "TRADFI"]);
  });

  it("coverage-summary still serves the MTDS prediction shape for other services", async () => {
    await install();
    const body = await (
      await window.fetch("/api/data-status/coverage-summary?service=market-tick-data-service")
    ).json();
    expect(body.service).toBe("market-tick-data-service");
    expect(Object.keys(body.asset_groups)).toEqual(["PREDICTION"]);
  });

  it("P4-A: IS cefi instrument_type mixes canonical, legacy-lowercase and the blank sentinel", async () => {
    await install();
    const body = await (await window.fetch("/api/data-status/coverage-summary?service=instruments-service")).json();
    const itype = body.asset_groups.CEFI.breakdowns.instrument_type;

    // canonicalInstrumentTypeLabel maps spot -> SPOT_PAIR / perpetual -> PERPETUAL;
    // __legacy__ must render "(unlabeled)" on a NON-job_id axis. All three shapes
    // need to be present or the accordion's label logic isn't exercised at all.
    expect(itype.SPOT_PAIR).toBeGreaterThan(0);
    expect(itype.spot).toBeGreaterThan(0);
    expect(itype.perpetual).toBeGreaterThan(0);
    expect(itype.__legacy__).toBeGreaterThan(0);
  });

  it("P7: chains are a DEFI-only sub-dimension — cefi renders venue-only", async () => {
    await install();
    const body = await (await window.fetch("/api/data-status/coverage-summary?service=instruments-service")).json();

    expect(body.asset_groups.DEFI.extras.chains).toBeTruthy();
    expect(Object.keys(body.asset_groups.DEFI.extras.chains).length).toBeGreaterThan(0);
    // The bug P7 fixed: cefi manufacturing SOLANA/ZKSYNC chain sub-rows.
    expect(body.asset_groups.CEFI.extras?.chains).toBeUndefined();
    expect(body.asset_groups.TRADFI.extras?.chains).toBeUndefined();
  });
});
