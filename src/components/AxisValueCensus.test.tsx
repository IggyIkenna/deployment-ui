import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AxisValueCensus } from "./AxisValueCensus";
import * as api from "../api/client";
import type { AxisValueCensus as AxisValueCensusResponse } from "../api/client";

function mockCensus(overrides: Partial<AxisValueCensusResponse> = {}): AxisValueCensusResponse {
  return {
    service: "instruments-service",
    asset_group: "defi",
    row_count: 5,
    axes: {
      venue: [
        { value: "BINANCE-SPOT", count: 3 },
        { value: "JITO", count: 1 },
        { value: "JITO-SOLANA", count: 1 },
      ],
      chain: [{ value: "SOLANA", count: 2 }],
      instrument_type: [
        { value: "SPOT_PAIR", count: 1 },
        { value: "spot", count: 1 },
        { value: "spot_pair", count: 1 },
        { value: "POOL", count: 2 },
      ],
      data_type: [
        { value: "trades", count: 3 },
        { value: "dex_pools", count: 2 },
      ],
    },
    truncated_axes: [],
    ...overrides,
  };
}

describe("AxisValueCensus", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchAxisValueCensus").mockResolvedValue(mockCensus());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every axis with its raw distinct values + counts on initial load", async () => {
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-axis-venue")).toBeTruthy();
    });
    // Raw duplicate spellings both render as SEPARATE rows — never merged.
    expect(screen.getByTestId("axis-value-census-row-instrument_type-spot")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-row-instrument_type-SPOT_PAIR")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-row-instrument_type-spot_pair")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-row-venue-JITO")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-row-venue-JITO-SOLANA")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ service: "instruments-service", asset_group: "cefi" }),
    );
  });

  it("flags raw instrument_type values that fold to the same canonical label", async () => {
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-axis-instrument_type")).toBeTruthy();
    });
    // spot / SPOT_PAIR / spot_pair all canonicalise to SPOT_PAIR -> flagged.
    expect(screen.getByTestId("axis-value-census-dup-flag-instrument_type-spot")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-dup-flag-instrument_type-SPOT_PAIR")).toBeTruthy();
    expect(screen.getByTestId("axis-value-census-dup-flag-instrument_type-spot_pair")).toBeTruthy();
    // POOL has only one canonical spelling present -> not flagged.
    expect(screen.queryByTestId("axis-value-census-dup-flag-instrument_type-POOL")).toBeNull();
    // venue axis never flags (no registry-backed canonicalisation) — bare vs
    // chain-suffixed duplicates stay visible but unflagged.
    expect(screen.queryByTestId("axis-value-census-dup-flag-venue-JITO")).toBeNull();
  });

  it("omits an axis key entirely when the column is absent (honest-absence)", async () => {
    fetchSpy.mockResolvedValue(
      mockCensus({
        axes: {
          venue: [{ value: "BINANCE-FUTURES", count: 2 }],
          instrument_type: [{ value: "PERPETUAL", count: 2 }],
          data_type: [{ value: "trades", count: 2 }],
        },
      }),
    );
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-axis-venue")).toBeTruthy();
    });
    expect(screen.queryByTestId("axis-value-census-axis-chain")).toBeNull();
  });

  it("shows a truncated badge when the backend caps a high-cardinality axis", async () => {
    fetchSpy.mockResolvedValue(mockCensus({ truncated_axes: ["venue"] }));
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-axis-venue")).toBeTruthy();
    });
    expect(screen.getByTestId("axis-value-census-axis-venue").textContent).toContain("truncated");
  });

  it("re-fetches with the newly selected asset_group", async () => {
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-axis-venue")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("axis-value-census-asset-group-select"), { target: { value: "defi" } });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ service: "instruments-service", asset_group: "defi" }),
      );
    });
  });

  it("shows an error state when the fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("gcs unavailable"));
    render(<AxisValueCensus />);
    await waitFor(() => {
      expect(screen.getByTestId("axis-value-census-error")).toBeTruthy();
    });
  });
});
