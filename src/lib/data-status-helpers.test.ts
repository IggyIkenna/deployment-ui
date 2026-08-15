import { describe, expect, it } from "vitest";

import type { ShardAxisMatrixResponse } from "../api/client";
import {
  canonicalInstrumentTypeLabel,
  isHierarchicalDrilldownRedundant,
  showsFixturesOnlyDrillNote,
  showsGlobalReferenceAffordance,
} from "./data-status-helpers";

/**
 * P5 UN-SUPPRESSED (operator decision, empty_confirmed_and_coverage_correctness_audit_2026_08_15.md):
 * `isHierarchicalDrilldownRedundant` previously hid the drilldown for
 * instruments-service cefi/tradfi/defi on a subset-of-the-grid premise
 * (plan data_status_page_ux_and_canonicalisation_2026_07_16 P5). The operator
 * wants it visible for those asset groups too, so the predicate now always
 * returns `false` — every case below asserts that, regardless of service/
 * asset-group/matrix shape.
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
  it("no longer suppresses the drilldown for instruments-service cefi/tradfi/defi", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "cefi", MATRIX)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "tradfi", MATRIX)).toBe(false);
    expect(isHierarchicalDrilldownRedundant("instruments-service", "defi", MATRIX)).toBe(false);
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

  it("keeps the drilldown regardless of asset-group casing", () => {
    expect(isHierarchicalDrilldownRedundant("instruments-service", "CEFI", MATRIX)).toBe(false);
  });

  it("keeps the drilldown when the matrix is unavailable or the pair is absent", () => {
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

describe("showsGlobalReferenceAffordance (P8 honest-absence)", () => {
  it("shows for global sports reference data_types with no leagues (LEAGUES, VENUES)", () => {
    expect(showsGlobalReferenceAffordance("SPORTS", false, "global_periodic")).toBe(true);
    expect(showsGlobalReferenceAffordance("SPORTS", false, "global_season")).toBe(true);
  });

  it("hidden when the entity has a per-league breakdown (TEAMS after P8, STANDINGS)", () => {
    expect(showsGlobalReferenceAffordance("SPORTS", true, "per_league_trigger_date")).toBe(false);
    expect(showsGlobalReferenceAffordance("SPORTS", true, "per_league_periodic")).toBe(false);
    // Even a global axis is suppressed once a leagues map is present.
    expect(showsGlobalReferenceAffordance("SPORTS", true, "global_periodic")).toBe(false);
  });

  it("hidden for non-global axes + non-sports categories", () => {
    expect(showsGlobalReferenceAffordance("SPORTS", false, "per_league_trigger_date")).toBe(false);
    expect(showsGlobalReferenceAffordance("PREDICTION", false, "global_periodic")).toBe(false);
    expect(showsGlobalReferenceAffordance("CEFI", false, "global_periodic")).toBe(false);
    expect(showsGlobalReferenceAffordance("SPORTS", false, undefined)).toBe(false);
  });
});

describe("showsFixturesOnlyDrillNote (P8 UI-P2 deep-drill parity)", () => {
  it("shows for non-FIXTURES sports data_types", () => {
    expect(showsFixturesOnlyDrillNote("SPORTS", "STANDINGS")).toBe(true);
    expect(showsFixturesOnlyDrillNote("SPORTS", "TEAMS")).toBe(true);
    expect(showsFixturesOnlyDrillNote("SPORTS", "LEAGUES")).toBe(true);
    expect(showsFixturesOnlyDrillNote("SPORTS", "PLAYER_VALUES")).toBe(true);
  });

  it("hidden for FIXTURES itself", () => {
    expect(showsFixturesOnlyDrillNote("SPORTS", "FIXTURES")).toBe(false);
  });

  it("hidden for non-sports categories regardless of data_type name", () => {
    expect(showsFixturesOnlyDrillNote("PREDICTION", "STANDINGS")).toBe(false);
    expect(showsFixturesOnlyDrillNote("CEFI", "FIXTURES")).toBe(false);
  });
});
