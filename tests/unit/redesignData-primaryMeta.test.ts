import { describe, it, expect } from "vitest";
import { toAgData } from "../../src/components/dataStatus/redesignData";
import type { TurboAssetGroupStatus } from "../../src/api/client";

/** Synthetic turbo asset_group block exercising the per-venue completion
 * projection: venue-specific expected (`dates_expected_venue`), a truncated
 * missing-date list (`dates_missing_list` + `dates_missing_count`), and
 * per-venue missing data_types. Only the fields `toAgData` reads are set. */
function turboBlock(): TurboAssetGroupStatus {
  return {
    asset_group: "CEFI",
    breakdown_axis: "venue",
    capture_status_counts: {
      captured: 200,
      empty_confirmed: 10,
      attempted_failed: 5,
    },
    venues: {
      BINANCE: {
        dates_found: 27,
        dates_expected: 30, // legacy AG-level — must be IGNORED
        dates_expected_venue: 28, // venue-specific — must be PREFERRED
        venue_start_date: "2026-04-03",
        dates_missing: 1,
        dates_missing_count: 1,
        dates_missing_list: ["2026-04-15"],
        missing_dates: ["should-not-be-used"],
        missing_data_types: ["funding"],
        completion_pct: 96.4,
        // Per-venue small-axis sources (MTDS/MDPS put these per-venue; the
        // AG-level `data_types` map is empty). axisValuesOf must union them.
        expected_data_types: ["trades", "book_snapshot_5"],
        data_types: { trades: {}, derivative_ticker: {} },
        instrument_types: { perpetual: {}, PERPETUAL: {} },
        capture_status_counts: {
          captured: 150,
          empty_confirmed: 6,
          attempted_failed: 1,
        },
      },
      ASTER: {
        dates_found: 0,
        dates_expected: 30,
        // No venue-specific expected → falls back to dates_expected (30).
        dates_missing_count: 30,
        // List truncated to first 2 of 30.
        dates_missing_list: ["2026-04-01", "2026-04-02"],
        completion_pct: 0,
        expected_data_types: ["liquidations"],
        instrument_types: { spot_pair: {} },
        capture_status_counts: {
          captured: 0,
          empty_confirmed: 0,
          attempted_failed: 4,
        },
      },
    },
  } as unknown as TurboAssetGroupStatus;
}

describe("toAgData primaryMeta projection", () => {
  it("prefers dates_expected_venue and reads missing list from dates_missing_list", () => {
    const ag = toAgData(turboBlock(), "venue", [
      "data_type",
      "instrument_type",
    ]);
    const binance = ag.primaryMeta.BINANCE;
    expect(binance).toBeDefined();
    expect(binance.datesFound).toBe(27);
    expect(binance.datesExpected).toBe(28); // venue-specific, not 30
    expect(binance.datesMissing).toBe(1);
    expect(binance.missingDates).toEqual(["2026-04-15"]); // not the legacy field
    expect(binance.missingDatesTotal).toBe(1);
    expect(binance.completionPct).toBeCloseTo(96.4);
    expect(binance.missingDataTypes).toEqual(["funding"]);
    expect(binance.venueStart).toBe("2026-04-03");
  });

  it("falls back to dates_expected when no venue-specific expected, and surfaces truncated total", () => {
    const ag = toAgData(turboBlock(), "venue", []);
    const aster = ag.primaryMeta.ASTER;
    expect(aster.datesExpected).toBe(30); // fell back to AG-level
    expect(aster.datesFound).toBe(0);
    // List is truncated (2 shown) but the true total is reported.
    expect(aster.missingDates).toHaveLength(2);
    expect(aster.missingDatesTotal).toBe(30);
    expect(aster.missingDataTypes).toEqual([]); // defaults to []
    expect(aster.venueStart).toBeUndefined();
  });

  it("populates one primaryMeta entry per primary value", () => {
    const ag = toAgData(turboBlock(), "venue", []);
    expect(Object.keys(ag.primaryMeta).sort()).toEqual(["ASTER", "BINANCE"]);
  });
});
