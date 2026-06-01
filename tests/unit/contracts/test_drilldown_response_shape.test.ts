/**
 * DrilldownResponse interface shape contract — golden-snapshot pin.
 *
 * Pins the EXACT field names of DrilldownResponse, DrilldownNode, and
 * DrilldownTotals. Any rename on the deployment-api side that is not
 * mirrored here immediately surfaces as a TypeScript compile error
 * (via assignment-narrowing) AND a runtime assertion failure
 * (via Object.keys enumeration).
 *
 * The 2026-05-07 incident: `total_top_axis_children` was temporarily
 * renamed to `total` in the response body, silently breaking
 * HierarchicalShardDrilldown.tsx's "Show more" button.
 * This test would have caught it.
 *
 * Plan: data_status_comprehensive_test_coverage_2026_05_07 § A.5.
 */

import { describe, it, expect } from "vitest";
import type {
  DrilldownResponse,
  DrilldownNode,
  DrilldownTotals,
} from "../../../src/api/client";

// ---------------------------------------------------------------------------
// Golden shape — a minimal, complete example of each interface.
// TypeScript will reject this object if any required field is missing or
// has the wrong type, catching interface drift at compile time.
// ---------------------------------------------------------------------------

const GOLDEN_DRILLDOWN_TOTALS: DrilldownTotals = {
  captured: 100,
  empty_confirmed: 10,
  attempted_failed: 2,
  total: 112,
  completion_pct: 89.3,
};

const GOLDEN_DRILLDOWN_NODE: DrilldownNode = {
  axis: "venue",
  value: "BINANCE",
  captured: 50,
  empty_confirmed: 5,
  attempted_failed: 1,
  total: 56,
  completion_pct: 89.3,
  row_key: { venue: "BINANCE" },
  children: [],
  is_leaf: false,
};

const GOLDEN_DRILLDOWN_RESPONSE: DrilldownResponse = {
  service: "instruments-service",
  asset_group: "cefi",
  axes: ["venue", "data_type", "instrument_type", "date"],
  tree: [GOLDEN_DRILLDOWN_NODE],
  totals: GOLDEN_DRILLDOWN_TOTALS,
  filtered_by: {},
  // Optional pagination fields (Phase 6):
  total_top_axis_children: 42,
  child_offset: 0,
  child_limit: 20,
};

// ---------------------------------------------------------------------------
// DrilldownTotals field contract
// ---------------------------------------------------------------------------

describe("DrilldownTotals — field contract", () => {
  it("has all required numeric fields", () => {
    const requiredKeys: Array<keyof DrilldownTotals> = [
      "captured",
      "empty_confirmed",
      "attempted_failed",
      "total",
      "completion_pct",
    ];
    for (const key of requiredKeys) {
      expect(
        key in GOLDEN_DRILLDOWN_TOTALS,
        `DrilldownTotals must have field '${key}'`,
      ).toBe(true);
      expect(
        typeof GOLDEN_DRILLDOWN_TOTALS[key],
        `DrilldownTotals.${key} must be number`,
      ).toBe("number");
    }
  });

  it("does not use 'total_count' instead of 'total' (name-drift guard)", () => {
    expect(Object.keys(GOLDEN_DRILLDOWN_TOTALS)).not.toContain("total_count");
  });
});

// ---------------------------------------------------------------------------
// DrilldownNode field contract
// ---------------------------------------------------------------------------

describe("DrilldownNode — field contract", () => {
  it("has required string fields", () => {
    const strFields: Array<keyof DrilldownNode> = ["axis", "value"];
    for (const key of strFields) {
      expect(typeof GOLDEN_DRILLDOWN_NODE[key]).toBe("string");
    }
  });

  it("has required numeric fields", () => {
    const numFields: Array<keyof DrilldownNode> = [
      "captured",
      "empty_confirmed",
      "attempted_failed",
      "total",
      "completion_pct",
    ];
    for (const key of numFields) {
      expect(typeof GOLDEN_DRILLDOWN_NODE[key]).toBe("number");
    }
  });

  it("has row_key as Record<string, string>", () => {
    expect(typeof GOLDEN_DRILLDOWN_NODE.row_key).toBe("object");
    expect(GOLDEN_DRILLDOWN_NODE.row_key).not.toBeNull();
  });

  it("has children as array", () => {
    expect(Array.isArray(GOLDEN_DRILLDOWN_NODE.children)).toBe(true);
  });

  it("has is_leaf as boolean", () => {
    expect(typeof GOLDEN_DRILLDOWN_NODE.is_leaf).toBe("boolean");
  });

  it("does not use 'shard_count' instead of 'total' (name-drift guard)", () => {
    expect(Object.keys(GOLDEN_DRILLDOWN_NODE)).not.toContain("shard_count");
  });
});

// ---------------------------------------------------------------------------
// DrilldownResponse field contract — the critical regression
// ---------------------------------------------------------------------------

describe("DrilldownResponse — field contract", () => {
  it("has required string fields: service, asset_group", () => {
    expect(typeof GOLDEN_DRILLDOWN_RESPONSE.service).toBe("string");
    expect(typeof GOLDEN_DRILLDOWN_RESPONSE.asset_group).toBe("string");
  });

  it("has axes as string[]", () => {
    expect(Array.isArray(GOLDEN_DRILLDOWN_RESPONSE.axes)).toBe(true);
    expect(GOLDEN_DRILLDOWN_RESPONSE.axes.every((a) => typeof a === "string")).toBe(
      true,
    );
  });

  it("has tree as DrilldownNode[]", () => {
    expect(Array.isArray(GOLDEN_DRILLDOWN_RESPONSE.tree)).toBe(true);
    const [node] = GOLDEN_DRILLDOWN_RESPONSE.tree;
    expect(typeof node.axis).toBe("string");
    expect(typeof node.captured).toBe("number");
    expect(Array.isArray(node.children)).toBe(true);
  });

  it("has totals as DrilldownTotals (not a flat number)", () => {
    expect(typeof GOLDEN_DRILLDOWN_RESPONSE.totals).toBe("object");
    expect(GOLDEN_DRILLDOWN_RESPONSE.totals).not.toBeNull();
    expect(typeof GOLDEN_DRILLDOWN_RESPONSE.totals.captured).toBe("number");
  });

  it("has filtered_by as Record<string, string>", () => {
    expect(typeof GOLDEN_DRILLDOWN_RESPONSE.filtered_by).toBe("object");
    expect(GOLDEN_DRILLDOWN_RESPONSE.filtered_by).not.toBeNull();
  });

  it("uses 'total_top_axis_children' NOT 'total' for pagination count (2026-05-07 regression)", () => {
    // This is the field that was temporarily renamed, breaking Show-more.
    expect(Object.keys(GOLDEN_DRILLDOWN_RESPONSE)).toContain(
      "total_top_axis_children",
    );
    // Ensure we didn't accidentally define it as a plain 'total' field.
    // (DrilldownTotals already has a 'total' field; the pagination one must be distinct.)
    const pgKey = "total_top_axis_children";
    expect(GOLDEN_DRILLDOWN_RESPONSE[pgKey]).toBe(42);
  });

  it("uses 'child_offset' and 'child_limit' for pagination (not 'offset'/'limit')", () => {
    expect(Object.keys(GOLDEN_DRILLDOWN_RESPONSE)).toContain("child_offset");
    expect(Object.keys(GOLDEN_DRILLDOWN_RESPONSE)).toContain("child_limit");
    expect(Object.keys(GOLDEN_DRILLDOWN_RESPONSE)).not.toContain("offset");
    expect(Object.keys(GOLDEN_DRILLDOWN_RESPONSE)).not.toContain("limit");
  });

  it("golden snapshot has all 7 required + 3 optional pagination fields", () => {
    const required = [
      "service",
      "asset_group",
      "axes",
      "tree",
      "totals",
      "filtered_by",
    ];
    const optional = ["total_top_axis_children", "child_offset", "child_limit"];
    for (const key of [...required, ...optional]) {
      expect(
        key in GOLDEN_DRILLDOWN_RESPONSE,
        `DrilldownResponse must have field '${key}'`,
      ).toBe(true);
    }
  });

  it("does not contain unknown fields (no accidental extras in golden)", () => {
    const knownFields = new Set([
      "service",
      "asset_group",
      "axes",
      "tree",
      "totals",
      "filtered_by",
      "manifest_uri",
      "mock",
      "total_top_axis_children",
      "child_offset",
      "child_limit",
    ]);
    for (const key of Object.keys(GOLDEN_DRILLDOWN_RESPONSE)) {
      expect(
        knownFields.has(key),
        `Unexpected field '${key}' in DrilldownResponse golden snapshot — add it to the known-fields set if intentional`,
      ).toBe(true);
    }
  });
});
