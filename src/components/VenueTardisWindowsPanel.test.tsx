import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VenueTardisWindowsPanel } from "./VenueTardisWindowsPanel";

vi.mock("../api/deploymentApi", () => ({
  fetchVenueTardisWindows: vi.fn(),
}));

let mockFetch: ReturnType<typeof vi.fn>;

const MOCK_EXPIRED = {
  as_of: "2026-05-30",
  key_name: "tardis-api-key",
  key_status: "expired",
  free_tier: {
    rolling_window_days: 7,
    rolling_window_cutoff: "2026-05-23",
    monthly_firsts: true,
    rule_description: "day-of-month == 1  OR  date >= 2026-05-23",
  },
};

const MOCK_ACTIVE = {
  ...MOCK_EXPIRED,
  key_status: "active",
};

const MOCK_MISSING = {
  ...MOCK_EXPIRED,
  key_status: "missing",
};

beforeEach(async () => {
  const mod = await import("../api/deploymentApi");
  mockFetch = vi.mocked(mod.fetchVenueTardisWindows);
  mockFetch.mockResolvedValue(MOCK_EXPIRED);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VenueTardisWindowsPanel", () => {
  it("renders panel with heading", async () => {
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("venue-tardis-windows-panel")).toBeInTheDocument());
    expect(screen.getByText("Tardis Free vs Paid Date Ranges")).toBeInTheDocument();
  });

  it("shows EXPIRED badge for expired key", async () => {
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-key-status-badge")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-key-status-badge")).toHaveTextContent("EXPIRED");
  });

  it("shows ACTIVE badge for active key", async () => {
    mockFetch.mockResolvedValueOnce(MOCK_ACTIVE);
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-key-status-badge")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-key-status-badge")).toHaveTextContent("ACTIVE");
  });

  it("shows free-tier box with rolling window info", async () => {
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-free-tier-box")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-free-tier-box")).toHaveTextContent("Free tier");
    expect(screen.getByTestId("tardis-free-tier-box")).toHaveTextContent("1st of every calendar month");
    expect(screen.getByTestId("tardis-free-tier-box")).toHaveTextContent("2026-05-23");
  });

  it("shows blocked warning for expired key", async () => {
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-paid-tier-blocked-msg")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-paid-tier-blocked-msg")).toHaveTextContent("expired");
    expect(screen.getByTestId("tardis-paid-tier-blocked-msg")).toHaveTextContent("key is renewed");
  });

  it("shows blocked warning for missing key", async () => {
    mockFetch.mockResolvedValueOnce(MOCK_MISSING);
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-paid-tier-blocked-msg")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-paid-tier-blocked-msg")).toHaveTextContent("missing");
  });

  it("shows active message for active key", async () => {
    mockFetch.mockResolvedValueOnce(MOCK_ACTIVE);
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("tardis-paid-tier-active-msg")).toBeInTheDocument());
    expect(screen.getByTestId("tardis-paid-tier-active-msg")).toHaveTextContent("active");
  });

  it("shows error message when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("venue-tardis-windows-error")).toBeInTheDocument());
    expect(screen.getByText(/network error/)).toBeInTheDocument();
  });

  it("refresh button re-triggers fetch", async () => {
    render(<VenueTardisWindowsPanel />);
    await waitFor(() => expect(screen.getByTestId("venue-tardis-windows-panel")).toBeInTheDocument());
    mockFetch.mockClear();
    fireEvent.click(screen.getByTestId("venue-tardis-windows-refresh-btn"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});
