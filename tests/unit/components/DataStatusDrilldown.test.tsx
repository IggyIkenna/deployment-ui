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
  fetchBundlePreview: vi.fn(),
  fetchShardInfo: vi.fn(),
  buildCsvDownloadUrl: vi.fn(
    (p: {
      day: string;
      venue: string;
      instrument_type: string;
      instrument_ids: string[];
    }) =>
      `/api/data-status/download-csv?day=${p.day}&venue=${p.venue}&instrument_type=${p.instrument_type}&ids=${p.instrument_ids.join(",")}`,
  ),
  setApiBaseUrl: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
  smartShardDownload: vi.fn().mockResolvedValue({ status: "captured" }),
  retryFailedShard: vi.fn().mockResolvedValue({ ok: true }),
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
      source: "VENUE_CONTRACT_OVERRIDES",
      columns: [
        { name: "price", dtype: "float64", nullable: true, description: "" },
      ],
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
    // Default shard-info response — single OTHER type for Polymarket.
    (api.fetchShardInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      service: "market-tick-data-service",
      category: "prediction",
      venue: "POLYMARKET",
      day: "2025-04-01",
      data_type: "trades",
      instrument_types: [{ name: "OTHER", bundling: "per_condition_id" }],
      recommended_instrument_type: "OTHER",
    });
  });

  const basePolymarketListing = {
    service: "market-tick-data-service",
    category: "prediction",
    venue: "POLYMARKET",
    day: "2025-04-01",
    instrument_type: "OTHER",
    data_type: "trades",
    bundling: "per_condition_id" as const,
    bucket: "b",
    prefix: "p",
    total_count: 2,
    limit: 50,
    offset: 0,
    has_more: false,
    search: "",
  };

  it("lists instruments with checkboxes and builds a download link", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [
        { instrument_id: "0xaaa", file_uri: "gs://b/ticks.parquet", size_bytes: 1024 },
        { instrument_id: "0xbbb", file_uri: "gs://b/ticks.parquet", size_bytes: 1024 },
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
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("0xaaa")).toBeTruthy();
      expect(screen.getByText("0xbbb")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Select visible"));
    expect(screen.getByText("Download CSV")).toBeTruthy();
  });

  it("shows 'Load more' when has_more and pages through", async () => {
    const fetchSpy = api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>;
    fetchSpy
      .mockResolvedValueOnce({
        ...basePolymarketListing,
        total_count: 120,
        has_more: true,
        instruments: Array.from({ length: 50 }, (_, i) => ({
          instrument_id: `0x${i.toString().padStart(4, "0")}`,
          file_uri: "gs://b/ticks.parquet",
          size_bytes: 1024,
        })),
      })
      .mockResolvedValueOnce({
        ...basePolymarketListing,
        total_count: 120,
        offset: 50,
        has_more: true,
        instruments: Array.from({ length: 50 }, (_, i) => ({
          instrument_id: `0x${(i + 50).toString().padStart(4, "0")}`,
          file_uri: "gs://b/ticks.parquet",
          size_bytes: 1024,
        })),
      });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          category: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText(/Load more/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Load more/));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const secondCall = fetchSpy.mock.calls[1][0] as { offset: number };
    expect(secondCall.offset).toBe(50);
  });

  it("shows total count prominently when > page size", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      total_count: 4999,
      has_more: true,
      instruments: Array.from({ length: 50 }, (_, i) => ({
        instrument_id: `0x${i.toString().padStart(4, "0")}`,
        file_uri: "gs://b/ticks.parquet",
        size_bytes: 1024,
      })),
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          category: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("4,999")).toBeTruthy();
      expect(screen.getByText(/showing 1-50/)).toBeTruthy();
    });
  });

  it("renders bundle rows with per-underlying download buttons for per_underlying shards", async () => {
    (api.fetchShardInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      service: "market-tick-data-service",
      category: "cefi",
      venue: "DERIBIT",
      day: "2025-04-01",
      data_type: "trades",
      instrument_types: [{ name: "options_chain", bundling: "per_underlying" }],
      recommended_instrument_type: "options_chain",
    });
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      service: "market-tick-data-service",
      category: "cefi",
      venue: "DERIBIT",
      day: "2025-04-01",
      instrument_type: "options_chain",
      data_type: "trades",
      bundling: "per_underlying",
      bucket: "b",
      prefix: "p",
      total_count: 2,
      limit: 50,
      offset: 0,
      has_more: false,
      search: "",
      instruments: [
        { instrument_id: "BTC", file_uri: "gs://b/BTC.parquet", size_bytes: 2048 },
        { instrument_id: "ETH", file_uri: "gs://b/ETH.parquet", size_bytes: 2048 },
      ],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          category: "cefi",
          venue: "DERIBIT",
          day: "2025-04-01",
          instrument_type: "options_chain",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Download BTC bundle")).toBeTruthy();
      expect(screen.getByText("Download ETH bundle")).toBeTruthy();
    });
    // Bundled flow should not render the search/paste fields.
    expect(screen.queryByPlaceholderText(/type >= 2 chars/)).toBeNull();
  });

  it("renders a single 'Download day CSV' button for instruments-service", async () => {
    render(
      <InstrumentsModal
        coord={{
          service: "instruments-service",
          category: "cefi",
          venue: "BINANCE",
          day: "2025-04-01",
          instrument_type: "perpetual",
          data_type: "instruments",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Download day CSV")).toBeTruthy(),
    );
    // No pagination / search for the full-CSV variant.
    expect(screen.queryByText(/Load more/)).toBeNull();
    expect(screen.queryByPlaceholderText(/type >= 2 chars/)).toBeNull();
  });

  it("submits a direct-paste instrument_id and skips the listing", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      total_count: 1,
      instruments: [
        { instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1 },
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
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("0xaaa")).toBeTruthy());
    const paste = screen.getByPlaceholderText(/paste exact ID/);
    fireEvent.change(paste, { target: { value: "0xdeadbeef" } });
    fireEvent.click(screen.getByText("Download"));
    expect(
      (api.buildCsvDownloadUrl as ReturnType<typeof vi.fn>).mock.calls.some(
        (c) => (c[0] as { instrument_ids: string[] }).instrument_ids[0] === "0xdeadbeef",
      ),
    ).toBe(true);
  });

  it("rejects invalid paste instrument_id and shows an error", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      total_count: 0,
      instruments: [],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          category: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByPlaceholderText(/paste exact ID/)).toBeTruthy());
    const paste = screen.getByPlaceholderText(/paste exact ID/);
    fireEvent.change(paste, { target: { value: "BTC USDT" } });
    fireEvent.click(screen.getByText("Download"));
    await waitFor(() =>
      expect(screen.getByText(/Invalid instrument_id/i)).toBeTruthy(),
    );
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
        data_type="trades"
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
