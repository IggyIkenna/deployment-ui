// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  BucketCountsBadge,
  InstrumentsModal,
  SchemaModal,
} from "../../../src/components/DataStatusDrilldown";

vi.mock("../../../src/api/client", () => ({
  fetchShardSchema: vi.fn(),
  fetchInstrumentsForShard: vi.fn(),
  fetchBucketCounts: vi.fn(),
  buildCsvDownloadUrl: vi.fn(
    (p: { day: string; venue: string }) =>
      `/api/data-status/download-csv?day=${p.day}&venue=${p.venue}`,
  ),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as api from "../../../src/api/client";

describe("SchemaModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders column names from the schema response", async () => {
    (api.fetchShardSchema as ReturnType<typeof vi.fn>).mockResolvedValue({
      registered: true,
      category: "cefi",
      instrument_type: "perpetual",
      data_type: "trades",
      venue: "BINANCE",
      symbol_column: "symbol",
      source: "CONTRACT_REGISTRY",
      columns: [
        {
          name: "instrument_id",
          dtype: "string",
          nullable: false,
          description: "Canonical ID",
        },
        { name: "price", dtype: "float64", nullable: false, description: "" },
      ],
    });
    render(
      <SchemaModal
        coord={{
          service: "market-tick-data-service",
          category: "cefi",
          venue: "BINANCE",
          instrument_type: "perpetual",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("instrument_id")).toBeTruthy();
      expect(screen.getByText("price")).toBeTruthy();
    });
  });

  it("shows fallback message when contract not registered", async () => {
    (api.fetchShardSchema as ReturnType<typeof vi.fn>).mockResolvedValue({
      registered: false,
      category: "prediction",
      instrument_type: "unknown",
      data_type: "unknown",
      venue: null,
      symbol_column: null,
      source: "none",
      columns: [],
      message: "No contract",
    });
    render(
      <SchemaModal
        coord={{
          service: "market-tick-data-service",
          category: "prediction",
          venue: "POLYMARKET",
          instrument_type: "unknown",
          data_type: "unknown",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No contract registered/i)).toBeTruthy();
    });
  });
});

describe("InstrumentsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists instruments with checkboxes and builds a download link", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      service: "market-tick-data-service",
      category: "prediction",
      venue: "POLYMARKET",
      day: "2025-04-01",
      instrument_type: "OTHER",
      data_type: "prediction_trades",
      bundling: "per_condition_id",
      bucket: "b",
      prefix: "p",
      instruments: [
        {
          instrument_id: "0xaaa",
          file_uri: "gs://b/ticks.parquet",
          size_bytes: 1024,
        },
        {
          instrument_id: "0xbbb",
          file_uri: "gs://b/ticks.parquet",
          size_bytes: 1024,
        },
      ],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          category: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "prediction_trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("0xaaa")).toBeTruthy();
      expect(screen.getByText("0xbbb")).toBeTruthy();
    });

    // Click "Select all" then verify download link text exists
    fireEvent.click(screen.getByText("Select all"));
    expect(screen.getByText("Download CSV")).toBeTruthy();
  });
});

describe("BucketCountsBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders '(N markets + OTHER: M)' when OTHER bucket exists", async () => {
    (api.fetchBucketCounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      named_market_count: 3,
      other_market_count: 57,
    });
    render(
      <BucketCountsBadge
        service="market-tick-data-service"
        category="prediction"
        venue="POLYMARKET"
        day="2025-04-01"
        data_type="prediction_trades"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("(3 markets + OTHER: 57)")).toBeTruthy();
    });
  });

  it("renders only named count when no OTHER bucket", async () => {
    (api.fetchBucketCounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      named_market_count: 5,
      other_market_count: 0,
    });
    render(
      <BucketCountsBadge
        service="market-tick-data-service"
        category="cefi"
        venue="BINANCE"
        day="2025-04-01"
        data_type="trades"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("(5 markets)")).toBeTruthy();
    });
  });

  it("renders nothing when both counts are zero", async () => {
    (api.fetchBucketCounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      named_market_count: 0,
      other_market_count: 0,
    });
    const { container } = render(
      <BucketCountsBadge
        service="market-tick-data-service"
        category="cefi"
        venue="BINANCE"
        day="2025-04-01"
        data_type="trades"
      />,
    );
    await waitFor(() => {
      // Component returns null, so innerHTML should be empty.
      expect(container.textContent).toBe("");
    });
  });
});
