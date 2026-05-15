import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { VmDeploymentsListResponse } from "../api/deploymentApi";

const mockFetchVmDeployments = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  fetchVmDeployments: (days: number) => mockFetchVmDeployments(days),
}));

vi.mock("../components/ui/card", () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <h3>{p.children}</h3>,
  CardContent: (p: { children: React.ReactNode; className?: string }) => (
    <div>{p.children}</div>
  ),
}));
vi.mock("../components/ui/button", () => ({
  Button: (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={p.onClick} disabled={p.disabled}>
      {p.children}
    </button>
  ),
}));
vi.mock("../components/ui/badge", () => ({
  Badge: (p: { children: React.ReactNode; variant?: string }) => (
    <span data-variant={p.variant}>{p.children}</span>
  ),
}));

import { LiveDeployments } from "./LiveDeployments";

const LIVE_ENTRY = {
  deployment_id: "dep-1",
  vm_name: "strategy-service-live-20260515-120000",
  asset_group: "defi",
  task: "strategy-service",
  mode: "live",
  start_date: "2026-05-15",
  end_date: "2026-05-15",
  status: "running",
  started_at: new Date(Date.now() - 3600_000).toISOString(),
  last_heartbeat_at: new Date(Date.now() - 90_000).toISOString(),
  completed_at: null,
  exit_code: null,
  rows_in: 0,
  rows_out: 0,
  rows_error: 0,
  events_emitted: 42,
  log_uri: "gs://logs/dep-1",
};

const BATCH_ENTRY = {
  ...LIVE_ENTRY,
  deployment_id: "dep-2",
  vm_name: "strategy-service-batch-20260515",
  mode: "batch",
  task: "strategy-service-batch",
};

function makeResponse(entries: typeof LIVE_ENTRY[]): VmDeploymentsListResponse {
  return { active: entries, recent: [], archive_days: 1 };
}

describe("LiveDeployments page", () => {
  beforeEach(() => {
    mockFetchVmDeployments.mockReset();
  });

  it("renders live-mode services from active deployments", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });
    expect(screen.getByText("defi")).toBeInTheDocument();
  });

  it("filters out batch-mode entries", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(
      makeResponse([LIVE_ENTRY, BATCH_ENTRY]),
    );
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });
    expect(screen.queryByText("strategy-service-batch")).not.toBeInTheDocument();
  });

  it("shows empty state when no live services", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/No services currently running in live mode/),
      ).toBeInTheDocument();
    });
  });

  it("shows staleness badge for each row", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });
    // staleness of 90s → "1m" or "90s" (< 60 → 90s, ≥ 60 → 1m)
    const badges = screen.getAllByRole("generic").filter((el) => el.dataset.variant !== undefined);
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows error message on API failure", async () => {
    mockFetchVmDeployments.mockRejectedValueOnce(new Error("Network error"));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("renders page title and description", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Live Deployments")).toBeInTheDocument();
    });
    expect(screen.getByText(/auto-refreshes every 30s/)).toBeInTheDocument();
  });
});
