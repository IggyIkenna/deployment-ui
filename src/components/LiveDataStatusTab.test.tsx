/**
 * LiveDataStatusTab — Phase 11.3 scaffold smoke tests.
 *
 * Plan: live_pipeline_mtds_mdps_features_2026_05_08.md Phase 11.3.
 *
 * Pins the four render branches (loading, empty, populated, error) so the
 * tab can be wired into the existing tabs surface ahead of Phase 5/6
 * implementation.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LiveStatusResponse } from "./LiveDataStatusTab";
import { LiveDataStatusTab } from "./LiveDataStatusTab";

function _mkResponse(
  overrides: Partial<LiveStatusResponse> = {},
): LiveStatusResponse {
  return {
    status: "ok",
    rows: [],
    asset_groups: [],
    refreshed_at: "2026-05-11T00:00:00Z",
    ...overrides,
  };
}

describe("LiveDataStatusTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the loading state on initial mount", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})), // never resolves
    );
    render(<LiveDataStatusTab />);
    expect(screen.getByTestId("live-status-loading")).toBeInTheDocument();
  });

  it("renders the empty-state when endpoint returns zero rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(_mkResponse()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<LiveDataStatusTab />);
    const empty = await screen.findByTestId("live-status-empty");
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent(/No live shards reporting yet/);
    expect(empty).toHaveTextContent("2026-05-11T00:00:00Z");
  });

  it("renders the populated state when endpoint returns rows", async () => {
    const response = _mkResponse({
      rows: [
        {
          asset_group: "defi",
          venue: "uniswap_v3",
          chain: "arbitrum",
          data_type: "OHLCV_1M",
          instrument_type: null,
          instrument_id: "ETH-USDC",
          league_id: null,
          timeframe: "1m",
          feature_group: null,
          capture_status: "captured",
          staleness_seconds: 3.2,
          degraded_ratio_60s: 0,
          cluster_pct_skipped_60s: 0,
          last_candle_emitted_at: "2026-05-11T00:00:03Z",
        },
      ],
      asset_groups: ["defi"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<LiveDataStatusTab />);
    await waitFor(() => {
      expect(screen.getByTestId("live-status-table")).toBeInTheDocument();
    });
    expect(screen.getByText(/defi \/ uniswap_v3/)).toBeInTheDocument();
    expect(screen.getByText("captured")).toBeInTheDocument();
  });

  it("renders the summary panel with total + breakdown when populated", async () => {
    const baseRow = {
      asset_group: "cefi" as const,
      venue: "binance",
      chain: null,
      data_type: "OHLCV_1M",
      instrument_type: null,
      instrument_id: "BTC-USDT",
      league_id: null,
      timeframe: "1m",
      feature_group: null,
      degraded_ratio_60s: 0,
      cluster_pct_skipped_60s: 0,
      last_candle_emitted_at: null,
    };
    const response = _mkResponse({
      rows: [
        {
          ...baseRow,
          capture_status: "captured" as const,
          staleness_seconds: 2.0,
        },
        {
          ...baseRow,
          capture_status: "captured" as const,
          staleness_seconds: 45.0,
          instrument_id: "ETH-USDT",
        },
        {
          ...baseRow,
          capture_status: "attempted_failed" as const,
          staleness_seconds: 90.0,
          instrument_id: "SOL-USDT",
        },
      ],
      asset_groups: ["cefi"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<LiveDataStatusTab />);
    await waitFor(() => {
      expect(screen.getByTestId("live-status-summary")).toBeInTheDocument();
    });
    // Summary section shows totals + the FailurePillarStack for attempted_failed.
    const summary = screen.getByTestId("live-status-summary");
    expect(summary).toHaveTextContent("Total shards");
    expect(summary).toHaveTextContent("3"); // total
    expect(summary).toHaveTextContent("Stale (≥30s)");
    expect(summary).toHaveTextContent("2"); // 45s + 90s rows are stale
    // FailurePillarStack widget reused for the attempted_failed breakdown.
    expect(
      screen.getByTestId("live-status-failure-pillar-stack"),
    ).toBeInTheDocument();
  });

  it("renders capture_status as colored badges per the 4-state taxonomy", async () => {
    const baseRow = {
      asset_group: "cefi" as const,
      venue: "binance",
      chain: null,
      data_type: "OHLCV_1M",
      instrument_type: null,
      league_id: null,
      timeframe: "1m",
      feature_group: null,
      staleness_seconds: 5.0,
      degraded_ratio_60s: 0,
      cluster_pct_skipped_60s: 0,
      last_candle_emitted_at: null,
    };
    const response = _mkResponse({
      rows: [
        { ...baseRow, capture_status: "captured" as const, instrument_id: "1" },
        {
          ...baseRow,
          capture_status: "empty_confirmed" as const,
          instrument_id: "2",
        },
        {
          ...baseRow,
          capture_status: "attempted_failed" as const,
          instrument_id: "3",
        },
        {
          ...baseRow,
          capture_status: "expected_unattempted" as const,
          instrument_id: "4",
        },
      ],
      asset_groups: ["cefi"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<LiveDataStatusTab />);
    await waitFor(() => {
      expect(screen.getByTestId("live-status-table")).toBeInTheDocument();
    });
    for (let i = 0; i < 4; i++) {
      expect(
        screen.getByTestId(`live-status-capture-status-${i}`),
      ).toBeInTheDocument();
    }
  });

  it("derives staleness-warning + crit thresholds from row.staleness_seconds", async () => {
    const baseRow = {
      asset_group: "cefi" as const,
      venue: "binance",
      chain: null,
      data_type: "OHLCV_1M",
      instrument_type: null,
      instrument_id: "BTC-USDT",
      league_id: null,
      timeframe: "1m",
      feature_group: null,
      capture_status: "captured" as const,
      degraded_ratio_60s: 0,
      cluster_pct_skipped_60s: 0,
      last_candle_emitted_at: null,
    };
    const response = _mkResponse({
      rows: [
        { ...baseRow, staleness_seconds: 5.0, instrument_id: "FRESH" },
        { ...baseRow, staleness_seconds: 45.0, instrument_id: "WARN" },
        { ...baseRow, staleness_seconds: 120.0, instrument_id: "CRIT" },
      ],
      asset_groups: ["cefi"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    render(<LiveDataStatusTab />);
    await waitFor(() => {
      expect(screen.getByTestId("live-status-staleness-0")).toBeInTheDocument();
    });
    expect(screen.getByTestId("live-status-staleness-0")).toHaveTextContent(
      "5.0s",
    );
    expect(screen.getByTestId("live-status-staleness-1")).toHaveTextContent(
      "45.0s",
    );
    expect(screen.getByTestId("live-status-staleness-2")).toHaveTextContent(
      "2.0m",
    );
  });

  it("renders the error state when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    render(<LiveDataStatusTab />);
    const err = await screen.findByTestId("live-status-error");
    expect(err).toBeInTheDocument();
    expect(err).toHaveTextContent("network down");
  });

  it("propagates the asset_group query-param filter", async () => {
    const spy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(_mkResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", spy);
    render(<LiveDataStatusTab assetGroups={["defi", "cefi"]} />);
    await screen.findByTestId("live-status-empty");
    expect(spy).toHaveBeenCalledWith(
      "/api/data-status/live?asset_group=defi&asset_group=cefi",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });
});
