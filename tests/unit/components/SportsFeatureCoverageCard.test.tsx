// @vitest-environment jsdom
/**
 * Unit spec — SportsFeatureCoverageCard (Phase 8.A, features_sports_honest_coverage_2026_05_05.plan.md).
 *
 * Covers the branches the Playwright smoke spec (tests/smoke/sports_feature_coverage_card.spec.ts)
 * can't reach cheaply: loading, error, and empty states, plus the populated-state rollup toggle —
 * mirroring the `LazyDrilldownDetails` unit-test pattern (spy on `getDataStatusTurbo`, render the
 * component directly, no full DataStatusTab mount).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../../../src/api/client";
import { SportsFeatureCoverageCard } from "../../../src/components/SportsFeatureCoverageCard";

const POPULATED_RESPONSE = {
  service: "features-sports-service",
  date_range: { start: "2026-04-21", end: "2026-07-19", days: 90 },
  mode: "turbo" as const,
  overall_completion_pct: 91.2,
  overall_dates_found: 900,
  overall_dates_expected: 987,
  asset_groups: {
    sports: {
      asset_group: "SPORTS",
      bucket: "mock-sports-bucket",
      prefixes_queried: 3,
      dates_expected: 987,
      dates_found: 900,
      dates_missing: 87,
      completion_pct: 91.2,
      breakdown_axis: "data_type" as const,
      missing_dates: [],
      data_types: {
        FIXTURE_FEATURES: {
          dates_found: 300,
          dates_expected: 320,
          completion_pct: 93.75,
          found_shards: 300,
          expected_shards: 320,
          missing_shards: 20,
          unit: "fixture_dates",
          axis: "per_league_per_fixture_date",
          source: "api_football",
          expected_leagues: ["EPL", "LA_LIGA"],
          leagues: {
            EPL: {
              found_shards: 160,
              expected_shards: 160,
              missing_shards: 0,
              missing_dates: [],
              missing_count: 0,
              completion_pct: 100,
              unit: "fixture_dates",
            },
            LA_LIGA: {
              found_shards: 140,
              expected_shards: 160,
              missing_shards: 20,
              missing_dates: ["2026-06-01", "2026-06-02"],
              missing_count: 20,
              completion_pct: 87.5,
              unit: "fixture_dates",
            },
          },
        },
        ODDS_FEATURES: {
          dates_found: 290,
          dates_expected: 320,
          completion_pct: 90.63,
          found_shards: 290,
          expected_shards: 320,
          missing_shards: 30,
          unit: "fixture_dates",
          axis: "per_league_per_fixture_date",
          source: "footystats",
          expected_leagues: ["EPL"],
          leagues: {
            EPL: {
              found_shards: 290,
              expected_shards: 320,
              missing_shards: 30,
              missing_dates: [],
              missing_count: 30,
              completion_pct: 90.63,
              unit: "fixture_dates",
            },
          },
        },
        // No DERIVED_FEATURES entry — exercises the ROLLUP_ORDER filter branch
        // that skips a rollup absent from the response.
      },
    },
  },
} as unknown as Awaited<ReturnType<typeof apiClient.getDataStatusTurbo>>;

const EMPTY_RESPONSE = {
  service: "features-sports-service",
  date_range: { start: "2026-04-21", end: "2026-07-19", days: 90 },
  mode: "turbo" as const,
  overall_completion_pct: 0,
  overall_dates_found: 0,
  overall_dates_expected: 0,
  asset_groups: {},
} as unknown as Awaited<ReturnType<typeof apiClient.getDataStatusTurbo>>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SportsFeatureCoverageCard", () => {
  it("shows a loading state before the fetch resolves", () => {
    vi.spyOn(apiClient, "getDataStatusTurbo").mockReturnValue(new Promise(() => {}));
    render(<SportsFeatureCoverageCard />);
    expect(screen.getByText(/Loading feature coverage/i)).toBeInTheDocument();
  });

  it("shows an error state when the fetch rejects", async () => {
    vi.spyOn(apiClient, "getDataStatusTurbo").mockRejectedValue(new Error("network down"));
    render(<SportsFeatureCoverageCard />);
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });

  it("shows the empty state when the response has no sports category", async () => {
    vi.spyOn(apiClient, "getDataStatusTurbo").mockResolvedValue(EMPTY_RESPONSE);
    render(<SportsFeatureCoverageCard />);
    await waitFor(() => expect(screen.getByTestId("sports-feature-no-data")).toBeInTheDocument());
  });

  it("renders every rollup present in the response and skips any that are absent", async () => {
    vi.spyOn(apiClient, "getDataStatusTurbo").mockResolvedValue(POPULATED_RESPONSE);
    render(<SportsFeatureCoverageCard />);

    await waitFor(() => expect(screen.getByTestId("sports-feature-pct-FIXTURE_FEATURES")).toBeInTheDocument());
    expect(screen.getByTestId("sports-feature-pct-FIXTURE_FEATURES")).toHaveTextContent("93.8%");
    expect(screen.getByTestId("sports-feature-pct-ODDS_FEATURES")).toHaveTextContent("90.6%");
    // DERIVED_FEATURES was absent from the mocked response — must not render.
    expect(screen.queryByTestId("sports-feature-rollup-DERIVED_FEATURES")).not.toBeInTheDocument();

    // The per-calculator/drift caveat is always shown once data loads.
    expect(screen.getByTestId("sports-feature-per-calculator-pending")).toBeInTheDocument();
  });

  it("expands a rollup to reveal its per-league breakdown on toggle click", async () => {
    vi.spyOn(apiClient, "getDataStatusTurbo").mockResolvedValue(POPULATED_RESPONSE);
    render(<SportsFeatureCoverageCard />);

    await waitFor(() =>
      expect(screen.getByTestId("sports-feature-rollup-toggle-FIXTURE_FEATURES")).toBeInTheDocument(),
    );
    // Collapsed by default — no league rows yet.
    expect(screen.queryByTestId("sports-feature-league-row")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("sports-feature-rollup-toggle-FIXTURE_FEATURES"));

    const rows = await screen.findAllByTestId("sports-feature-league-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("140/160 fixture_dates")).toBeInTheDocument();
    expect(screen.getByText("(2 missing)")).toBeInTheDocument();
  });
});
