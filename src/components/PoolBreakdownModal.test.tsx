import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "../api/client";
import { PoolBreakdownModal } from "./PoolBreakdownModal";

// Small fixture mirroring the shape returned by /api/data-status/pools/breakdown.
const fixtureSmall: apiClient.PoolBreakdownResponse = {
  day: "2026-04-25",
  venue: "EIGENLAYER",
  chain: "ETHEREUM",
  venue_chain: "EIGENLAYER-ETHEREUM",
  data_types_expected: ["rewards", "operator_set"],
  pools_expected: 3,
  pools: [
    {
      pool_id: "EIGENLAYER-ETHEREUM:REWARDS:RESTAKING",
      coverage: { rewards: "captured", operator_set: "missing" },
      coverage_summary: {
        captured: 1,
        empty_confirmed: 0,
        missing: 1,
        failed: 0,
      },
    },
    {
      pool_id: "EIGENLAYER-ETHEREUM:OPSET:HOLESKY",
      coverage: { rewards: "empty_confirmed", operator_set: "captured" },
      coverage_summary: {
        captured: 1,
        empty_confirmed: 1,
        missing: 0,
        failed: 0,
      },
    },
    {
      pool_id: "EIGENLAYER-ETHEREUM:OPSET:FAILED",
      coverage: { rewards: "failed", operator_set: "failed" },
      coverage_summary: {
        captured: 0,
        empty_confirmed: 0,
        missing: 0,
        failed: 2,
      },
    },
  ],
  status: "resolved",
};

function makeFixtureWithNPools(n: number): apiClient.PoolBreakdownResponse {
  return {
    day: "2026-04-25",
    venue: "UNISWAP_V3",
    chain: "ETHEREUM",
    venue_chain: "UNISWAP_V3-ETHEREUM",
    data_types_expected: ["swaps"],
    pools_expected: n,
    pools: Array.from({ length: n }, (_, i) => ({
      pool_id: `UNISWAP_V3-ETHEREUM:POOL:${String(i).padStart(4, "0")}`,
      coverage: { swaps: "captured" as const },
      coverage_summary: {
        captured: 1,
        empty_confirmed: 0,
        missing: 0,
        failed: 0,
      },
    })),
    status: "resolved",
  };
}

describe("PoolBreakdownModal", () => {
  beforeEach(() => {
    vi.spyOn(apiClient, "getPoolBreakdown").mockResolvedValue(fixtureSmall);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders pool rows with coverage badges and the count tally", async () => {
    render(
      <PoolBreakdownModal
        venue="EIGENLAYER"
        chain="ETHEREUM"
        day="2026-04-25"
        onClose={() => {}}
      />,
    );

    // Loading state appears first, then disappears once the fixture resolves.
    expect(screen.getByTestId("defi-pools-loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("defi-pools-loading")).not.toBeInTheDocument(),
    );

    // Modal container, all three pool rows, and at least one coverage badge.
    expect(screen.getByTestId("defi-pools-modal")).toBeInTheDocument();
    expect(
      screen.getByTestId("defi-pool-row-EIGENLAYER-ETHEREUM:REWARDS:RESTAKING"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("defi-pool-row-EIGENLAYER-ETHEREUM:OPSET:HOLESKY"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("defi-pool-row-EIGENLAYER-ETHEREUM:OPSET:FAILED"),
    ).toBeInTheDocument();

    // Coverage badge surfaces data_type + colour-coded state via data-attribute.
    const capturedBadges = document.querySelectorAll(
      '[data-coverage-state="captured"]',
    );
    expect(capturedBadges.length).toBeGreaterThan(0);
    const failedBadges = document.querySelectorAll(
      '[data-coverage-state="failed"]',
    );
    expect(failedBadges.length).toBe(2); // both data_types failed on the third pool
    const emptyBadges = document.querySelectorAll(
      '[data-coverage-state="empty_confirmed"]',
    );
    expect(emptyBadges.length).toBe(1);
    const missingBadges = document.querySelectorAll(
      '[data-coverage-state="missing"]',
    );
    expect(missingBadges.length).toBe(1);
  });

  it("shows truncation footer when pool count exceeds 100", async () => {
    vi.spyOn(apiClient, "getPoolBreakdown").mockResolvedValue(
      makeFixtureWithNPools(150),
    );
    render(
      <PoolBreakdownModal
        venue="UNISWAP_V3"
        chain="ETHEREUM"
        day="2026-04-25"
        onClose={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByTestId("defi-pools-loading")).not.toBeInTheDocument(),
    );

    const footer = screen.getByTestId("defi-pools-truncation-footer");
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain("+ 50 more");
  });

  it("hides the truncation footer when pool count is below cap", async () => {
    render(
      <PoolBreakdownModal
        venue="EIGENLAYER"
        chain="ETHEREUM"
        day="2026-04-25"
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("defi-pools-loading")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("defi-pools-truncation-footer"),
    ).not.toBeInTheDocument();
  });

  it("shows empty state when status is no_data", async () => {
    vi.spyOn(apiClient, "getPoolBreakdown").mockResolvedValue({
      day: "2026-04-25",
      venue: "BALANCER",
      chain: "POLYGON",
      venue_chain: "BALANCER-POLYGON",
      data_types_expected: [],
      pools_expected: 0,
      pools: [],
      status: "no_data",
    });

    render(
      <PoolBreakdownModal
        venue="BALANCER"
        chain="POLYGON"
        day="2026-04-25"
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("defi-pools-loading")).not.toBeInTheDocument(),
    );
    const empty = screen.getByTestId("defi-pools-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain("No pool data");
    expect(empty.textContent).toContain("BALANCER");
    expect(empty.textContent).toContain("POLYGON");
  });

  it("renders the title with venue-chain and resolved day from the response", async () => {
    render(
      <PoolBreakdownModal
        venue="EIGENLAYER"
        chain="ETHEREUM"
        day="2026-04-20"
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("defi-pools-loading")).not.toBeInTheDocument(),
    );
    // Response.day overrides the prop day in the title.
    expect(
      screen.getByText(/Pool breakdown · EIGENLAYER-ETHEREUM · 2026-04-25/),
    ).toBeInTheDocument();
  });
});
