import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MonitorTab } from "./MonitorTab";
import * as deploymentApi from "../api/deploymentApi";
import * as cloudContext from "../contexts/CloudProviderContext";

vi.mock("../api/deploymentApi");
vi.mock("../contexts/CloudProviderContext");
vi.mock("./DeploymentHistory", () => ({
  DeploymentHistory: () => <div>Deployment History</div>,
}));

describe("MonitorTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cloudContext, "useCloudProvider").mockReturnValue({
      target: "gcp",
      switchTarget: vi.fn(),
      apiBaseUrl: "http://localhost:8004",
      switching: false,
    });
    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue({
      active: [],
      recent: [],
      archive_days: 7,
    });
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue({
      rows: [],
      refreshed_at: new Date().toISOString(),
    });
  });

  it("renders all four sub-tab triggers", () => {
    render(<MonitorTab />);
    expect(screen.getByText(/Backfill/)).toBeInTheDocument();
    expect(screen.getByText(/Experiments/)).toBeInTheDocument();
    expect(screen.getByText(/Live/)).toBeInTheDocument();
    expect(screen.getByText(/Scheduled/)).toBeInTheDocument();
  });

  it("shows backfill tab content by default", async () => {
    render(<MonitorTab />);
    await waitFor(() => {
      expect(screen.getByText("Deployment History")).toBeInTheDocument();
    });
  });

  it("switches to experiments tab when clicked", async () => {
    render(<MonitorTab />);
    const experimentsTab = screen.getByRole("tab", { name: /Experiments/ });
    fireEvent.mouseDown(experimentsTab);
    await waitFor(() => {
      expect(screen.getByText("Experiment Tracker")).toBeInTheDocument();
    });
  });

  it("switches to live tab when clicked", async () => {
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
    render(<MonitorTab />);
    const liveTab = screen.getByRole("tab", { name: /Live/ });
    fireEvent.mouseDown(liveTab);
    await waitFor(() => {
      expect(screen.getByText("Live Data Freshness")).toBeInTheDocument();
    });
  });

  it("switches to scheduled tab when clicked", async () => {
    render(<MonitorTab />);
    const scheduledTab = screen.getByRole("tab", { name: /Scheduled/ });
    fireEvent.mouseDown(scheduledTab);
    await waitFor(() => {
      expect(screen.getByText("Scheduler Registry")).toBeInTheDocument();
    });
  });

  it("navigates between tabs", async () => {
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
    render(<MonitorTab />);

    const backfillTab = screen.getByRole("tab", { name: /Backfill/ });
    const liveTab = screen.getByRole("tab", { name: /Live/ });

    fireEvent.mouseDown(liveTab);
    await waitFor(() => {
      expect(screen.getByText("Live Data Freshness")).toBeInTheDocument();
    });

    fireEvent.mouseDown(backfillTab);
    await waitFor(() => {
      expect(screen.getByText("Deployment History")).toBeInTheDocument();
    });
  });
});
