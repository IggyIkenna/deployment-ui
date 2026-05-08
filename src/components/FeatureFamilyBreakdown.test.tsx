import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FeatureFamilyBreakdown,
  groupFeatureGroupsByFamily,
} from "./FeatureFamilyBreakdown";
import type {
  TurboFeatureFamilyStatus,
  TurboFeatureGroupStatus,
} from "../api/client";

function fg(
  partial: Partial<TurboFeatureGroupStatus> = {},
): TurboFeatureGroupStatus {
  return {
    dates_found: 0,
    dates_expected: 0,
    completion_pct: 0,
    ...partial,
  };
}

function family(
  partial: Partial<TurboFeatureFamilyStatus> = {},
): TurboFeatureFamilyStatus {
  return {
    dates_found: 0,
    dates_expected: 0,
    completion_pct: 0,
    feature_groups: {},
    ...partial,
  };
}

describe("groupFeatureGroupsByFamily", () => {
  it("buckets feature_groups by their feature_family axis", () => {
    const grouped = groupFeatureGroupsByFamily({
      gas_basefee: fg({
        dates_found: 90,
        dates_expected: 100,
        completion_pct: 90,
        feature_family: "onchain",
      }),
      lst_yields: fg({
        dates_found: 50,
        dates_expected: 100,
        completion_pct: 50,
        feature_family: "onchain",
      }),
      vix_term_structure: fg({
        dates_found: 100,
        dates_expected: 100,
        completion_pct: 100,
        feature_family: "volatility",
      }),
    });

    expect(Object.keys(grouped).sort()).toEqual(["onchain", "volatility"]);
    expect(Object.keys(grouped.onchain.feature_groups).sort()).toEqual([
      "gas_basefee",
      "lst_yields",
    ]);
    expect(grouped.onchain.dates_found).toBe(140);
    expect(grouped.onchain.dates_expected).toBe(200);
    expect(grouped.onchain.completion_pct).toBe(70);
    expect(grouped.volatility.completion_pct).toBe(100);
  });

  it("buckets feature_groups with no feature_family under __unknown__", () => {
    const grouped = groupFeatureGroupsByFamily({
      legacy_unstamped: fg({
        dates_found: 10,
        dates_expected: 100,
        completion_pct: 10,
      }),
    });
    expect(Object.keys(grouped)).toEqual(["__unknown__"]);
    expect(grouped.__unknown__.feature_groups.legacy_unstamped).toBeDefined();
  });

  it("excludes families that contain no feature_groups", () => {
    const grouped = groupFeatureGroupsByFamily({
      vix_term_structure: fg({
        dates_found: 1,
        dates_expected: 1,
        completion_pct: 100,
        feature_family: "volatility",
      }),
    });
    expect(Object.keys(grouped)).toEqual(["volatility"]);
    expect(Object.keys(grouped)).not.toContain("calendar");
  });

  it("sets completion_pct to 0 when expected is 0 (no divide by zero)", () => {
    const grouped = groupFeatureGroupsByFamily({
      empty_pre_launch: fg({
        dates_found: 0,
        dates_expected: 0,
        completion_pct: 0,
        feature_family: "calendar",
      }),
    });
    expect(grouped.calendar.completion_pct).toBe(0);
  });
});

describe("FeatureFamilyBreakdown", () => {
  it("renders empty placeholder when feature_families is empty", () => {
    render(<FeatureFamilyBreakdown feature_families={{}} />);
    expect(screen.getByTestId("feature-family-empty")).toBeTruthy();
  });

  it("renders one row per family with completion summary", () => {
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          onchain: family({
            dates_found: 90,
            dates_expected: 100,
            completion_pct: 90,
            feature_groups: {
              gas_basefee: fg({
                dates_found: 90,
                dates_expected: 100,
                completion_pct: 90,
                feature_family: "onchain",
              }),
            },
          }),
          volatility: family({
            dates_found: 100,
            dates_expected: 100,
            completion_pct: 100,
            feature_groups: {
              vix_term_structure: fg({
                dates_found: 100,
                dates_expected: 100,
                completion_pct: 100,
                feature_family: "volatility",
              }),
            },
          }),
        }}
      />,
    );

    expect(screen.getByTestId("feature-family-row-onchain")).toBeTruthy();
    expect(screen.getByTestId("feature-family-row-volatility")).toBeTruthy();
    // 90% completion + 100% completion both rendered
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("renders __unknown__ rows with a 'legacy / unstamped' label", () => {
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          __unknown__: family({
            dates_found: 5,
            dates_expected: 10,
            completion_pct: 50,
            feature_groups: {
              legacy_fg: fg({
                dates_found: 5,
                dates_expected: 10,
                completion_pct: 50,
              }),
            },
          }),
        }}
      />,
    );
    expect(screen.getByText(/legacy \/ unstamped/i)).toBeTruthy();
  });

  it("expands family on click and reveals nested feature_groups", () => {
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          onchain: family({
            dates_found: 90,
            dates_expected: 100,
            completion_pct: 90,
            feature_groups: {
              gas_basefee: fg({
                dates_found: 90,
                dates_expected: 100,
                completion_pct: 90,
                feature_family: "onchain",
              }),
            },
          }),
        }}
      />,
    );

    expect(
      screen.queryByTestId("feature-group-row-onchain-gas_basefee"),
    ).toBeNull();

    fireEvent.click(screen.getByTestId("feature-family-toggle-onchain"));

    expect(
      screen.getByTestId("feature-group-row-onchain-gas_basefee"),
    ).toBeTruthy();
  });

  it("invokes onFamilyClick when the family header is clicked", () => {
    const onFamilyClick = vi.fn();
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          onchain: family({
            dates_found: 1,
            dates_expected: 1,
            completion_pct: 100,
            feature_groups: {
              gas_basefee: fg({
                feature_family: "onchain",
                dates_found: 1,
                dates_expected: 1,
                completion_pct: 100,
              }),
            },
          }),
        }}
        onFamilyClick={onFamilyClick}
      />,
    );
    fireEvent.click(screen.getByTestId("feature-family-toggle-onchain"));
    expect(onFamilyClick).toHaveBeenCalledWith("onchain");
  });

  it("invokes onFeatureGroupClick when a child feature_group is clicked", () => {
    const onFeatureGroupClick = vi.fn();
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          onchain: family({
            dates_found: 1,
            dates_expected: 1,
            completion_pct: 100,
            feature_groups: {
              gas_basefee: fg({
                feature_family: "onchain",
                dates_found: 1,
                dates_expected: 1,
                completion_pct: 100,
              }),
            },
          }),
        }}
        onFeatureGroupClick={onFeatureGroupClick}
      />,
    );
    fireEvent.click(screen.getByTestId("feature-family-toggle-onchain"));
    fireEvent.click(
      screen.getByTestId("feature-group-row-onchain-gas_basefee"),
    );
    expect(onFeatureGroupClick).toHaveBeenCalledWith("onchain", "gas_basefee");
  });

  it("orders UAC families before __unknown__", () => {
    render(
      <FeatureFamilyBreakdown
        feature_families={{
          __unknown__: family({
            dates_found: 1,
            dates_expected: 1,
            completion_pct: 100,
            feature_groups: {
              legacy: fg({
                dates_found: 1,
                dates_expected: 1,
                completion_pct: 100,
              }),
            },
          }),
          volatility: family({
            dates_found: 1,
            dates_expected: 1,
            completion_pct: 100,
            feature_groups: {
              vix_term_structure: fg({
                feature_family: "volatility",
                dates_found: 1,
                dates_expected: 1,
                completion_pct: 100,
              }),
            },
          }),
        }}
      />,
    );
    const rows = screen
      .getAllByTestId(/^feature-family-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(rows[0]).toBe("feature-family-row-volatility");
    expect(rows[rows.length - 1]).toBe("feature-family-row-__unknown__");
  });
});
