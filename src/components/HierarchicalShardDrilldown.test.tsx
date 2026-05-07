import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import { HierarchicalShardDrilldown } from "./HierarchicalShardDrilldown";

/**
 * Regression tests for HierarchicalShardDrilldown — drilldown plan Phase 2.
 *
 * Pattern: rather than driving the full UI through Playwright for every
 * render-gate edge case, mock the API client at the module level + assert
 * which controls render at each axis level. This catches the bug class
 * Playwright surfaced 2026-05-07 (DeployMissingButton rendered on
 * partial-shard-key venue-level nodes, causing /deploy-missing-preview
 * 400s) without needing a live backend.
 */

describe("HierarchicalShardDrilldown — render-gate regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function _mockResponse(tree: apiClient.DrilldownNode[]): apiClient.DrilldownResponse {
    const captured = tree.reduce((s, n) => s + n.captured, 0);
    const empty_confirmed = tree.reduce((s, n) => s + n.empty_confirmed, 0);
    const attempted_failed = tree.reduce((s, n) => s + n.attempted_failed, 0);
    const total = captured + empty_confirmed + attempted_failed;
    return {
      service: "market-tick-data-service",
      asset_group: "tradfi",
      axes: ["venue", "data_type", "instrument_type", "instrument_id", "date"],
      tree,
      totals: {
        captured,
        empty_confirmed,
        attempted_failed,
        total,
        completion_pct: total > 0 ? Math.round((captured / total) * 10000) / 100 : 0,
      },
      filtered_by: {},
    };
  }

  function _node(partial: Partial<apiClient.DrilldownNode>): apiClient.DrilldownNode {
    return {
      axis: "venue",
      value: "TEST",
      captured: 0,
      empty_confirmed: 0,
      attempted_failed: 0,
      total: 0,
      completion_pct: 0,
      row_key: {},
      children: [],
      is_leaf: true,
      ...partial,
    };
  }

  it("renders the tree axes + totals", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({ axis: "venue", value: "CME", captured: 10, total: 10, completion_pct: 100, row_key: { venue: "CME" } }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="tradfi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/Axes:/)).toBeTruthy());
    expect(screen.getByText(/CME/)).toBeTruthy();
  });

  it("does NOT render Deploy-Missing button on captured=0 venue-level node (partial row_key)", async () => {
    // Regression: 2026-05-07 incident — clicking ↻ deploy on a
    // venue-level captured=0 node returned 400 because the row_key
    // only carried {venue}, missing data_type + day. The render gate
    // must require the FULL shard atom (venue + data_type + day).
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({
          axis: "venue",
          value: "UNKNOWN",
          captured: 0,
          attempted_failed: 5,
          total: 5,
          completion_pct: 0,
          row_key: { venue: "UNKNOWN" }, // PARTIAL — no data_type, no day.
          is_leaf: true,
        }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="tradfi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/UNKNOWN/)).toBeTruthy());
    // The button MUST NOT be rendered for this partial-shard node.
    expect(screen.queryByText(/deploy/i)).toBeNull();
  });

  it("DOES render Deploy-Missing button on captured=0 leaf with full shard atom (venue + data_type + day)", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({
          axis: "date",
          value: "2024-01-03",
          captured: 0,
          attempted_failed: 1,
          total: 1,
          completion_pct: 0,
          row_key: {
            venue: "CME",
            data_type: "trades",
            instrument_type: "FUTURE",
            instrument_id: "ESH4",
            day: "2024-01-03",
          },
          is_leaf: true,
        }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="tradfi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/2024-01-03/)).toBeTruthy());
    // Now the deploy button SHOULD render.
    expect(screen.getByText(/deploy/i)).toBeTruthy();
  });

  it("does NOT render Deploy-Missing on captured>0 leaves even with full row_key", async () => {
    // Captured shards don't need recovery; the button should hide.
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({
          axis: "date",
          value: "2024-01-03",
          captured: 1, // captured > 0 → no recovery needed.
          total: 1,
          completion_pct: 100,
          row_key: {
            venue: "CME",
            data_type: "trades",
            instrument_type: "FUTURE",
            instrument_id: "ESH4",
            day: "2024-01-03",
          },
          is_leaf: true,
        }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="tradfi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/2024-01-03/)).toBeTruthy());
    expect(screen.queryByText(/deploy/i)).toBeNull();
  });

  it("calls getHierarchicalDrilldown with the canonical (service, asset_group) + window", async () => {
    // Regression: the API client must thread service / asset_group /
    // start_date / end_date through correctly. Catches drift where a
    // refactor swaps args.
    const spy = vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="defi"
        startDate="2024-03-01"
        endDate="2024-03-04"
      />,
    );
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const callArg = spy.mock.calls[0][0];
    expect(callArg.service).toBe("market-tick-data-service");
    expect(callArg.asset_group).toBe("defi");
    expect(callArg.start_date).toBe("2024-03-01");
    expect(callArg.end_date).toBe("2024-03-04");
  });

  it("renders the empty state when tree is empty", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([]),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/No data for cefi/)).toBeTruthy(),
    );
  });

  it("renders the error state when the fetch rejects", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockRejectedValue(
      new Error("API down"),
    );
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Failed to load drill-down/),
    );
  });

  it("ignores AbortError without surfacing an error banner", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockRejectedValue(abortErr);
    render(
      <HierarchicalShardDrilldown
        service="market-tick-data-service"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    // Should not display a "Failed to load" banner — instead the empty
    // / loading state stays.
    await waitFor(() => {
      expect(screen.queryByText(/Failed to load drill-down/)).toBeNull();
    });
  });

  it("renders empty + failed pills when totals carry empty/failed counts", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue({
      service: "mtds",
      asset_group: "cefi",
      axes: ["venue", "date"],
      tree: [
        _node({
          axis: "venue",
          value: "BINANCE",
          captured: 5,
          empty_confirmed: 2,
          attempted_failed: 1,
          total: 8,
          completion_pct: 62.5,
          row_key: { venue: "BINANCE" },
        }),
      ],
      totals: {
        captured: 5,
        empty_confirmed: 2,
        attempted_failed: 1,
        total: 8,
        completion_pct: 62.5,
      },
      filtered_by: {},
    });
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/2 empty/)).toBeTruthy());
    expect(screen.getByText(/1 failed/)).toBeTruthy();
    // Per-node empty + failed badges also render.
    expect(screen.getByText(/2e/)).toBeTruthy();
    expect(screen.getByText(/1f/)).toBeTruthy();
  });

  it("renders the load-more button when total_top_axis_children exceeds shown rows", async () => {
    const spy = vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue({
      service: "mtds",
      asset_group: "cefi",
      axes: ["venue"],
      tree: [
        _node({ axis: "venue", value: "V1", captured: 1, total: 1, completion_pct: 100, row_key: { venue: "V1" } }),
      ],
      totals: { captured: 1, empty_confirmed: 0, attempted_failed: 0, total: 1, completion_pct: 100 },
      filtered_by: {},
      total_top_axis_children: 5,
      child_offset: 0,
      child_limit: 1,
    });
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
        topPageSize={1}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Showing 1 of 5/)).toBeTruthy(),
    );
    expect(screen.getByText(/Show more/)).toBeTruthy();

    // Click load-more — second fetch with bumped offset should fire.
    spy.mockResolvedValueOnce({
      service: "mtds",
      asset_group: "cefi",
      axes: ["venue"],
      tree: [
        _node({ axis: "venue", value: "V2", captured: 1, total: 1, completion_pct: 100, row_key: { venue: "V2" } }),
      ],
      totals: { captured: 1, empty_confirmed: 0, attempted_failed: 0, total: 1, completion_pct: 100 },
      filtered_by: {},
      total_top_axis_children: 5,
      child_offset: 1,
      child_limit: 1,
    });
    fireEvent.click(screen.getByText(/Show more/));
    await waitFor(() => expect(screen.getByText(/V2/)).toBeTruthy());
  });

  it("does not render load-more when shown >= total_top_axis_children", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue({
      service: "mtds",
      asset_group: "cefi",
      axes: ["venue"],
      tree: [
        _node({ axis: "venue", value: "V1", captured: 1, total: 1, completion_pct: 100, row_key: { venue: "V1" } }),
      ],
      totals: { captured: 1, empty_confirmed: 0, attempted_failed: 0, total: 1, completion_pct: 100 },
      filtered_by: {},
      total_top_axis_children: 1,
      child_offset: 0,
      child_limit: 200,
    });
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/V1/)).toBeTruthy());
    expect(screen.queryByText(/Show more/)).toBeNull();
  });

  it("expands a non-leaf node + lazy-loads children on click", async () => {
    const spy = vi
      .spyOn(apiClient, "getHierarchicalDrilldown")
      .mockResolvedValueOnce(
        _mockResponse([
          _node({
            axis: "venue",
            value: "BINANCE",
            captured: 10,
            total: 20,
            completion_pct: 50,
            row_key: { venue: "BINANCE" },
            children: [],
            is_leaf: false,
          }),
        ]),
      );
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/BINANCE/)).toBeTruthy());

    spy.mockResolvedValueOnce(
      _mockResponse([
        _node({
          axis: "data_type",
          value: "trades",
          captured: 5,
          total: 10,
          completion_pct: 50,
          row_key: { venue: "BINANCE", data_type: "trades" },
          is_leaf: false,
        }),
      ]),
    );
    fireEvent.click(
      screen.getByLabelText(/venue=BINANCE: 10 captured of 20 total/),
    );
    await waitFor(() => expect(screen.getByText(/trades/)).toBeTruthy());
  });

  it("renders the csv download link when leaf has venue + day", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({
          axis: "date",
          value: "2024-01-03",
          captured: 1,
          total: 1,
          completion_pct: 100,
          row_key: {
            venue: "CME",
            data_type: "trades",
            instrument_type: "FUTURE",
            day: "2024-01-03",
          },
          is_leaf: true,
        }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="tradfi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/csv/)).toBeTruthy());
  });

  it("does not render the csv link when leaf row_key lacks venue or day", async () => {
    vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(
      _mockResponse([
        _node({
          axis: "venue",
          value: "BINANCE",
          captured: 0,
          total: 1,
          completion_pct: 0,
          row_key: { venue: "BINANCE" }, // no day → downloadUrl null
          is_leaf: true,
        }),
      ]),
    );
    render(
      <HierarchicalShardDrilldown
        service="mtds"
        assetGroup="cefi"
        startDate="2024-01-01"
        endDate="2024-01-05"
      />,
    );
    await waitFor(() => expect(screen.getByText(/BINANCE/)).toBeTruthy());
    expect(screen.queryByText(/csv/)).toBeNull();
  });
});
