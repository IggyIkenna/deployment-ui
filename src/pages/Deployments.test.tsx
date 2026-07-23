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

// Idle-spend rollup + reap/delete actions (Fleet-tab consolidation) — partial mock (the module
// also exports pauseVm/resumeVm/cancelVm etc. that VmControls needs untouched) so tests never hit
// a real fetch.
const mockGetOrphans = vi.fn();
const mockReapOrphans = vi.fn();
const mockDeleteInstance = vi.fn();
vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return {
    ...actual,
    getOrphans: () => mockGetOrphans(),
    reapOrphans: (dryRun: boolean, graceHours?: number) => mockReapOrphans(dryRun, graceHours),
    deleteInstance: (name: string, zone: string) => mockDeleteInstance(name, zone),
  };
});

// Spreads all props through (onClick/role/data-testid/etc.) — same forwarding contract as the
// real Card, so a click-to-filter test exercises the real handler wired via onClick.
vi.mock("../components/ui/card", () => ({
  Card: (p: React.HTMLAttributes<HTMLDivElement>) => <div {...p} />,
  CardHeader: (p: React.HTMLAttributes<HTMLDivElement>) => <div {...p} />,
  CardTitle: (p: React.HTMLAttributes<HTMLElement>) => <h3 {...p} />,
  CardContent: (p: React.HTMLAttributes<HTMLDivElement>) => <div {...p} />,
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
    rows_error: 5,
    rows_in: 1200,
    events_emitted: 340,
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
  {
    name: "cefi-orphan-stopped-vm",
    kind: "VM" as const,
    umbrella: "BATCH" as const,
    cloud: "GCP" as const,
    service: "market-tick-data-service",
    asset_group: "cefi",
    status: "stopped",
    last_run_at: null,
    exit_code: null,
    heartbeat_age_seconds: null,
    captured_progress: null,
    run_log_uri: null,
    reap_verdict: "reap" as const,
    grace_hours: 24,
    stopped_age_hours: 50.5,
    monthly_disk_usd: 5.2,
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
    mockGetOrphans.mockReset();
    mockReapOrphans.mockReset();
    mockDeleteInstance.mockReset();
    mockGetSummary.mockImplementation((u: DeploymentUmbrella) => Promise.resolve(summaryFor(u)));
    mockGetInventory.mockImplementation((filters?: DeploymentInventoryFilters) =>
      Promise.resolve(inventoryFor(filters)),
    );
    mockGetOrphans.mockResolvedValue({
      generated_at: "2026-07-21T00:00:00Z",
      grace_hours: 24,
      stopped_total: 3,
      reapable_total: 1,
      monthly_idle_usd: 15.6,
      monthly_reapable_usd: 5.2,
      total_idle_cost_incurred_usd: 3.9,
      total_reapable_cost_incurred_usd: 1.3,
      orphans: [],
    });
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

  it("a row with rows_error/rows_in/events_emitted shows the errors + throughput cell (cheap merged columns)", async () => {
    renderAt("/deployments?status=all");
    await waitFor(() => expect(screen.getByTestId("deployment-row-sports-backfill-20260621")).toBeInTheDocument());
    expect(screen.getByTestId("errors-sports-backfill-20260621").textContent).toBe("5 err");
    const cell = screen.getByTestId("errors-throughput-sports-backfill-20260621");
    expect(cell.textContent).toContain("1,200 in");
    expect(cell.textContent).toContain("340 evt");
  });

  it("a row with no rows_error/throughput signal renders no errors-throughput cell", async () => {
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument());
    expect(screen.queryByTestId("errors-throughput-defi-live-capture-1")).not.toBeInTheDocument();
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

  it("renders the idle-spend rollup cards from GET /api/fleet/orphans (Fleet-tab consolidation)", async () => {
    renderAt("/deployments");
    await waitFor(() => {
      const cards = screen.getByTestId("deployments-idle-spend-cards");
      expect(cards.textContent).toContain("3"); // stopped_total
      expect(cards.textContent).toContain("1"); // reapable_total
      expect(cards.textContent).toContain("$15.60"); // monthly_idle_usd
      expect(cards.textContent).toContain("$5.20"); // monthly_reapable_usd
    });
  });

  it("idle-spend cards render honest '—' placeholders when the orphans fetch fails", async () => {
    mockGetOrphans.mockRejectedValue(new Error("orphans unavailable"));
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument());
    const cards = screen.getByTestId("deployments-idle-spend-cards");
    expect(cards.textContent).toContain("—");
  });

  it("a stopped orphan VM row shows the reap-verdict badge + stopped-age", async () => {
    renderAt("/deployments?status=all");
    await waitFor(() => expect(screen.getByTestId("deployment-row-cefi-orphan-stopped-vm")).toBeInTheDocument());
    const verdict = screen.getByTestId("orphan-verdict-cefi-orphan-stopped-vm");
    expect(verdict.textContent).toBe("Reapable");
    expect(screen.getByText("stopped 2.1d")).toBeInTheDocument(); // 50.5h -> 2.1d
  });

  it("a running VM row shows no reap-verdict badge (not in the orphan candidate set)", async () => {
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployment-row-defi-live-capture-1")).toBeInTheDocument());
    expect(screen.queryByTestId("orphan-verdict-defi-live-capture-1")).not.toBeInTheDocument();
  });

  it("per-instance delete: click -> confirm dialog -> confirm calls deleteInstance and refreshes", async () => {
    mockDeleteInstance.mockResolvedValue({ name: "cefi-orphan-stopped-vm", deleted: true });
    renderAt("/deployments?status=all");
    await waitFor(() => expect(screen.getByTestId("deployment-row-cefi-orphan-stopped-vm")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("orphan-delete-cefi-orphan-stopped-vm"));
    await waitFor(() => expect(screen.getByTestId("deployments-delete-dialog")).toBeInTheDocument());
    expect(screen.getByTestId("deployments-delete-dialog").textContent).toContain("cefi-orphan-stopped-vm");

    fireEvent.click(screen.getByTestId("deployments-delete-confirm"));
    await waitFor(() => expect(mockDeleteInstance).toHaveBeenCalledWith("cefi-orphan-stopped-vm", ""));
    await waitFor(() => expect(screen.getByTestId("deployments-reap-action-msg").textContent).toContain("Deleted"));
    // Dialog closes + the inventory reloads (refetch count goes up).
    expect(screen.queryByTestId("deployments-delete-dialog")).not.toBeInTheDocument();
  });

  it("bulk reap: click -> dry-run preview dialog -> confirm calls reapOrphans(false, ...)", async () => {
    mockReapOrphans.mockImplementation((dryRun: boolean) =>
      Promise.resolve(
        dryRun
          ? {
              dry_run: true,
              grace_hours: 24,
              candidate_total: 1,
              reaped_total: 0,
              monthly_reclaimed_usd: 0,
              results: [
                { name: "cefi-orphan-stopped-vm", zone: "asia-northeast1-c", monthly_disk_usd: 5.2, deleted: false },
              ],
            }
          : {
              dry_run: false,
              grace_hours: 24,
              candidate_total: 1,
              reaped_total: 1,
              monthly_reclaimed_usd: 5.2,
              results: [
                { name: "cefi-orphan-stopped-vm", zone: "asia-northeast1-c", monthly_disk_usd: 5.2, deleted: true },
              ],
            },
      ),
    );
    renderAt("/deployments");
    await waitFor(() => expect(screen.getByTestId("deployments-reap-btn")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("deployments-reap-btn"));
    await waitFor(() => expect(mockReapOrphans).toHaveBeenCalledWith(true, 24));
    await waitFor(() => expect(screen.getByTestId("deployments-reap-dialog")).toBeInTheDocument());
    expect(screen.getByTestId("deployments-reap-dialog").textContent).toContain("cefi-orphan-stopped-vm");

    fireEvent.click(screen.getByTestId("deployments-reap-confirm"));
    await waitFor(() => expect(mockReapOrphans).toHaveBeenCalledWith(false, 24));
    await waitFor(() => expect(screen.getByTestId("deployments-reap-action-msg").textContent).toContain("Reaped 1"));
    expect(screen.queryByTestId("deployments-reap-dialog")).not.toBeInTheDocument();
  });

  it("clicking an idle-spend rollup card applies the status=stopped filter (idle-spend discoverability)", async () => {
    renderAt("/deployments"); // default view — status=running, stopped rows hidden
    await waitFor(() => expect(screen.getByTestId("deployments-orphans-card-stopped")).toBeInTheDocument());
    expect(screen.queryByTestId("deployment-row-cefi-orphan-stopped-vm")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("deployments-orphans-card-stopped"));
    await waitFor(() => expect(mockGetInventory).toHaveBeenCalledWith(expect.objectContaining({ status: "stopped" })));
    await waitFor(() => expect(screen.getByTestId("deployment-row-cefi-orphan-stopped-vm")).toBeInTheDocument());
  });
});
