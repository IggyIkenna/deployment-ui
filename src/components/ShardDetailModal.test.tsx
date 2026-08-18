import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShardDetailModal } from "./ShardDetailModal";
import * as api from "../api/client";
import type { ShardDetailResponse } from "../api/client";

function baseResponse(overrides: Partial<ShardDetailResponse> = {}): ShardDetailResponse {
  return {
    coord: {
      service: "market-tick-data-service",
      asset_group: "CEFI",
      instrument_type: "PERPETUAL",
      data_type: "TRADES",
      day: "2026-04-18",
      venue: "BINANCE",
      underlying: null,
      instrument_id: "BTC-USD",
    },
    shard_class: "per_symbol",
    schema: {
      registered: true,
      source: "CONTRACT_REGISTRY",
      symbol_column: "symbol",
      columns: [
        {
          name: "ts",
          dtype: "timestamp[us]",
          nullable: false,
          required: true,
          provided_by_venues: null,
          description: "Trade timestamp",
        },
        {
          name: "price",
          dtype: "float64",
          nullable: false,
          required: true,
          provided_by_venues: null,
          description: "Trade price",
        },
        {
          name: "side_flag",
          dtype: "int8",
          nullable: true,
          required: false,
          provided_by_venues: ["DERIBIT", "BINANCE"],
          description: "Deribit-specific side flag",
        },
      ],
      message: "",
    },
    gcs: {
      path: "gs://bucket/BINANCE/2026-04-18/trades.parquet",
      file_size_bytes: 1048576,
      row_count: 5000,
      captured_at: "2026-04-18T10:00:00Z",
      capture_status: "captured",
      error_reason: null,
    },
    download_urls: {
      parquet_signed_url: "https://storage.googleapis.com/signed?token=abc",
      csv_projected: "/api/data-status/shard-detail/csv?id=xyz",
    },
    sample_rows: [
      { ts: "2026-04-18T10:00:00Z", price: 65000.12, side_flag: 1 },
      { ts: "2026-04-18T10:00:01Z", price: 65001.5, side_flag: null },
      { ts: "2026-04-18T10:00:02Z", price: 65002.7, side_flag: 1 },
    ],
    payload_grouped: null,
    payload_per_symbol: {
      instrument_list: [{ instrument_id: "BTC-USD", type: "PERPETUAL" }],
    },
    payload_reference: null,
    payload_fixtures: null,
    ...overrides,
  };
}

describe("ShardDetailModal", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchShardDetail");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders schema tab: splits core vs venue-specific columns", async () => {
    fetchSpy.mockResolvedValue(baseResponse());
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-core-columns")).toBeTruthy();
    });
    expect(screen.getByTestId("shard-detail-venue-columns")).toBeTruthy();

    // ts + price are core, side_flag is venue-specific
    expect(screen.getByTestId("shard-detail-column-ts")).toBeTruthy();
    expect(screen.getByTestId("shard-detail-column-price")).toBeTruthy();
    expect(screen.getByTestId("shard-detail-column-side_flag")).toBeTruthy();
    // Venue pill
    const pill = screen.getByTestId("shard-detail-venue-pill-side_flag");
    expect(pill.textContent).toContain("DERIBIT");
    expect(pill.textContent).toContain("BINANCE");
  });

  it("renders sample rows tab with 3 mock rows", async () => {
    fetchSpy.mockResolvedValue(baseResponse());
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-sample")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-sample"));
    const body = screen.getByTestId("shard-detail-tab-body-sample");
    expect(body.textContent).toContain("65000.12");
    expect(body.textContent).toContain("65001.5");
    expect(body.textContent).toContain("65002.7");
    // null side_flag rendered as NULL
    expect(body.textContent).toContain("NULL");
  });

  it("renders payload tab — per_symbol echoes instrument_id", async () => {
    fetchSpy.mockResolvedValue(baseResponse());
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-payload")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-payload"));
    const body = screen.getByTestId("shard-detail-tab-body-payload");
    expect(body.textContent).toContain("BTC-USD");
    expect(body.textContent).toContain("PERPETUAL");
  });

  it("renders grouped payload — instrument_list table", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        shard_class: "grouped",
        payload_per_symbol: null,
        payload_grouped: {
          instrument_list: [
            { key: "BTC-PERP", type: "PERPETUAL" },
            { key: "ETH-PERP", type: "PERPETUAL" },
          ],
        },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "OPTIONS_CHAIN",
          day: "2026-04-18",
          venue: "DERIBIT",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-payload")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-payload"));
    expect(screen.getByTestId("shard-detail-tab-body-payload").textContent).toContain("BTC-PERP");
  });

  // P6 UI reachability fix (data_status_page_ux_and_canonicalisation_2026_07_16
  // P6) — InstrumentsModalStandard (search + pagination + multi-select CSV +
  // MVP toggle/badge) was unreachable from the live UI (its only opener was
  // removed by commit f4a8e4e without cleanup). ShardDetailModal now nests it
  // for "grouped" shards via a "Browse & search all instruments" trigger.
  it("grouped payload — 'Browse & search all instruments' opens the nested InstrumentsModal", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        coord: {
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "OPTIONS_CHAIN",
          day: "2026-04-18",
          venue: "DERIBIT",
          underlying: null,
          instrument_id: null,
        },
        shard_class: "grouped",
        payload_per_symbol: null,
        payload_grouped: {
          instrument_list: [
            { key: "BTC-PERP", type: "PERPETUAL" },
            { key: "ETH-PERP", type: "PERPETUAL" },
          ],
        },
      }),
    );
    const instrumentsSpy = vi.spyOn(api, "fetchInstrumentsForShard").mockResolvedValue({
      service: "market-tick-data-service",
      asset_group: "CEFI",
      venue: "DERIBIT",
      day: "2026-04-18",
      instrument_type: "PERPETUAL",
      data_type: "OPTIONS_CHAIN",
      bundling: "per_symbol",
      bucket: "b",
      prefix: "p",
      instruments: [{ instrument_id: "BTC-PERP", file_uri: "gs://b/x.parquet", size_bytes: 10, is_mvp: true }],
      total_count: 1,
      limit: 50,
      offset: 0,
      has_more: false,
      search: "",
    });
    vi.spyOn(api, "fetchShardInfo").mockResolvedValue({
      service: "market-tick-data-service",
      asset_group: "CEFI",
      venue: "DERIBIT",
      day: "2026-04-18",
      data_type: "OPTIONS_CHAIN",
      instrument_types: [{ name: "PERPETUAL", bundling: "per_symbol" }],
      recommended_instrument_type: "PERPETUAL",
    });

    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "OPTIONS_CHAIN",
          day: "2026-04-18",
          venue: "DERIBIT",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-payload")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-payload"));

    const browseBtn = screen.getByTestId("shard-detail-browse-instruments");
    fireEvent.click(browseBtn);

    await waitFor(() => {
      expect(instrumentsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ service: "market-tick-data-service", asset_group: "CEFI", venue: "DERIBIT" }),
      );
    });
    await waitFor(() => {
      // Unambiguous — "BTC-PERP" also appears in the read-only payload table
      // behind the nested modal, so scope to InstrumentsModalStandard's own
      // per-instrument row testid.
      expect(screen.getByTestId("shard-row-BTC-PERP")).toBeTruthy();
    });
  });

  it("renders reference payload with first-500 truncation note", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      instrument_id: `INST-${i}`,
      symbol: `SYM-${i}`,
    }));
    fetchSpy.mockResolvedValue(
      baseResponse({
        shard_class: "reference",
        payload_per_symbol: null,
        payload_reference: { instrument_definitions: rows },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "instruments-service",
          asset_group: "CEFI",
          instrument_type: "OPTIONS",
          data_type: "INSTRUMENT_DEFINITIONS",
          day: "2026-04-18",
          venue: "DERIBIT",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-payload")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-payload"));
    expect(screen.getByTestId("shard-detail-truncation-note").textContent).toContain("500");
  });

  it("renders fixtures payload with home/away/kickoff columns", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        shard_class: "fixtures",
        payload_per_symbol: null,
        payload_fixtures: {
          fixtures: [
            {
              home_team: "Arsenal",
              away_team: "Liverpool",
              kickoff_ts: "2026-04-18T14:00:00Z",
              markets: ["MATCH_ODDS", "BTTS"],
            },
          ],
        },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "sports-fixtures-service",
          asset_group: "SPORTS",
          instrument_type: "FIXTURES",
          data_type: "FIXTURES",
          day: "2026-04-18",
          venue: "SFI",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-payload")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-payload"));
    const body = screen.getByTestId("shard-detail-tab-body-payload");
    expect(body.textContent).toContain("Arsenal");
    expect(body.textContent).toContain("Liverpool");
    expect(body.textContent).toContain("MATCH_ODDS");
  });

  it("download tab — parquet button opens signed URL in new tab", async () => {
    fetchSpy.mockResolvedValue(baseResponse());
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as unknown as Window);

    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-download")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-download"));
    const btn = screen.getByTestId("shard-detail-download-parquet") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(openSpy).toHaveBeenCalledWith("https://storage.googleapis.com/signed?token=abc", "_blank");
  });

  it("download tab — csv button calls fetch", async () => {
    fetchSpy.mockResolvedValue(baseResponse());
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("col1,col2\n1,2\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      }),
    );
    // jsdom lacks createObjectURL / revokeObjectURL
    if (!URL.createObjectURL) {
      (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => "blob:fake";
    }
    if (!URL.revokeObjectURL) {
      (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    }

    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-download")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-download"));
    const csv = screen.getByTestId("shard-detail-download-csv") as HTMLButtonElement;
    fireEvent.click(csv);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/data-status/shard-detail/csv?id=xyz", { headers: {} });
    });
  });

  it("disables download buttons when capture_status is missing", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        gcs: {
          path: null,
          file_size_bytes: null,
          row_count: null,
          captured_at: null,
          capture_status: "missing",
          error_reason: null,
        },
        download_urls: {
          parquet_signed_url: null,
          csv_projected: null,
        },
        sample_rows: [],
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-download")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("shard-detail-tab-download"));
    const parquet = screen.getByTestId("shard-detail-download-parquet") as HTMLButtonElement;
    const csv = screen.getByTestId("shard-detail-download-csv") as HTMLButtonElement;
    expect(parquet.disabled).toBe(true);
    expect(csv.disabled).toBe(true);

    // Sample rows tab shows the empty sentinel
    fireEvent.click(screen.getByTestId("shard-detail-tab-sample"));
    expect(screen.getByTestId("shard-detail-tab-body-sample").textContent).toContain("No rows");

    // capture_status badge reads "missing"
    const cap = screen.getByTestId("shard-detail-capture-status");
    expect(cap.getAttribute("data-capture-status")).toBe("missing");
  });

  it("renders 'no contract registered' yellow banner when schema.registered=false", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        schema: {
          registered: false,
          source: "none",
          symbol_column: null,
          columns: [],
          message: "schema missing",
        },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-tab-body-schema")).toBeTruthy();
    });
    const body = screen.getByTestId("shard-detail-tab-body-schema");
    expect(body.textContent).toContain("No contract registered");
    expect(body.textContent).toContain("No columns declared");
    expect(body.textContent).toContain("schema missing");
  });

  it("renders error_reason red panel when gcs.error_reason is set", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        gcs: {
          path: "gs://bucket/failed.parquet",
          file_size_bytes: null,
          row_count: null,
          captured_at: null,
          capture_status: "attempted_failed",
          error_reason: "429 Too Many Requests from venue",
        },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-error-reason")).toBeTruthy();
    });
    expect(screen.getByTestId("shard-detail-error-reason").textContent).toContain("429");
  });

  it("renders schema-only venue-specific columns (no core columns)", async () => {
    fetchSpy.mockResolvedValue(
      baseResponse({
        schema: {
          registered: true,
          source: "VENUE_CONTRACT_OVERRIDES",
          symbol_column: null,
          columns: [
            {
              name: "oi",
              dtype: "float64",
              nullable: true,
              required: false,
              provided_by_venues: ["DERIBIT"],
              description: "Open interest (Deribit only)",
            },
          ],
          message: "",
        },
      }),
    );
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "DERIBIT",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-venue-columns")).toBeTruthy();
    });
    expect(screen.queryByTestId("shard-detail-core-columns")).toBeNull();
  });

  it("renders error state when fetch fails", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    render(
      <ShardDetailModal
        coord={{
          service: "market-tick-data-service",
          asset_group: "CEFI",
          instrument_type: "PERPETUAL",
          data_type: "TRADES",
          day: "2026-04-18",
          venue: "BINANCE",
          instrument_id: "BTC-USD",
        }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("shard-detail-error")).toBeTruthy();
    });
  });
});
