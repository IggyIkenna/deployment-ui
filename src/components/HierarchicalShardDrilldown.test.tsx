import { render, screen, waitFor } from "@testing-library/react";
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
});
