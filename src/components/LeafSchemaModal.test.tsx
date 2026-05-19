import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  LeafSchemaModal,
  nanRatioColor,
  formatNanRatio,
  completenessColor,
} from "./LeafSchemaModal";
import type { LeafParquetStatsResponse } from "../api/client";
import * as apiClient from "../api/client";

// Mocks the API client's fetchLeafParquetStats so the modal can be
// rendered against fixture responses without hitting the network.
vi.mock("../api/client", async (importActual) => {
  const actual = await importActual<typeof apiClient>();
  return {
    ...actual,
    fetchLeafParquetStats: vi.fn(),
  };
});

const COORD = {
  service: "market-tick-data-service",
  asset_group: "CEFI",
  instrument_type: "PERPETUAL",
  data_type: "trades",
  day: "2026-04-18",
  venue: "BINANCE",
  underlying: null,
  instrument_id: "BTC-USDT",
};

function makeResponse(
  partial: Partial<LeafParquetStatsResponse> = {},
): LeafParquetStatsResponse {
  return {
    coord: {
      service: COORD.service,
      asset_group: COORD.asset_group,
      instrument_type: COORD.instrument_type,
      data_type: COORD.data_type,
      day: COORD.day,
      venue: COORD.venue,
      underlying: null,
      instrument_id: COORD.instrument_id,
    },
    gs_uri: "gs://bucket-x/path/parquet",
    available: true,
    error_reason: null,
    row_count: 0,
    column_count: 0,
    columns: [],
    available_at: {
      present: false,
      min_iso: null,
      max_iso: null,
      null_count: 0,
    },
    completeness: {
      present: false,
      min_fraction: null,
      max_fraction: null,
      mean_fraction: null,
      null_count: 0,
      incomplete_window_present_count: 0,
    },
    file_size_bytes: null,
    truncated: false,
    truncated_at_rows: null,
    ...partial,
  };
}

describe("nanRatioColor", () => {
  it("zero ratio returns muted text color", () => {
    expect(nanRatioColor(0)).toBe("var(--color-text-muted)");
  });
  it("0.05 returns yellow", () => {
    expect(nanRatioColor(0.05)).toBe("var(--color-accent-yellow)");
  });
  it("0.20 returns amber", () => {
    expect(nanRatioColor(0.2)).toBe("var(--color-accent-amber)");
  });
  it("0.55 returns red", () => {
    expect(nanRatioColor(0.55)).toBe("var(--color-accent-red)");
  });
  it("boundary 0.10 inclusive returns amber (not yellow)", () => {
    expect(nanRatioColor(0.1)).toBe("var(--color-accent-amber)");
  });
  it("boundary 0.50 inclusive returns red (not amber)", () => {
    expect(nanRatioColor(0.5)).toBe("var(--color-accent-red)");
  });
});

describe("formatNanRatio", () => {
  it("zero formats as 0%", () => {
    expect(formatNanRatio(0)).toBe("0%");
  });
  it("very small ratio formats as <0.01%", () => {
    expect(formatNanRatio(0.000001)).toBe("<0.01%");
  });
  it("0.25 formats with 2 decimals", () => {
    expect(formatNanRatio(0.25)).toBe("25.00%");
  });
});

describe("LeafSchemaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockReturnValue(
      new Promise(() => {}),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    expect(screen.getByTestId("leaf-schema-loading")).toBeTruthy();
  });

  it("renders fetch error", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockRejectedValue(
      new Error("network exploded"),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("leaf-schema-error")).toBeTruthy();
    });
    expect(screen.getByTestId("leaf-schema-error").textContent).toContain(
      "network exploded",
    );
  });

  it("renders unavailable state with error_reason", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        available: false,
        error_reason: "RuntimeError: simulated parquet corruption",
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("leaf-schema-unavailable")).toBeTruthy();
    });
    expect(screen.getByTestId("leaf-schema-unavailable").textContent).toContain(
      "simulated parquet corruption",
    );
  });

  it("renders missing available_at envelope as a contract violation", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        row_count: 100,
        column_count: 1,
        columns: [
          {
            name: "price",
            dtype: "float64",
            non_null_count: 100,
            null_count: 0,
            nan_ratio: 0,
          },
        ],
        available_at: {
          present: false,
          min_iso: null,
          max_iso: null,
          null_count: 0,
        },
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("leaf-schema-available-at-missing"),
      ).toBeTruthy();
    });
  });

  it("renders successful payload with per-column stats + available_at envelope", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        row_count: 1000,
        column_count: 3,
        columns: [
          {
            name: "ts_event",
            dtype: "datetime64[ns, UTC]",
            non_null_count: 1000,
            null_count: 0,
            nan_ratio: 0,
          },
          {
            name: "price",
            dtype: "float64",
            non_null_count: 850,
            null_count: 150,
            nan_ratio: 0.15,
          },
          {
            name: "size",
            dtype: "int64",
            non_null_count: 1000,
            null_count: 0,
            nan_ratio: 0,
          },
        ],
        available_at: {
          present: true,
          min_iso: "2026-04-18T00:00:00Z",
          max_iso: "2026-04-18T23:59:59Z",
          null_count: 0,
        },
        file_size_bytes: 1024 * 1024 * 5,
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("leaf-schema-body")).toBeTruthy();
    });

    expect(screen.getByTestId("leaf-schema-row-count").textContent).toContain(
      "1,000",
    );
    expect(screen.getByTestId("leaf-schema-col-count").textContent).toContain(
      "3",
    );
    expect(screen.getByTestId("leaf-schema-available-at-present")).toBeTruthy();
    expect(screen.getByTestId("leaf-schema-column-ts_event")).toBeTruthy();
    expect(screen.getByTestId("leaf-schema-column-price")).toBeTruthy();
    expect(screen.getByTestId("leaf-schema-column-size")).toBeTruthy();

    // Amber color on the 15% NaN ratio column.
    const priceNanCell = screen.getByTestId("leaf-schema-nan-ratio-price");
    expect(priceNanCell.style.color).toBe("var(--color-accent-amber)");
    expect(priceNanCell.textContent).toBe("15.00%");

    // Muted color on the 0% NaN ratio column.
    const sizeNanCell = screen.getByTestId("leaf-schema-nan-ratio-size");
    expect(sizeNanCell.style.color).toBe("var(--color-text-muted)");
  });

  it("renders truncated hint when parquet exceeds row limit", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        row_count: 500_000,
        column_count: 2,
        columns: [
          {
            name: "x",
            dtype: "float64",
            non_null_count: 500_000,
            null_count: 0,
            nan_ratio: 0,
          },
          {
            name: "y",
            dtype: "float64",
            non_null_count: 500_000,
            null_count: 0,
            nan_ratio: 0,
          },
        ],
        available_at: {
          present: true,
          min_iso: "2026-04-18T00:00:00Z",
          max_iso: "2026-04-18T23:59:59Z",
          null_count: 0,
        },
        truncated: true,
        truncated_at_rows: 500_000,
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("leaf-schema-truncated")).toBeTruthy();
    });
  });
});

describe("completenessColor (writegate slice (b) Phase 5.5)", () => {
  it("null returns muted text color", () => {
    expect(completenessColor(null)).toBe("var(--color-text-muted)");
  });
  it("1.0 returns green", () => {
    expect(completenessColor(1.0)).toBe("var(--color-accent-green)");
  });
  it("0.995 returns yellow", () => {
    expect(completenessColor(0.995)).toBe("var(--color-accent-yellow)");
  });
  it("0.97 returns amber", () => {
    expect(completenessColor(0.97)).toBe("var(--color-accent-amber)");
  });
  it("0.85 returns red", () => {
    expect(completenessColor(0.85)).toBe("var(--color-accent-red)");
  });
  it("boundary 0.95 inclusive returns amber (not red)", () => {
    expect(completenessColor(0.95)).toBe("var(--color-accent-amber)");
  });
  it("boundary 0.99 inclusive returns yellow (not amber)", () => {
    expect(completenessColor(0.99)).toBe("var(--color-accent-yellow)");
  });
});

describe("LeafSchemaModal completeness envelope rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders absent state when completeness.present=false", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        available: true,
        row_count: 24,
        column_count: 5,
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("leaf-schema-completeness-absent"),
      ).toBeTruthy();
    });
  });

  it("renders present state with min/max/mean when completeness.present=true", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        available: true,
        row_count: 24,
        column_count: 5,
        completeness: {
          present: true,
          min_fraction: 0.95,
          max_fraction: 1.0,
          mean_fraction: 0.99,
          null_count: 0,
          incomplete_window_present_count: 1,
        },
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("leaf-schema-completeness-present"),
      ).toBeTruthy();
    });
    const block = screen.getByTestId("leaf-schema-completeness-present");
    expect(block.textContent).toContain("0.950");
    expect(block.textContent).toContain("1.000");
    expect(block.textContent).toContain("0.990");
    expect(block.textContent).toContain("incomplete_window: 1");
  });

  it("renders null fractions as em-dash when completeness all rows null", async () => {
    vi.mocked(apiClient.fetchLeafParquetStats).mockResolvedValue(
      makeResponse({
        available: true,
        row_count: 24,
        column_count: 5,
        completeness: {
          present: true,
          min_fraction: null,
          max_fraction: null,
          mean_fraction: null,
          null_count: 24,
          incomplete_window_present_count: 0,
        },
      }),
    );
    render(<LeafSchemaModal coord={COORD} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(
        screen.getByTestId("leaf-schema-completeness-present"),
      ).toBeTruthy();
    });
    const block = screen.getByTestId("leaf-schema-completeness-present");
    expect(block.textContent).toContain("null_count: 24");
    expect(block.textContent).toContain("—");
  });
});
