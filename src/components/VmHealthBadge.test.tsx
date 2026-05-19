import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { VmHealthResult } from "../api/deploymentApi";

const mockFetchVmHealth = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  fetchVmHealth: (vmName: string, scanHours?: number) =>
    mockFetchVmHealth(vmName, scanHours),
}));

import { VmHealthBadge } from "./VmHealthBadge";

function makeHealth(state: VmHealthResult["state"]): VmHealthResult {
  return {
    vm_name: "test-vm",
    service: "test-svc",
    state,
    last_started_at: "2026-05-15T10:00:00Z",
    last_event_at: "2026-05-15T10:05:00Z",
    last_event_type: "INSTRUMENT_PROCESSED",
    expected_next_heartbeat_at: "2026-05-15T11:05:00Z",
    threshold_warn_seconds: 3600,
    threshold_error_seconds: 7200,
    is_terminal: false,
    scanned_hours: 1,
    message: `test message for ${state}`,
  };
}

describe("VmHealthBadge", () => {
  beforeEach(() => {
    mockFetchVmHealth.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading indicator initially", () => {
    mockFetchVmHealth.mockReturnValue(new Promise(() => {}));
    render(<VmHealthBadge vmName="cefi-vm-1" />);
    expect(
      screen.getByTestId("health-badge-loading-cefi-vm-1"),
    ).toBeInTheDocument();
  });

  it("renders green badge for healthy state", async () => {
    mockFetchVmHealth.mockResolvedValueOnce(makeHealth("green"));
    render(<VmHealthBadge vmName="cefi-vm-1" />);
    await waitFor(() => {
      const badge = screen.getByTestId("health-badge-cefi-vm-1");
      expect(badge).toBeInTheDocument();
      expect(badge.dataset.state).toBe("green");
      expect(badge.textContent).toBe("healthy");
    });
  });

  it("renders amber badge for stale state", async () => {
    mockFetchVmHealth.mockResolvedValueOnce(makeHealth("amber"));
    render(<VmHealthBadge vmName="cefi-vm-2" />);
    await waitFor(() => {
      const badge = screen.getByTestId("health-badge-cefi-vm-2");
      expect(badge.dataset.state).toBe("amber");
      expect(badge.textContent).toBe("stale");
    });
  });

  it("renders red badge for critical state", async () => {
    mockFetchVmHealth.mockResolvedValueOnce(makeHealth("red"));
    render(<VmHealthBadge vmName="cefi-vm-3" />);
    await waitFor(() => {
      const badge = screen.getByTestId("health-badge-cefi-vm-3");
      expect(badge.dataset.state).toBe("red");
      expect(badge.textContent).toBe("critical");
    });
  });

  it("renders unknown badge for unknown state", async () => {
    mockFetchVmHealth.mockResolvedValueOnce(makeHealth("unknown"));
    render(<VmHealthBadge vmName="cefi-vm-4" />);
    await waitFor(() => {
      const badge = screen.getByTestId("health-badge-cefi-vm-4");
      expect(badge.dataset.state).toBe("unknown");
      expect(badge.textContent).toBe("unknown");
    });
  });

  it("renders error badge when fetch fails", async () => {
    mockFetchVmHealth.mockRejectedValueOnce(new Error("Network error"));
    render(<VmHealthBadge vmName="cefi-vm-5" />);
    await waitFor(() => {
      expect(
        screen.getByTestId("health-badge-error-cefi-vm-5"),
      ).toBeInTheDocument();
    });
  });

  it("badge title shows health message on success", async () => {
    mockFetchVmHealth.mockResolvedValueOnce(makeHealth("green"));
    render(<VmHealthBadge vmName="cefi-vm-1" />);
    await waitFor(() => {
      const badge = screen.getByTestId("health-badge-cefi-vm-1");
      expect(badge.title).toBe("test message for green");
    });
  });
});

describe("VmHealthBadge LiveDeployments integration", () => {
  beforeEach(() => {
    mockFetchVmHealth.mockReset();
  });

  it("re-fetches when refreshKey changes", async () => {
    mockFetchVmHealth.mockResolvedValue(makeHealth("green"));
    const { rerender } = render(<VmHealthBadge vmName="vm-1" refreshKey={0} />);
    await waitFor(() =>
      expect(screen.getByTestId("health-badge-vm-1")).toBeInTheDocument(),
    );

    rerender(<VmHealthBadge vmName="vm-1" refreshKey={1} />);
    await waitFor(() => {
      expect(mockFetchVmHealth).toHaveBeenCalledTimes(2);
    });
  });
});
