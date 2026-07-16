import { describe, expect, it } from "vitest";

import type { ShardAxisMatrixResponse } from "../api/client";
import { canonicalInstrumentTypeLabel, isHierarchicalDrilldownRedundant } from "./data-status-helpers";

/**
 * P5 — the Instrument-Coverage-Summary hierarchical drilldown is redundant with
 * the "Data Coverage" grid ONLY for instruments-service pricing-pipeline asset
 * groups (cefi/tradfi/defi). Sports (league_id) + prediction
 * (canonical_question_group) carry an axis the grid does not expand, and every
 * other service uses the drilldown as its PRIMARY shard drilldown — all kept.
 * Plan data_status_page_ux_and_canonicalisation_2026_07_16 P5.
 */

// Mirrors the live /api/config/shard-axis-matrix payload (UAC SHARD_AXIS_MATRIX).
const MATRIX: ShardAxisMatrixResponse = {
  shard_axes: {
    "instruments-service": {
      cefi: ["venue"],
      tradfi: ["venue"],
      defi: ["venue", "chain"],
      sports: ["data_type", "league_id"],
      prediction: ["venue", "canonical_question_group"],
    },
    "market-tick-data-service": {
      cefi: ["venue", "data_type", "instrument_type", "instrument_id"],
      defi: ["venue", "chain", "data_type", "instrument_id"],
    },
  },
  display_axes: {},
  primary_axis: {},
  breakdown_axes: {},
};

describe("isHierarchicalDrilldownRedundant", () => {
  it("suppresses the drilldown for instruments-service cefi/tradfi/defi", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "cefi", MATRIX)).toBe(true);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "tradfi", MATRIX)).toBe(true);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "defi", MATRIX)).toBe(true);
  });

  it("keeps the drilldown for instruments-service sports + prediction (axis the grid does not expand)", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "sports", MATRIX)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "prediction", MATRIX)).toBe(false);
  });

  it("keeps the drilldown for every other service (primary drilldown)", () => {
    expect(isHierarchicalDrilldownRedundant("market-tick-data-service", "cefi", MATRIX)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("market-tick-data-service", "defi", MATRIX)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("features-onchain-service", "defi", MATRIX)).toBe(false);
  });

  it("handles a case-insensitive asset-group label", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "CEFI", MATRIX)).toBe(true);
  });

  it("keeps the drilldown when the matrix is unavailable or the pair is absent (fail-open)", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "cefi", null)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "unknown", MATRIX)).toBe(false);
  });
});

describe("canonicalInstrumentTypeLabel", () => {
  it("lifts legacy lowercase values to canonical UPPERCASE UAC InstrumentType", () => {
    expect(canonicalInstrumentTypeLabel("spot")).toBe("SPOT_PAIR");
    expect(canonicalInstrumentTypeLabel("perp")).toBe("PERPETUAL");
    expect(canonicalInstrumentTypeLabel("perpetual")).toBe("PERPETUAL");
    expect(canonicalInstrumentTypeLabel("futures")).toBe("FUTURE");
    expect(canonicalInstrumentTypeLabel("lending_market")).toBe("LENDING");
    expect(canonicalInstrumentTypeLabel("etf")).toBe("ETF");
  });

  it("returns already-canonical + DeFi mid-migration values verbatim (no fabrication)", () => {
    // Already canonical — untouched.
    expect(canonicalInstrumentTypeLabel("PERPETUAL")).toBe("PERPETUAL");
    expect(canonicalInstrumentTypeLabel("DEX_POOL")).toBe("DEX_POOL");
    // DeFi mid-migration types stay verbatim (not "fixed").
    expect(canonicalInstrumentTypeLabel("A_TOKEN")).toBe("A_TOKEN");
    expect(canonicalInstrumentTypeLabel("DEBT_TOKEN")).toBe("DEBT_TOKEN");
    // Unknown value is never force-uppercased or invented.
    expect(canonicalInstrumentTypeLabel("weird_value")).toBe("weird_value");
  });
});
