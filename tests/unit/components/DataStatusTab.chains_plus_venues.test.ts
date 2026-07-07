// @vitest-environment jsdom
/**
 * Regression guard — CEFI Asset-group-breakdown card silently dropped 22 of
 * 24 venues (2026-07-07).
 *
 * Root cause: the "Venues" sub-dimension block was gated on
 * `!(catData.chains && ...)` — a category with ANY `chains` breakdown
 * suppressed its venue list entirely. That's correct for a fully-on-chain
 * category (DeFi, where ~every venue has a chain) but wrong for a mixed
 * category like CEFI, where only 2 of 24 venues (PACIFICA, LIGHTER) are
 * on-chain CLOBs — the other 22 (ASTER, BINANCE-*, DERIBIT, ...) vanished
 * from the card entirely.
 *
 * `getUncoveredVenueNames` is the extracted, directly-testable predicate
 * both JSX call sites in DataStatusTab.tsx now share.
 */
import { describe, it, expect } from "vitest";

import { getUncoveredVenueNames } from "../../../src/components/DataStatusTab";
import type { TurboAssetGroupStatus, TurboSubDimension } from "../../../src/api/client";

function venue(overrides: Partial<TurboSubDimension> = {}): TurboSubDimension {
  return {
    dates_found: 10,
    dates_expected: 10,
    completion_pct: 100,
    ...overrides,
  } as TurboSubDimension;
}

describe("getUncoveredVenueNames", () => {
  it("returns the non-chain venues for a mixed category (CEFI shape: 2 of 24 venues on-chain)", () => {
    const cefi = {
      breakdown_axis: "venue",
      chains: {
        SOLANA: { dates_found: 1, dates_expected: 1, completion_pct: 100, venues: ["PACIFICA"], venue_count: 1 },
        ZKSYNC: { dates_found: 1, dates_expected: 1, completion_pct: 100, venues: ["LIGHTER"], venue_count: 1 },
      },
      venues: {
        ASTER: venue(),
        DERIBIT: venue(),
        "DERIBIT-COMBO": venue(),
        PACIFICA: venue(),
        LIGHTER: venue(),
      },
    } as unknown as TurboAssetGroupStatus;

    const uncovered = getUncoveredVenueNames(cefi).sort();
    // The 3 non-chain venues surface; the 2 chain-covered venues do not
    // duplicate into the flat list.
    expect(uncovered).toEqual(["ASTER", "DERIBIT", "DERIBIT-COMBO"]);
  });

  it("returns [] for a fully-on-chain category (DeFi shape) — preserves the existing chains-only card", () => {
    const defi = {
      breakdown_axis: "venue",
      chains: {
        ARBITRUM: { dates_found: 1, dates_expected: 1, completion_pct: 100, venues: ["CAMELOT_V3"], venue_count: 1 },
      },
      venues: {
        CAMELOT_V3: venue(),
      },
    } as unknown as TurboAssetGroupStatus;

    expect(getUncoveredVenueNames(defi)).toEqual([]);
  });

  it("returns all venues when there are no chains at all (TRADFI/PREDICTION shape)", () => {
    const tradfi = {
      breakdown_axis: "venue",
      venues: { CME: venue(), CBOE: venue() },
    } as unknown as TurboAssetGroupStatus;

    expect(getUncoveredVenueNames(tradfi).sort()).toEqual(["CBOE", "CME"]);
  });
});
