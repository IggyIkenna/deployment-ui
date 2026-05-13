import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LiveClusterSubTab } from "./LiveClusterSubTab";
import * as deploymentApi from "../../api/deploymentApi";
import * as cloudContext from "../../contexts/CloudProviderContext";

vi.mock("../../api/deploymentApi");
vi.mock("../../contexts/CloudProviderContext");

describe("LiveClusterSubTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cloudContext, "useCloudProvider").mockReturnValue({
      target: "gcp",
      switchTarget: vi.fn(),
      apiBaseUrl: "http://localhost:8004",
      switching: false,
    });
  });

  it("renders LiveFreshnessPanel", () => {
    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue({
      active: [],
      recent: [],
      archive_days: 7,
    });
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [],
      refreshed_at: new Date().toISOString(),
    });

    render(<LiveClusterSubTab />);
    expect(screen.getByText("Live Data Freshness")).toBeInTheDocument();
  });

  it("displays live status rows in table", async () => {
    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue({
      active: [],
      recent: [],
      archive_days: 7,
    });
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

    render(<LiveClusterSubTab />);
    await waitFor(() => {
      expect(screen.getByText("defi")).toBeInTheDocument();
      expect(screen.getByText("ohlcv_1m")).toBeInTheDocument();
      expect(screen.getByText("HYPERLIQUID")).toBeInTheDocument();
    });
  });

  it("shows empty state when no live data available", async () => {
    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue({
      active: [],
      recent: [],
      archive_days: 7,
    });
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [],
      refreshed_at: new Date().toISOString(),
    });

    render(<LiveClusterSubTab />);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Live pipeline not yet active — awaiting live MTDS/MDPS producers",
        ),
      ).toBeInTheDocument();
    });
  });
});
