// @vitest-environment jsdom
/**
 * Wave 8H — Phase 8 per-instrument honest-coverage fixture tests.
 *
 * Verifies that the mock-api `_mkMtdsHonest` helper (extended in Wave 8H to
 * emit `unit=shard_instrument_days` / `unit=shard_days_legacy`,
 * `expected_instruments`, `missing_instruments`, `per_instrument`,
 * `legacy_row_count`) produces fixtures matching the deployment-api Phase 8D
 * aggregator shape (commit c059e6f). The rendering code in DataStatusTab.tsx
 * consumes these fields directly, so fixture correctness is the load-bearing
 * contract for the Phase 8H UI rendering.
 *
 * Test level: mock-api fixture + TypeScript shape — exercises the same code
 * path the UI reads via `fetch('/api/data-status/turbo')`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { TurboDataStatusResponse, TurboHonestDataTypeStatus } from "../../../src/api/client";
import { installDeploymentMockHandlers } from "../../../src/lib/mock-api";

beforeAll(() => {
  installDeploymentMockHandlers(true);
});

async function fetchTurboStatus(): Promise<TurboDataStatusResponse> {
  const res = await fetch("/api/data-status/turbo");
  expect(res.ok).toBe(true);
  return (await res.json()) as TurboDataStatusResponse;
}

function getVenueHonest(
  status: TurboDataStatusResponse,
  categoryName: string,
  venueName: string,
): Record<string, TurboHonestDataTypeStatus> {
  const category = status.categories?.[categoryName];
  expect(category, `category ${categoryName} missing from fixture`).toBeTruthy();
  const venues = (category as { venues?: Record<string, { honest_data_types?: Record<string, TurboHonestDataTypeStatus> }> }).venues ?? {};
  const venue = venues[venueName];
  expect(venue, `venue ${venueName} missing from ${categoryName}`).toBeTruthy();
  expect(venue.honest_data_types, `honest_data_types missing on ${venueName}`).toBeTruthy();
  return venue.honest_data_types!;
}

describe("Wave 8H — MTDS honest-coverage per-instrument fixture", () => {
  it("BINANCE-FUTURES/derivative_ticker emits unit=shard_instrument_days with per_instrument dict", async () => {
    const status = await fetchTurboStatus();
    const honest = getVenueHonest(status, "CEFI", "BINANCE-FUTURES");
    const dt = honest["derivative_ticker"];
    expect(dt).toBeTruthy();
    expect(dt.unit).toBe("shard_instrument_days");
    expect(dt.expected_instruments).toEqual(["BTC-USDT", "ETH-USDT", "SOL-USDT"]);
    expect(dt.missing_instruments).toEqual(["SOL-USDT"]);
    // 3-instrument universe < 20 → per_instrument MUST be populated.
    expect(dt.per_instrument).toBeTruthy();
    expect(Object.keys(dt.per_instrument!).sort()).toEqual([
      "BTC-USDT",
      "ETH-USDT",
      "SOL-USDT",
    ]);
    // SOL-USDT is missing → found=0, completion=0.
    expect(dt.per_instrument!["SOL-USDT"].found_shards).toBe(0);
    expect(dt.per_instrument!["SOL-USDT"].completion_pct).toBe(0);
    // BTC-USDT is captured → non-zero found shards.
    expect(dt.per_instrument!["BTC-USDT"].found_shards).toBeGreaterThan(0);
  });

  it("BINANCE-FUTURES/trades emits unit=shard_days_legacy with legacy_row_count and degraded instruments list", async () => {
    const status = await fetchTurboStatus();
    const honest = getVenueHonest(status, "CEFI", "BINANCE-FUTURES");
    const dt = honest["trades"];
    expect(dt).toBeTruthy();
    expect(dt.unit).toBe("shard_days_legacy");
    expect(dt.legacy_row_count).toBe(486);
    // Legacy mode: all 10 expected instruments are in missing_instruments
    // because the pre-Phase-8C manifest cannot enumerate captures.
    expect(dt.expected_instruments?.length).toBe(10);
    expect(dt.missing_instruments?.length).toBe(10);
  });

  it("BINANCE-FUTURES/liquidations stays at venue-level unit=shard_days (no per-instrument fields)", async () => {
    const status = await fetchTurboStatus();
    const honest = getVenueHonest(status, "CEFI", "BINANCE-FUTURES");
    const dt = honest["liquidations"];
    expect(dt).toBeTruthy();
    expect(dt.unit).toBe("shard_days");
    expect(dt.expected_instruments).toBeUndefined();
    expect(dt.missing_instruments).toBeUndefined();
    expect(dt.per_instrument).toBeUndefined();
    expect(dt.legacy_row_count).toBeUndefined();
  });

  it("UNISWAPV3-ETHEREUM/dex_pools emits 20 expected instruments WITHOUT per_instrument detail (universe-size budget)", async () => {
    const status = await fetchTurboStatus();
    const honest = getVenueHonest(status, "DEFI", "UNISWAPV3-ETHEREUM");
    const dt = honest["dex_pools"];
    expect(dt).toBeTruthy();
    expect(dt.unit).toBe("shard_instrument_days");
    expect(dt.expected_instruments?.length).toBe(20);
    // Aggregator budget: per_instrument only when universe < 20.
    expect(dt.per_instrument).toBeUndefined();
    // 3 of 20 pools missing per fixture.
    expect(dt.missing_instruments?.length).toBe(3);
  });

  it("AAVEV3-ETHEREUM/lending_indices emits 10 expected instruments WITH per_instrument detail (universe-size < 20)", async () => {
    const status = await fetchTurboStatus();
    const honest = getVenueHonest(status, "DEFI", "AAVEV3-ETHEREUM");
    const dt = honest["lending_indices"];
    expect(dt).toBeTruthy();
    expect(dt.unit).toBe("shard_instrument_days");
    expect(dt.expected_instruments?.length).toBe(10);
    // 10-element universe < 20 → per_instrument IS populated.
    expect(dt.per_instrument).toBeTruthy();
    expect(Object.keys(dt.per_instrument!).length).toBe(10);
    // 2 indices missing per fixture.
    expect(dt.missing_instruments?.length).toBe(2);
  });
});
