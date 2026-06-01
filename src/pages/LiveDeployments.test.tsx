import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { VmDeploymentsListResponse } from "../api/deploymentApi";

const mockFetchVmDeployments = vi.fn();
const mockFetchVmLogs = vi.fn();
const mockFetchVmHealth = vi.fn();
const mockUseVmWebSocket = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  fetchVmDeployments: (days: number) => mockFetchVmDeployments(days),
  fetchVmLogs: (vmName: string, tail?: number) => mockFetchVmLogs(vmName, tail),
  fetchVmHealth: (vmName: string) => mockFetchVmHealth(vmName),
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
  Button: (p: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button
      onClick={p.onClick}
      disabled={p.disabled}
      aria-label={p["aria-label"]}
    >
      {p.children}
    </button>
  ),
}));
vi.mock("../components/ui/badge", () => ({
  Badge: (p: { children: React.ReactNode; variant?: string }) => (
    <span data-variant={p.variant}>{p.children}</span>
  ),
}));

vi.mock("../hooks/useVmWebSocket", () => ({
  useVmWebSocket: (vmName: string | null) => mockUseVmWebSocket(vmName),
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

function makeResponse(
  entries: (typeof LIVE_ENTRY)[],
): VmDeploymentsListResponse {
  return { active: entries, recent: [], archive_days: 1 };
}

describe("LiveDeployments page", () => {
  beforeEach(() => {
    mockFetchVmDeployments.mockReset();
    mockFetchVmHealth.mockResolvedValue({
      state: "unknown",
      message: "no events",
    });
    mockUseVmWebSocket.mockReturnValue({
      events: [],
      connected: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(
      screen.queryByText("strategy-service-batch"),
    ).not.toBeInTheDocument();
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
    const badges = screen
      .getAllByRole("generic")
      .filter((el) => el.dataset.variant !== undefined);
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

  it("shows inline Retry button on API failure", async () => {
    mockFetchVmDeployments.mockRejectedValueOnce(new Error("Timeout"));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retry loading live deployments/i }),
      ).toBeInTheDocument();
    });
  });

  it("retry button re-triggers data load", async () => {
    mockFetchVmDeployments.mockRejectedValueOnce(new Error("First fail"));
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /retry loading live deployments/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      screen.getByRole("button", { name: /retry loading live deployments/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
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

describe("LiveDeployments accessibility (ARIA)", () => {
  beforeEach(() => {
    mockFetchVmDeployments.mockReset();
    mockFetchVmHealth.mockResolvedValue({
      state: "unknown",
      message: "no events",
    });
    mockUseVmWebSocket.mockReturnValue({
      events: [],
      connected: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Refresh button has an accessible label", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /refresh live deployments/i }),
      ).toBeInTheDocument();
    });
  });

  it("table has an accessible label when rows are present", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("table", { name: /live-mode vm deployments/i }),
      ).toBeInTheDocument();
    });
  });

  it("error message uses role=alert for screen readers", async () => {
    mockFetchVmDeployments.mockRejectedValueOnce(new Error("API down"));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

describe("LiveDeployments WebSocket event panel", () => {
  const VM_NAME = LIVE_ENTRY.vm_name;

  beforeEach(() => {
    mockFetchVmDeployments.mockReset();
    mockFetchVmHealth.mockResolvedValue({
      state: "unknown",
      message: "no events",
    });
    mockUseVmWebSocket.mockReturnValue({
      events: [],
      connected: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows event panel when a VM row is clicked", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));

    await waitFor(() => {
      expect(screen.getByText(/Event stream/)).toBeInTheDocument();
    });
  });

  it("hides event panel when selected VM row is clicked again", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });

    const row = screen.getByTestId(`vm-row-${VM_NAME}`);
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByText(/Event stream/)).toBeInTheDocument(),
    );

    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.queryByText(/Event stream/)).not.toBeInTheDocument(),
    );
  });

  it("displays streamed events in the event panel", async () => {
    const fakeEvents = [
      {
        event: "STARTED",
        service: "strategy-service",
        timestamp: new Date().toISOString(),
        severity: "INFO",
        correlation_id: "cid-1",
        details: null,
      },
    ];
    mockUseVmWebSocket.mockReturnValue({
      events: fakeEvents,
      connected: true,
      error: null,
    });
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));

    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("strategy-service")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));

    await waitFor(() => {
      expect(screen.getByTestId("vm-event-feed")).toBeInTheDocument();
      expect(screen.getAllByText("STARTED").length).toBeGreaterThan(0);
    });
  });

  it("shows live indicator when WebSocket is connected", async () => {
    mockUseVmWebSocket.mockReturnValue({
      events: [],
      connected: true,
      error: null,
    });
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));

    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("strategy-service")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));

    await waitFor(() => {
      expect(screen.getByText("● live")).toBeInTheDocument();
    });
  });
});

describe("LiveDeployments VM log panel", () => {
  const VM_NAME = LIVE_ENTRY.vm_name;
  const EMPTY_LOGS = {
    vm_name: VM_NAME,
    service: "strategy-service",
    lines: [],
    total_lines: 0,
  };

  beforeEach(() => {
    mockFetchVmDeployments.mockReset();
    mockFetchVmLogs.mockReset();
    mockFetchVmHealth.mockResolvedValue({
      state: "unknown",
      message: "no events",
    });
    mockUseVmWebSocket.mockReturnValue({
      events: [],
      connected: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows Events and Logs tab buttons when a VM row is selected", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    mockFetchVmLogs.mockResolvedValue(EMPTY_LOGS);
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("strategy-service")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /events/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /logs/i })).toBeInTheDocument();
    });
  });

  it("clicking Logs tab shows log panel and hides event stream", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    mockFetchVmLogs.mockResolvedValue(EMPTY_LOGS);
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("strategy-service")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /logs/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("tab", { name: /logs/i }));

    await waitFor(() => {
      expect(screen.getByText(/Log tail/)).toBeInTheDocument();
      expect(screen.queryByText(/Event stream/)).not.toBeInTheDocument();
    });
  });

  it("log panel displays fetched log lines", async () => {
    const lines = [
      {
        timestamp: new Date().toISOString(),
        event: "PROGRESS",
        severity: "INFO",
        message: "Processed 100 rows",
      },
    ];
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    mockFetchVmLogs.mockResolvedValue({
      vm_name: VM_NAME,
      service: "strategy-service",
      lines,
      total_lines: 1,
    });
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("strategy-service")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /logs/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /logs/i }));

    await waitFor(() => {
      expect(screen.getByTestId("vm-log-feed")).toBeInTheDocument();
      expect(screen.getByText("PROGRESS")).toBeInTheDocument();
      expect(screen.getByText("Processed 100 rows")).toBeInTheDocument();
    });
  });

  it("log panel shows error message when fetch fails", async () => {
    mockFetchVmDeployments.mockResolvedValueOnce(makeResponse([LIVE_ENTRY]));
    mockFetchVmLogs.mockRejectedValue(new Error("Logs unavailable"));
    render(
      <MemoryRouter>
        <LiveDeployments />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("strategy-service")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId(`vm-row-${VM_NAME}`));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /logs/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("tab", { name: /logs/i }));

    await waitFor(() => {
      expect(screen.getByText(/Logs unavailable/)).toBeInTheDocument();
    });
  });
});
