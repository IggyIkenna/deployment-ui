import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveFreshnessPanel } from "./LiveFreshnessPanel";
import * as deploymentApi from "../api/deploymentApi";

vi.mock("../api/deploymentApi");

describe("LiveFreshnessPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockImplementation(
      () => new Promise(() => {}),
    );
    render(<LiveFreshnessPanel />);
    expect(screen.getByText("Loading live freshness...")).toBeInTheDocument();
  });

  it("renders error state on fetch failure", async () => {
    const error = new Error("API error");
    vi.spyOn(deploymentApi, "getLiveStatus").mockRejectedValue(error);
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Error: API error/)).toBeInTheDocument();
    });
  });

  it("renders empty state when no rows returned", async () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [],
      refreshed_at: new Date().toISOString(),
    });
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Live pipeline not yet active — awaiting live MTDS/MDPS producers",
        ),
      ).toBeInTheDocument();
    });
  });

  it("renders table with live status rows", async () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [
        {
          asset_group: "defi",
          data_type: "ohlcv_1m",
          venue: "HYPERLIQUID",
          capture_status: "captured",
          staleness_seconds: 120,
          refreshed_at: new Date().toISOString(),
        },
        {
          asset_group: "cefi",
          data_type: "book_snapshot_5",
          venue: "BINANCE",
          capture_status: "captured",
          staleness_seconds: 700,
          refreshed_at: new Date().toISOString(),
        },
      ],
      refreshed_at: new Date().toISOString(),
    });
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      expect(screen.getByText("defi")).toBeInTheDocument();
      expect(screen.getByText("HYPERLIQUID")).toBeInTheDocument();
      expect(screen.getByText("ohlcv_1m")).toBeInTheDocument();
    });
  });

  it("displays correct staleness badge color (fresh < 300s)", async () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [
        {
          asset_group: "defi",
          data_type: "ohlcv_1m",
          venue: "HYPERLIQUID",
          capture_status: "captured",
          staleness_seconds: 120,
          refreshed_at: new Date().toISOString(),
        },
      ],
      refreshed_at: new Date().toISOString(),
    });
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      const badge = screen.getByText(/Fresh \(120s\)/);
      expect(badge).toHaveClass("bg-green-100");
    });
  });

  it("displays correct staleness badge color (degraded 300-900s)", async () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [
        {
          asset_group: "cefi",
          data_type: "ohlcv_1m",
          venue: "BINANCE",
          capture_status: "captured",
          staleness_seconds: 700,
          refreshed_at: new Date().toISOString(),
        },
      ],
      refreshed_at: new Date().toISOString(),
    });
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      const badge = screen.getByText(/Degraded \(700s\)/);
      expect(badge).toHaveClass("bg-yellow-100");
    });
  });

  it("displays correct staleness badge color (stale >= 900s)", async () => {
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [
        {
          asset_group: "tradfi",
          data_type: "ohlcv_1m",
          venue: "CME",
          capture_status: "attempted_failed",
          staleness_seconds: 1800,
          refreshed_at: new Date().toISOString(),
        },
      ],
      refreshed_at: new Date().toISOString(),
    });
    render(<LiveFreshnessPanel />);
    await waitFor(() => {
      const badge = screen.getByText(/Stale \(1800s\)/);
      expect(badge).toHaveClass("bg-red-100");
    });
  });
});
