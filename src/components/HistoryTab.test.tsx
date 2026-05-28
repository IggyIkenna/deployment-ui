import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HistoryTab } from "./HistoryTab";

const MOCK_DEPLOYMENTS = [
  {
    id: "dep-001",
    service: "instruments-service",
    status: "completed",
    created_at: "2026-03-10T08:00:00Z",
    parameters: { mode: "batch" },
  },
  {
    id: "dep-002",
    service: "instruments-service",
    status: "running",
    created_at: "2026-03-10T09:00:00Z",
    parameters: { mode: "live" },
  },
  {
    id: "dep-003",
    service: "instruments-service",
    status: "failed",
    created_at: "2026-03-10T07:00:00Z",
    parameters: { mode: "batch" },
  },
];

function mockFetch(data: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    json: async () => data,
    ok: status < 400,
    status,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("HistoryTab", () => {
  it("shows loading state then renders deployment rows", async () => {
    mockFetch({ deployments: MOCK_DEPLOYMENTS, total: MOCK_DEPLOYMENTS.length });
    render(<HistoryTab serviceName="instruments-service" />);
    await waitFor(() => expect(screen.getByText("dep-001")).toBeTruthy());
    expect(screen.getByText("dep-002")).toBeTruthy();
  });

  it("shows Completed status badge", async () => {
    mockFetch({ deployments: MOCK_DEPLOYMENTS, total: MOCK_DEPLOYMENTS.length });
    render(<HistoryTab serviceName="instruments-service" />);
    await waitFor(() => expect(screen.getByText("dep-001")).toBeTruthy());
    expect(screen.getByText("Completed")).toBeTruthy();
  });

  it("shows LIVE badge for live mode deployment", async () => {
    mockFetch({ deployments: MOCK_DEPLOYMENTS, total: MOCK_DEPLOYMENTS.length });
    render(<HistoryTab serviceName="instruments-service" />);
    await waitFor(() => expect(screen.getByText("dep-002")).toBeTruthy());
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("handles array response format", async () => {
    mockFetch(MOCK_DEPLOYMENTS);
    render(<HistoryTab serviceName="instruments-service" />);
    await waitFor(() => expect(screen.getByText("dep-001")).toBeTruthy());
  });

  it("shows empty state when no deployments", async () => {
    mockFetch({ deployments: [], total: 0 });
    render(<HistoryTab serviceName="instruments-service" />);
    await waitFor(() => expect(screen.getByText(/No deployments found/)).toBeTruthy());
  });

  it("renders nothing when serviceName is null", () => {
    mockFetch({ deployments: [], total: 0 });
    render(<HistoryTab serviceName={null} />);
    expect(screen.queryByText("dep-001")).toBeNull();
  });
});
