// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { BucketCountsBadge, InstrumentsModal, SchemaModal } from "../../../src/components/DataStatusDrilldown";

vi.mock("../../../src/api/client", () => ({
  fetchShardSchema: vi.fn(),
  fetchInstrumentsForShard: vi.fn(),
  fetchBucketCounts: vi.fn(),
  fetchBundlePreview: vi.fn(),
  fetchShardInfo: vi.fn(),
  buildCsvDownloadUrl: vi.fn(
    (p: { day: string; venue: string; instrument_type: string; instrument_ids: string[]; mvp_only?: boolean }) =>
      `/api/data-status/download-csv?day=${p.day}&venue=${p.venue}&instrument_type=${p.instrument_type}&ids=${p.instrument_ids.join(",")}${p.mvp_only ? "&mvp_only=true" : ""}`,
  ),
  setApiBaseUrl: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
  smartShardDownload: vi.fn().mockResolvedValue({ status: "captured" }),
  retryFailedShard: vi.fn().mockResolvedValue({ ok: true }),
}));

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
      columns: [{ name: "price", dtype: "float64", nullable: true, description: "" }],
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

  // P4-B: SPOT_ASSET / DeFi rows expose a copyable on-chain contract address.
  // The address is only rendered when the backend actually supplied one — CeFi
  // rows carry no on-chain address, so nothing must render for them.
  it("renders a copyable contract address for a row that has one", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [
        {
          instrument_id: "UNISWAP_V3-ETHEREUM:POOL:USDC-WETH-5",
          file_uri: "gs://b/i.parquet",
          size_bytes: 1024,
          base_asset_contract_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
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
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    const btn = await screen.findByTestId("contract-address-UNISWAP_V3-ETHEREUM:POOL:USDC-WETH-5");
    // The row elides the address, so the FULL value must stay reachable.
    expect(btn.getAttribute("data-address")).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(btn.getAttribute("title")).toContain("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    // Elided display keeps the row readable.
    expect(btn.textContent).toContain("0xa0b8");
    expect(btn.textContent).toContain("eb48");
  });

  it("copies the FULL address (not the elided display) to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [
        {
          instrument_id: "P1",
          file_uri: "gs://b/i.parquet",
          size_bytes: 1024,
          base_asset_contract_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
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
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId("contract-address-P1"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    });
  });

  it("renders NO address affordance for a row without one (honest absence)", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [
        { instrument_id: "BINANCE-SPOT:SPOT_PAIR:BTC-USDT", file_uri: "gs://b/i.parquet", size_bytes: 1024 },
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
    await screen.findByText("BINANCE-SPOT:SPOT_PAIR:BTC-USDT");
    expect(screen.queryByTestId("contract-address-BINANCE-SPOT:SPOT_PAIR:BTC-USDT")).toBeNull();
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
    await waitFor(() => expect(screen.getByText("Download day CSV")).toBeTruthy());
    // No pagination / search for the full-CSV variant.
    expect(screen.queryByText(/Load more/)).toBeNull();
    expect(screen.queryByPlaceholderText(/type >= 2 chars/)).toBeNull();
  });

  // audit §F "Rollup-difference clarity": IS's per-venue/day drilldown structurally lacks a
  // data_type axis compared to MTDS's 5-axis shards — that must read as intentional, not broken.
  it("explains the by-design structural difference vs MTDS's 5-axis shards for instruments-service", async () => {
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
    const note = await screen.findByText(/structurally different from MTDS's 5-axis market-data shards by design/);
    expect(note).toBeTruthy();
    expect(note.getAttribute("title")).toContain("no data_type axis");
  });

  it("submits a direct-paste instrument_id and skips the listing", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      total_count: 1,
      instruments: [{ instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1 }],
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
    await waitFor(() => expect(screen.getByText(/Invalid instrument_id/i)).toBeTruthy());
  });

  // Regression: the debounce effect for s.length===0 previously lacked a
  // cleanup return, so the 100ms timer fired into a torn-down jsdom env after
  // unmount → "window is not defined" uncaught exception that flaked the whole
  // suite (non-deterministically). Fix: always return clearTimeout cleanup.
  it("debounce timer is cancelled on unmount — no post-unmount state update", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      total_count: 1,
      instruments: [{ instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1 }],
    });
    vi.useFakeTimers();
    const { unmount } = render(
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
    await act(async () => {
      // Flush the initial fetch
      await Promise.resolve();
    });
    // Type then clear — triggers the s.length===0 → 100ms debounce branch
    const input = screen.getByPlaceholderText(/type >= 2 chars/i);
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.change(input, { target: { value: "" } });
    // Unmount before the timer fires — the fix ensures clearTimeout is called
    unmount();
    // Advance past both debounce windows; no error should be thrown
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
  });

  // P6 phase-1 (data_status_page_ux_and_canonicalisation_2026_07_16) — "MVP
  // only" toggle on InstrumentsModalStandard.
  it("toggling 'MVP only' refetches with mvp_only=true", async () => {
    const fetchSpy = api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>;
    fetchSpy.mockResolvedValue({
      ...basePolymarketListing,
      instruments: [{ instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1024, is_mvp: true }],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("0xaaa")).toBeTruthy());
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ mvp_only: false }));

    fireEvent.click(screen.getByTestId("instruments-modal-mvp-toggle"));

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ mvp_only: true })));
  });

  it("renders an MVP badge only for rows with is_mvp: true", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [
        { instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1024, is_mvp: true },
        { instrument_id: "0xbbb", file_uri: "gs://b/t.parquet", size_bytes: 1024, is_mvp: false },
      ],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("0xaaa")).toBeTruthy());
    expect(screen.getByTestId("mvp-badge-0xaaa")).toBeTruthy();
    expect(screen.queryByTestId("mvp-badge-0xbbb")).toBeNull();
  });

  it("threads mvp_only into the CSV download URL when the toggle is on", async () => {
    (api.fetchInstrumentsForShard as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...basePolymarketListing,
      instruments: [{ instrument_id: "0xaaa", file_uri: "gs://b/t.parquet", size_bytes: 1024, is_mvp: true }],
    });
    render(
      <InstrumentsModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "prediction",
          venue: "POLYMARKET",
          day: "2025-04-01",
          instrument_type: "OTHER",
          data_type: "trades",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("0xaaa")).toBeTruthy());

    fireEvent.click(screen.getByTestId("instruments-modal-mvp-toggle"));

    await waitFor(() =>
      expect(
        (api.buildCsvDownloadUrl as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => (c[0] as { mvp_only?: boolean }).mvp_only === true,
        ),
      ).toBe(true),
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
