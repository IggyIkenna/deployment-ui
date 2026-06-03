// @vitest-environment jsdom
/**
 * Unit tests for src/lib/data-status-helpers.ts
 *
 * Verifies the three helper functions across all breakdown_axis values:
 *   - "venue"                  → CEFI / TRADFI / DEFI (legacy)
 *   - "data_type"              → SPORTS
 *   - "canonical_question_group" → PREDICTION post-v9 bundled atom
 *   - undefined                → legacy fallback
 *
 * The prediction path is the load-bearing new contract:
 *   getAssetGroupBreakdown  → ag.data_types (keyed by cqg group name)
 *   getAssetGroupBreakdownLabel → "Question Groups"
 *   isPredictionCqgAxis     → true
 *
 * Each cqg entry in data_types MUST carry observed_clusters + source so the
 * DataStatusTab cluster drilldown renders correctly.
 */
import { describe, expect, it } from "vitest";
import type { TurboAssetGroupStatus } from "../../src/api/client";
import {
  getAssetGroupBreakdown,
  getAssetGroupBreakdownLabel,
  isPredictionCqgAxis,
} from "../../src/lib/data-status-helpers";

// Minimal stub factory — only the fields the helpers branch on.
function mkAg(
  breakdown_axis: TurboAssetGroupStatus["breakdown_axis"],
  venues?: Record<string, object>,
  data_types?: Record<string, object>,
): TurboAssetGroupStatus {
  return {
    asset_group: "TEST",
    bucket: "mock",
    prefixes_queried: 0,
    dates_expected: 10,
    dates_found: 10,
    dates_missing: 0,
    completion_pct: 100,
    missing_dates: [],
    breakdown_axis,
    venues: (venues ?? {}) as TurboAssetGroupStatus["venues"],
    data_types: (data_types ?? {}) as TurboAssetGroupStatus["data_types"],
  } as TurboAssetGroupStatus;
}

const mockVenues = {
  "BINANCE-FUTURES": { dates_found: 90, dates_expected: 100, completion_pct: 90 },
};
const mockDataTypes = {
  FIXTURES: { dates_found: 200, dates_expected: 500, completion_pct: 40 },
};
const mockCqgGroups = {
  "crypto-price-prediction": {
    dates_found: 280,
    dates_expected: 300,
    completion_pct: 93.33,
    source: "polymarket_clob",
    observed_clusters: {
      "0xabc123": 14200,
      "0xbcd234": 9800,
    },
  },
  "election-outcome": {
    dates_found: 95,
    dates_expected: 120,
    completion_pct: 79.17,
    source: "polymarket_clob",
    observed_clusters: { "0xdef456": 5500 },
  },
};

describe("getAssetGroupBreakdown", () => {
  it('returns venues for breakdown_axis="venue"', () => {
    const ag = mkAg("venue", mockVenues);
    expect(getAssetGroupBreakdown(ag)).toBe(ag.venues);
  });

  it("returns venues for undefined breakdown_axis (legacy fallback)", () => {
    const ag = mkAg(undefined, mockVenues);
    expect(getAssetGroupBreakdown(ag)).toBe(ag.venues);
  });

  it('returns data_types for breakdown_axis="data_type" (SPORTS)', () => {
    const ag = mkAg("data_type", {}, mockDataTypes);
    expect(getAssetGroupBreakdown(ag)).toBe(ag.data_types);
  });

  it('returns data_types for breakdown_axis="canonical_question_group" (PREDICTION v9)', () => {
    const ag = mkAg("canonical_question_group", {}, mockCqgGroups);
    expect(getAssetGroupBreakdown(ag)).toBe(ag.data_types);
  });

  it("cqg entries carry observed_clusters and source", () => {
    const ag = mkAg("canonical_question_group", {}, mockCqgGroups);
    const breakdown = getAssetGroupBreakdown(ag);
    expect(breakdown).toBeDefined();
    const entry = breakdown!["crypto-price-prediction"] as {
      source?: string;
      observed_clusters?: Record<string, number>;
    };
    expect(entry.source).toBe("polymarket_clob");
    expect(entry.observed_clusters).toBeDefined();
    expect(entry.observed_clusters!["0xabc123"]).toBe(14200);
    expect(entry.observed_clusters!["0xbcd234"]).toBe(9800);
  });

  it("returns undefined when data_types is absent on cqg axis", () => {
    const ag = mkAg("canonical_question_group");
    // data_types defaults to {} — treated as defined but empty; still returned.
    expect(getAssetGroupBreakdown(ag)).toEqual({});
  });
});

describe("getAssetGroupBreakdownLabel", () => {
  it('returns "Venues" for breakdown_axis="venue"', () => {
    expect(getAssetGroupBreakdownLabel(mkAg("venue"))).toBe("Venues");
  });

  it('returns "Venues" for undefined breakdown_axis', () => {
    expect(getAssetGroupBreakdownLabel(mkAg(undefined))).toBe("Venues");
  });

  it('returns "Data Types" for breakdown_axis="data_type" (SPORTS)', () => {
    expect(getAssetGroupBreakdownLabel(mkAg("data_type"))).toBe("Data Types");
  });

  it('returns "Question Groups" for breakdown_axis="canonical_question_group" (PREDICTION v9)', () => {
    expect(
      getAssetGroupBreakdownLabel(mkAg("canonical_question_group")),
    ).toBe("Question Groups");
  });
});

describe("isPredictionCqgAxis", () => {
  it("returns true for canonical_question_group axis", () => {
    expect(isPredictionCqgAxis(mkAg("canonical_question_group"))).toBe(true);
  });

  it("returns false for venue axis", () => {
    expect(isPredictionCqgAxis(mkAg("venue"))).toBe(false);
  });

  it("returns false for data_type axis", () => {
    expect(isPredictionCqgAxis(mkAg("data_type"))).toBe(false);
  });

  it("returns false for undefined axis", () => {
    expect(isPredictionCqgAxis(mkAg(undefined))).toBe(false);
  });
});

describe("prediction v9 mock fixture — end-to-end shape contract", () => {
  it("cqg breakdown has ≥2 groups from the mock-api fixture", async () => {
    const { installDeploymentMockHandlers } = await import(
      "../../src/lib/mock-api"
    );
    installDeploymentMockHandlers(true);
    const res = await fetch("/api/data-status/turbo");
    expect(res.ok).toBe(true);
    const data = (await res.json()) as {
      asset_groups: Record<string, TurboAssetGroupStatus>;
    };
    const prediction = data.asset_groups["PREDICTION"];
    expect(prediction).toBeDefined();
    expect(prediction.breakdown_axis).toBe("canonical_question_group");
    expect(prediction.data_types).toBeDefined();
    const groups = Object.keys(prediction.data_types!);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it("each cqg group has observed_clusters with ≥1 market", async () => {
    const res = await fetch("/api/data-status/turbo");
    const data = (await res.json()) as {
      asset_groups: Record<string, TurboAssetGroupStatus>;
    };
    const prediction = data.asset_groups["PREDICTION"];
    for (const [groupName, groupData] of Object.entries(
      prediction.data_types!,
    )) {
      const gd = groupData as { observed_clusters?: Record<string, number> };
      expect(gd.observed_clusters, `${groupName} missing observed_clusters`).toBeDefined();
      expect(
        Object.keys(gd.observed_clusters!).length,
        `${groupName} has 0 clusters`,
      ).toBeGreaterThan(0);
    }
  });

  it("each cqg group has a source field", async () => {
    const res = await fetch("/api/data-status/turbo");
    const data = (await res.json()) as {
      asset_groups: Record<string, TurboAssetGroupStatus>;
    };
    const prediction = data.asset_groups["PREDICTION"];
    for (const [groupName, groupData] of Object.entries(
      prediction.data_types!,
    )) {
      const gd = groupData as { source?: string };
      expect(gd.source, `${groupName} missing source`).toBeTruthy();
    }
  });
});
