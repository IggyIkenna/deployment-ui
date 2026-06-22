import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type {
  DeploymentInventoryFilters,
  DeploymentInventoryResponse,
  DeploymentUmbrella,
  UmbrellaSummaryResponse,
} from "../api/deploymentApi";

const mockGetInventory = vi.fn();
const mockGetSummary = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  getDeploymentInventory: (filters?: DeploymentInventoryFilters) => mockGetInventory(filters),
  getUmbrellaSummary: (umbrella: DeploymentUmbrella) => mockGetSummary(umbrella),
}));

vi.mock("../components/ui/card", () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <h3>{p.children}</h3>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

import { Deployments } from "./Deployments";

const LIVE_ITEMS: DeploymentInventoryResponse = {
  items: [
    {
      name: "defi-live-capture-1",
      kind: "VM",
      umbrella: "LIVE",
      cloud: "GCP",
      service: "market-tick-data-service",
      asset_group: "defi",
      status: "running",
      last_run_at: "2026-06-22T08:30:00Z",
      exit_code: null,
      heartbeat_age_seconds: 42,
      captured_progress: 18234,
      run_log_uri: "gs://b/vm-logs/defi-live-capture-1/run.log",
    },
    {
      name: "cefi-live-trading-1",
      kind: "VM",
      umbrella: "LIVE",
      cloud: "AWS",
      service: "execution-service",
      asset_group: "cefi",
      status: "running",
      last_run_at: "2026-06-22T08:29:00Z",
      exit_code: null,
      heartbeat_age_seconds: 900,
      captured_progress: null,
      run_log_uri: null,
    },
  ],
  total: 2,
  vm_count: 2,
  cloud_run_job_count: 0,
};

const BATCH_ITEMS: DeploymentInventoryResponse = {
  items: [
    {
      name: "sports-backfill-20260621",
      kind: "VM",
      umbrella: "BATCH",
      cloud: "GCP",
      service: "market-tick-data-service",
      asset_group: "sports",
      status: "failed",
      last_run_at: "2026-06-21T03:11:00Z",
      exit_code: 137,
      heartbeat_age_seconds: null,
      captured_progress: 0,
      run_log_uri: "gs://b/vm-logs/sports-backfill-20260621/run.log",
    },
    {
      name: "manifest-consolidator",
      kind: "CLOUD_RUN_JOB",
      umbrella: "BATCH",
      cloud: "GCP",
      service: "market-tick-data-service",
      asset_group: "all",
      status: "succeeded",
      last_run_at: "2026-06-22T08:00:00Z",
      exit_code: 0,
      heartbeat_age_seconds: null,
      captured_progress: null,
      run_log_uri: null,
    },
  ],
  total: 2,
  vm_count: 1,
  cloud_run_job_count: 1,
};

function summaryFor(umbrella: DeploymentUmbrella): UmbrellaSummaryResponse {
  if (umbrella === "BATCH") {
    return {
      umbrella: "BATCH",
      total: 2,
      counts_by_status: { failed: 1, succeeded: 1 },
      stale_count: 0,
      last_failure: { name: "sports-backfill-20260621", exit_code: 137, last_run_at: "2026-06-21T03:11:00Z" },
    };
  }
  return {
    umbrella: "LIVE",
    total: 2,
    counts_by_status: { running: 2 },
    stale_count: 0,
    last_failure: null,
  };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/deployments" element={<Deployments />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Deployments page", () => {
  beforeEach(() => {
    mockGetInventory.mockReset();
    mockGetSummary.mockReset();
    mockGetSummary.mockImplementation((u: DeploymentUmbrella) => Promise.resolve(summaryFor(u)));
    mockGetInventory.mockImplementation((filters?: DeploymentInventoryFilters) => {
      const umbrella = filters?.umbrella ?? "LIVE";
      const base = umbrella === "BATCH" ? BATCH_ITEMS : LIVE_ITEMS;
      let items = base.items;
      if (filters?.status) items = items.filter((i) => i.status === filters.status);
      if (filters?.cloud) items = items.filter((i) => i.cloud === filters.cloud);
      return Promise.resolve({ ...base, items });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Live/Batch/Paper umbrella tabs", async () => {
    renderAt("/deployments");
    await waitFor(() => {
      expect(screen.getByTestId("umbrella-tab-LIVE")).toBeInTheDocument();
      expect(screen.getByTestId("umbrella-tab-BATCH")).toBeInTheDocument();
      expect(screen.getByTestId("umbrella-tab-PAPER")).toBeInTheDocument();
    });
  });

  it("renders the live inventory rows for the default (Live) tab", async () => {
    renderAt("/deployments");
    await waitFor(() => {
      expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument();
      expect(screen.getByTestId("deployment-row-cefi-live-trading-1")).toBeInTheDocument();
    });
    // GCP + AWS cloud badges both render.
    expect(screen.getByTestId("cloud-badge-GCP")).toBeInTheDocument();
    expect(screen.getByTestId("cloud-badge-AWS")).toBeInTheDocument();
  });

  it("a failed/137 row shows the failed badge + the 137 (OOM) exit code (Batch tab)", async () => {
    renderAt("/deployments?umbrella=batch");
    await waitFor(() => {
      expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument();
    });
    expect(screen.getByTestId("status-sports-backfill-20260621").textContent).toContain("failed");
    expect(screen.getAllByTestId("exit-code").some((el) => el.textContent?.includes("137 (OOM)"))).toBe(true);
    // The per-umbrella summary header surfaces the last failure with its exit code.
    expect(screen.getByTestId("summary-last-failure").textContent).toContain("sports-backfill-20260621");
    expect(screen.getByTestId("summary-last-failure").textContent).toContain("137");
  });

  it("the status filter (URL param) narrows the list to failed rows", async () => {
    renderAt("/deployments?umbrella=batch&status=failed");
    await waitFor(() => {
      expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument();
    });
    // The succeeded Cloud Run job is filtered out.
    expect(screen.queryByTestId("deployment-row-manifest-consolidator")).not.toBeInTheDocument();
    // The inventory fetch carried the status filter through.
    expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", umbrella: "BATCH" }));
  });

  it("clicking the Batch tab re-fetches with umbrella=BATCH", async () => {
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("umbrella-tab-BATCH"));
    await waitFor(() => {
      expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ umbrella: "BATCH" }));
    });
  });

  it("shows an error alert when the inventory fetch fails", async () => {
    mockGetInventory.mockRejectedValue(new Error("inventory unavailable"));
    renderAt("/deployments");
    await waitFor(() => {
      expect(screen.getByTestId("deployments-error")).toBeInTheDocument();
      expect(screen.getByText(/inventory unavailable/)).toBeInTheDocument();
    });
  });
});
