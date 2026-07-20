// @vitest-environment jsdom
/**
 * Unit tests for src/lib/needs-attention.ts — the "Needs Attention" triage
 * panel's derivation + ranking logic (Data Status surface).
 *
 * Covers:
 *   - failure / gap / stale detection from TurboSubDimension fields
 *   - ranking: failures > gaps > stale (kind), then by count within a kind
 *   - breakdown_axis "venue" and "data_type" (SPORTS-style) sources
 *   - category-level fallback when there is no venue/data_type breakdown
 *   - graceful no-signal behaviour: absent fields never crash or fabricate
 *     an item (honest-absence, not a guess)
 */
import { describe, expect, it } from "vitest";
import type { TurboAssetGroupStatus, TurboDataStatusResponse, TurboSubDimension } from "../../src/api/client";
import { deriveNeedsAttention } from "../../src/lib/needs-attention";

// ── Minimal stub factories — only the fields the derivation branches on ────

function mkVenue(overrides: Partial<TurboSubDimension> = {}): TurboSubDimension {
  return {
    dates_found: 0,
    dates_expected: 0,
    completion_pct: 100,
    ...overrides,
  };
}

function mkAssetGroup(overrides: Partial<TurboAssetGroupStatus> = {}): TurboAssetGroupStatus {
  return {
    asset_group: "TEST",
    bucket: "mock-bucket",
    prefixes_queried: 0,
    dates_expected: 30,
    dates_found: 30,
    dates_missing: 0,
    completion_pct: 100,
    breakdown_axis: "venue",
    venues: {},
    data_types: {},
    ...overrides,
  };
}

function mkResponse(
  asset_groups: Record<string, TurboAssetGroupStatus>,
  date_range: { start: string; end: string; days: number } = { start: "2026-06-01", end: "2026-07-01", days: 30 },
): TurboDataStatusResponse {
  return {
    service: "instruments-service",
    date_range,
    mode: "turbo",
    overall_completion_pct: 90,
    overall_dates_found: 100,
    overall_dates_expected: 110,
    asset_groups,
  };
}

describe("deriveNeedsAttention", () => {
  it("returns [] for a null/undefined/empty response — no crash, no fabricated items", () => {
    expect(deriveNeedsAttention(null)).toEqual([]);
    expect(deriveNeedsAttention(undefined)).toEqual([]);
    expect(deriveNeedsAttention(mkResponse({}))).toEqual([]);
  });

  it("emits a failure item from a venue's attempted_failed count", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        venues: {
          BINANCE: mkVenue({ capture_status_counts: { captured: 10, empty_confirmed: 0, attempted_failed: 5 } }),
        },
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "failure", assetGroup: "CEFI", name: "BINANCE", count: 5 });
  });

  it("prefers the canonical `counts` alias over `capture_status_counts` when both are present", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        venues: {
          BINANCE: mkVenue({
            capture_status_counts: { captured: 10, empty_confirmed: 0, attempted_failed: 999 },
            counts: {
              captured: 10,
              empty_confirmed: 0,
              attempted_failed: 5,
              expected_unattempted_known_empty: 0,
              expected_unattempted_pending_fetch: 0,
            },
          }),
        },
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items[0].count).toBe(5);
  });

  it("emits a gap item from dates_missing, and falls back to missing_dates.length when the count field is absent", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        venues: {
          OKX: mkVenue({ dates_missing: 3 }),
          DERIBIT: mkVenue({ missing_dates: ["2026-06-10", "2026-06-11"] }),
        },
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items).toHaveLength(2);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName.OKX).toMatchObject({ kind: "gap", count: 3 });
    expect(byName.DERIBIT).toMatchObject({ kind: "gap", count: 2 });
  });

  it("emits a stale item only when the latest found date trails the range end past the threshold", () => {
    const resp = mkResponse(
      {
        CEFI: mkAssetGroup({
          venues: {
            // 5 days stale — over the default 3-day threshold.
            STALE_VENUE: mkVenue({ dates_found_list: ["2026-06-25", "2026-06-26"] }),
            // 1 day stale — under the default threshold, so no item.
            FRESH_VENUE: mkVenue({ dates_found_list: ["2026-06-30"] }),
          },
        }),
      },
      { start: "2026-06-01", end: "2026-07-01", days: 30 },
    );
    const items = deriveNeedsAttention(resp);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "stale", name: "STALE_VENUE", count: 5 });
  });

  it("never fabricates a stale item when dates_found_list is absent or empty (honest-absence)", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        venues: {
          NO_LIST: mkVenue({}),
          EMPTY_LIST: mkVenue({ dates_found_list: [] }),
        },
      }),
    });
    expect(deriveNeedsAttention(resp)).toEqual([]);
  });

  it("falls back to the category itself when there is no venue/data_type breakdown", () => {
    const resp = mkResponse({
      PREDICTION: mkAssetGroup({
        breakdown_axis: "canonical_question_group",
        venues: {},
        data_types: {},
        capture_status_counts: { captured: 1, empty_confirmed: 0, attempted_failed: 7 },
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "failure", assetGroup: "PREDICTION", name: "PREDICTION", count: 7 });
  });

  it("reads the data_type breakdown for SPORTS-style (breakdown_axis: data_type) categories", () => {
    const resp = mkResponse({
      SPORTS: mkAssetGroup({
        breakdown_axis: "data_type",
        data_types: {
          FIXTURES: mkVenue({ dates_missing: 4 }),
        } as unknown as TurboAssetGroupStatus["venues"],
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "gap", dimensionLabel: "Data Types", name: "FIXTURES", count: 4 });
  });

  it("ranks failures above gaps above stale, and by count descending within a kind", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        venues: {
          SMALL_FAILURE: mkVenue({ capture_status_counts: { captured: 0, empty_confirmed: 0, attempted_failed: 1 } }),
          BIG_FAILURE: mkVenue({ capture_status_counts: { captured: 0, empty_confirmed: 0, attempted_failed: 50 } }),
          THE_GAP: mkVenue({ dates_missing: 10 }),
          THE_STALE: mkVenue({ dates_found_list: ["2026-06-01"] }),
        },
      }),
    });
    const items = deriveNeedsAttention(resp);
    expect(items.map((i) => i.kind)).toEqual(["failure", "failure", "gap", "stale"]);
    expect(items.map((i) => i.name)).toEqual(["BIG_FAILURE", "SMALL_FAILURE", "THE_GAP", "THE_STALE"]);
  });

  it("caps the returned list at maxItemsPerKind, post-ranking (worst items survive the cut)", () => {
    const venues: Record<string, TurboSubDimension> = {};
    for (let i = 0; i < 20; i++) {
      venues[`V${i}`] = mkVenue({
        capture_status_counts: { captured: 0, empty_confirmed: 0, attempted_failed: i + 1 },
      });
    }
    const resp = mkResponse({ CEFI: mkAssetGroup({ venues }) });
    const items = deriveNeedsAttention(resp, { maxItemsPerKind: 5 });
    expect(items).toHaveLength(5);
    // Highest attempted_failed counts (V19..V15) must be the ones that survive the cap.
    expect(items.map((i) => i.name)).toEqual(["V19", "V18", "V17", "V16", "V15"]);
  });

  it("caps PER KIND, not globally — a noisy gap bucket must not crowd every stale item out", () => {
    const venues: Record<string, TurboSubDimension> = {};
    // 10 gap-only venues (more than maxItemsPerKind) plus 1 stale-only venue.
    for (let i = 0; i < 10; i++) {
      venues[`GAP_${i}`] = mkVenue({ dates_missing: i + 1 });
    }
    venues.THE_ONLY_STALE = mkVenue({ dates_found_list: ["2026-06-01"] });
    const resp = mkResponse({ CEFI: mkAssetGroup({ venues }) });

    const items = deriveNeedsAttention(resp, { maxItemsPerKind: 5 });
    const kinds = items.map((i) => i.kind);
    expect(kinds.filter((k) => k === "gap")).toHaveLength(5);
    // The stale item must survive even though 10 gap candidates outnumber the cap.
    expect(kinds.filter((k) => k === "stale")).toHaveLength(1);
    expect(items.find((i) => i.name === "THE_ONLY_STALE")).toBeDefined();
  });

  it("uses an explicit rangeEndISO override instead of the response's date_range.end", () => {
    const resp = mkResponse({
      CEFI: mkAssetGroup({
        // date_range.end is "2026-07-01" (mkResponse default) — 1 day after the
        // latest found date, under the default 3-day threshold, so no staleness.
        venues: { V: mkVenue({ dates_found_list: ["2026-06-30"] }) },
      }),
    });
    const noOverride = deriveNeedsAttention(resp);
    expect(noOverride).toEqual([]);

    const withOverride = deriveNeedsAttention(resp, { rangeEndISO: "2026-12-01" });
    expect(withOverride).toHaveLength(1);
    expect(withOverride[0].kind).toBe("stale");
  });
});
