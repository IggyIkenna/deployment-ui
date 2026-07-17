import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  getDeploymentRegions: () =>
    Promise.resolve({ default: "asia-northeast1", regions: ["asia-northeast1", "europe-west1"], all_value: "all" }),
}));

// Feed-health freshness is additive (LIVE rows only) — a rejection is swallowed by allSettled.
vi.mock("../api/health", () => ({
  getDeploymentFreshness: () => Promise.reject(new Error("no freshness in test")),
}));

vi.mock("../components/ui/card", () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <h3>{p.children}</h3>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

import { DeploymentsContent } from "./Deployments";

const LIVE_ITEMS = [
  {
    name: "defi-live-capture-1",
    kind: "VM" as const,
    umbrella: "LIVE" as const,
    cloud: "GCP" as const,
    service: "market-tick-data-service",
    asset_group: "defi",
    status: "running",
    last_run_at: "2026-06-22T08:30:00Z",
    exit_code: null,
    heartbeat_age_seconds: 42,
    captured_progress: null,
    run_log_uri: "gs://b/vm-logs/defi-live-capture-1/run.log",
  },
  {
    name: "cefi-live-trading-1",
    kind: "VM" as const,
    umbrella: "LIVE" as const,
    cloud: "AWS" as const,
    service: "execution-service",
    asset_group: "cefi",
    status: "running",
    last_run_at: "2026-06-22T08:29:00Z",
    exit_code: null,
    heartbeat_age_seconds: 900,
    captured_progress: null,
    run_log_uri: null,
  },
];

const BATCH_ITEMS = [
  {
    name: "sports-backfill-20260621",
    kind: "VM" as const,
    umbrella: "BATCH" as const,
    cloud: "GCP" as const,
    service: "market-tick-data-service",
    asset_group: "sports",
    status: "failed",
    last_run_at: "2026-06-21T03:11:00Z",
    exit_code: 137,
    heartbeat_age_seconds: null,
    captured_progress: 42,
    run_log_uri: "gs://b/vm-logs/sports-backfill-20260621/run.log",
  },
  {
    name: "manifest-consolidator",
    kind: "CLOUD_RUN_JOB" as const,
    umbrella: "BATCH" as const,
    cloud: "GCP" as const,
    service: "market-tick-data-service",
    asset_group: "all",
    status: "succeeded",
    last_run_at: "2026-06-22T08:00:00Z",
    exit_code: 0,
    heartbeat_age_seconds: null,
    captured_progress: 100,
    run_log_uri: null,
  },
];

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
  if (umbrella === "PAPER") {
    return { umbrella: "PAPER", total: 0, counts_by_status: {}, stale_count: 0, last_failure: null };
  }
  return { umbrella: "LIVE", total: 2, counts_by_status: { running: 2 }, stale_count: 0, last_failure: null };
}

/** Mock inventory: no umbrella filter → ALL modes; otherwise scope to the requested umbrella. */
function inventoryFor(filters?: DeploymentInventoryFilters): DeploymentInventoryResponse {
  let items =
    filters?.umbrella === "BATCH"
      ? BATCH_ITEMS
      : filters?.umbrella === "LIVE"
        ? LIVE_ITEMS
        : filters?.umbrella === "PAPER"
          ? []
          : [...LIVE_ITEMS, ...BATCH_ITEMS];
  if (filters?.status) items = items.filter((i) => i.status === filters.status);
  if (filters?.cloud) items = items.filter((i) => i.cloud === filters.cloud);
  return { items, total: items.length, vm_count: 0, cloud_run_job_count: 0 };
}

// The `?tab=` scheme + the `embedded` dual-path were retired 2026-07-17: DeploymentsContent is
// now always URL-backed, so rendering it directly under a MemoryRouter at a given URL exercises
// the real filter deep-link path (?umbrella=, ?status=, …).
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DeploymentsContent />
    </MemoryRouter>,
  );
}

describe("Deployments page (unified all-modes table)", () => {
  beforeEach(() => {
    mockGetInventory.mockReset();
    mockGetSummary.mockReset();
    mockGetSummary.mockImplementation((u: DeploymentUmbrella) => Promise.resolve(summaryFor(u)));
    mockGetInventory.mockImplementation((filters?: DeploymentInventoryFilters) =>
      Promise.resolve(inventoryFor(filters)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders every mode in ONE flat table with a Mode badge per row (no umbrella tabs)", async () => {
    // status=all — the default is now `running` (live-first), so the completed/failed batch row needs it.
    renderAt("/deployments?status=all");
    await waitFor(() => {
      // A live row AND a batch row in the same table.
      expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument();
      expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument();
    });
    // Mode badges distinguish the rows (one per row → both modes present).
    expect(screen.getAllByTestId("mode-badge-LIVE").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("mode-badge-BATCH").length).toBeGreaterThan(0);
    // The Mode column header is present.
    expect(screen.getByText("Mode")).toBeInTheDocument();
    // The old per-mode umbrella TABS are gone (mode is a filter now).
    expect(screen.queryByTestId("umbrella-tab-LIVE")).not.toBeInTheDocument();
    // The retired paper placeholder columns are gone.
    expect(screen.queryByText("Recon drift")).not.toBeInTheDocument();
    expect(screen.queryByText("Determinism ε")).not.toBeInTheDocument();
    // First inventory fetch is the all-modes call (no umbrella filter).
    expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ umbrella: undefined }));
  });

  it("renders both GCP + AWS cloud badges", async () => {
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-cefi-live-trading-1")).toBeInTheDocument());
    expect(screen.getAllByTestId("cloud-badge-GCP").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("cloud-badge-AWS").length).toBeGreaterThan(0);
  });

  it("a failed/137 row shows the failed badge + the 137 (OOM) exit code + the summary last failure", async () => {
    renderAt("/deployments?status=all"); // the failed row is non-running → needs the all view
    await waitFor(() => expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument());
    expect(screen.getByTestId("status-sports-backfill-20260621").textContent).toContain("failed");
    expect(screen.getAllByTestId("exit-code").some((el) => el.textContent?.includes("137 (OOM)"))).toBe(true);
    expect(screen.getByTestId("summary-last-failure").textContent).toContain("sports-backfill-20260621");
    expect(screen.getByTestId("summary-last-failure").textContent).toContain("137");
  });

  it("the mode filter (umbrella URL param) scopes the table to a single mode", async () => {
    renderAt("/deployments?umbrella=batch&status=all"); // batch rows are failed/succeeded → not running
    await waitFor(() => expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument());
    // Live rows are excluded when scoped to batch.
    expect(screen.queryByTestId("deployment-row-defi-live-capture-1")).not.toBeInTheDocument();
    expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ umbrella: "BATCH" }));
  });

  it("the status filter (URL param) narrows the list to failed rows", async () => {
    renderAt("/deployments?status=failed");
    await waitFor(() => expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument());
    expect(screen.queryByTestId("deployment-row-manifest-consolidator")).not.toBeInTheDocument();
    expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("selecting a mode in the filter refetches scoped to that umbrella", async () => {
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("filter-mode"), { target: { value: "BATCH" } });
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
