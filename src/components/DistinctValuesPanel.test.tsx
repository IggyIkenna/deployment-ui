import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DistinctValuesPanel } from "./DistinctValuesPanel";
import * as api from "../api/client";
import type { DistinctValuesResponse } from "../api/client";

function mockDistinct(overrides: Partial<DistinctValuesResponse> = {}): DistinctValuesResponse {
  return {
    asset_group: "defi",
    source: "honest-coverage-rollup",
    source_date: "2026-07-18",
    generated_at: "2026-07-18T02:14:00+00:00",
    axes: {
      venues: [
        { value: "AAVE", is_canonical: false },
        { value: "UNISWAP_V3-ETHEREUM", is_canonical: true },
      ],
      instrument_types: [
        { value: "LENDING", is_canonical: true },
        { value: "lending", is_canonical: false },
      ],
      data_types: [
        { value: "dex_pool_state", is_canonical: true },
        { value: "dex_pools", is_canonical: false },
      ],
      chains: [
        { value: "ETHEREUM", is_canonical: true },
        { value: "HYPERLIQUID", is_canonical: false },
      ],
    },
    non_canonical_count: { venues: 1, instrument_types: 1, data_types: 1, chains: 1 },
    ...overrides,
  };
}

describe("DistinctValuesPanel", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchDistinctValues").mockResolvedValue(mockDistinct());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all four axes with their distinct raw values on initial load (defi)", async () => {
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-axis-venues")).toBeTruthy();
    });
    expect(screen.getByTestId("distinct-values-axis-instrument_types")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-axis-data_types")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-axis-chains")).toBeTruthy();
    // Both canonical + non-canonical spellings render as SEPARATE rows.
    expect(screen.getByTestId("distinct-values-row-instrument_types-LENDING")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-row-instrument_types-lending")).toBeTruthy();
    // Default asset_group is defi.
    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ asset_group: "defi" }));
  });

  it("badges non-canonical values and leaves canonical ones un-badged", async () => {
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-axis-venues")).toBeTruthy();
    });
    // is_canonical: false -> badge present.
    expect(screen.getByTestId("distinct-values-noncanon-venues-AAVE")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-noncanon-instrument_types-lending")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-noncanon-data_types-dex_pools")).toBeTruthy();
    expect(screen.getByTestId("distinct-values-noncanon-chains-HYPERLIQUID")).toBeTruthy();
    // is_canonical: true -> no badge.
    expect(screen.queryByTestId("distinct-values-noncanon-venues-UNISWAP_V3-ETHEREUM")).toBeNull();
    expect(screen.queryByTestId("distinct-values-noncanon-instrument_types-LENDING")).toBeNull();
    expect(screen.queryByTestId("distinct-values-noncanon-chains-ETHEREUM")).toBeNull();
  });

  it("shows the per-axis non-canonical count badge only when > 0", async () => {
    fetchSpy.mockResolvedValue(
      mockDistinct({
        axes: {
          venues: [{ value: "UNISWAP_V3-ETHEREUM", is_canonical: true }],
          instrument_types: [{ value: "lending", is_canonical: false }],
          data_types: [{ value: "dex_pool_state", is_canonical: true }],
          chains: [{ value: "ETHEREUM", is_canonical: true }],
        },
        non_canonical_count: { venues: 0, instrument_types: 1, data_types: 0, chains: 0 },
      }),
    );
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-axis-instrument_types")).toBeTruthy();
    });
    expect(screen.getByTestId("distinct-values-noncanon-count-instrument_types")).toBeTruthy();
    expect(screen.queryByTestId("distinct-values-noncanon-count-venues")).toBeNull();
  });

  it("omits an axis entirely when its distinct-value list is empty", async () => {
    fetchSpy.mockResolvedValue(
      mockDistinct({
        axes: {
          venues: [{ value: "AAVE", is_canonical: false }],
          instrument_types: [{ value: "LENDING", is_canonical: true }],
          data_types: [{ value: "dex_pool_state", is_canonical: true }],
          chains: [],
        },
        non_canonical_count: { venues: 1, instrument_types: 0, data_types: 0, chains: 0 },
      }),
    );
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-axis-venues")).toBeTruthy();
    });
    expect(screen.queryByTestId("distinct-values-axis-chains")).toBeNull();
  });

  it("re-fetches with the newly selected asset_group", async () => {
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-axis-venues")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("distinct-values-asset-group-select"), { target: { value: "cefi" } });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ asset_group: "cefi" }));
    });
  });

  it("shows an error state when the fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("coverage.json unavailable"));
    render(<DistinctValuesPanel />);
    await waitFor(() => {
      expect(screen.getByTestId("distinct-values-error")).toBeTruthy();
    });
  });
});
