import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { VMEventListResult, VMLifecycleEvent } from "../api/deploymentApi";

const mockFetchVmFilteredEvents = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  fetchVmFilteredEvents: (vmName: string, opts: unknown) =>
    mockFetchVmFilteredEvents(vmName, opts),
}));

import { VmEventsTimeline } from "./VmEventsTimeline";

const BASE_EVENT: VMLifecycleEvent = {
  event: "STARTED",
  service: "market-tick-data-service",
  timestamp: "2026-05-15T10:00:00Z",
  severity: "INFO",
  correlation_id: "cid-1",
  details: null,
};

function makeResult(events: (typeof BASE_EVENT)[]): VMEventListResult {
  return {
    vm_name: "cefi-backfill-20260515",
    service: "market-tick-data-service",
    date: "2026-05-15",
    hours_scanned: [10],
    total_events: events.length,
    events,
    truncated: false,
    next_page_token: null,
  };
}

describe("VmEventsTimeline", () => {
  beforeEach(() => {
    mockFetchVmFilteredEvents.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders event rows after load", async () => {
    mockFetchVmFilteredEvents.mockResolvedValueOnce(makeResult([BASE_EVENT]));
    render(
      <MemoryRouter>
        <VmEventsTimeline vmName="cefi-backfill-20260515" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("vm-events-timeline")).toBeInTheDocument();
      expect(screen.getByTestId("event-row-STARTED")).toBeInTheDocument();
    });
  });

  it("shows empty state when no events", async () => {
    mockFetchVmFilteredEvents.mockResolvedValueOnce(makeResult([]));
    render(
      <MemoryRouter>
        <VmEventsTimeline vmName="cefi-backfill-20260515" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No events found/)).toBeInTheDocument();
    });
  });

  it("shows error message on failure", async () => {
    mockFetchVmFilteredEvents.mockRejectedValueOnce(new Error("GCS down"));
    render(
      <MemoryRouter>
        <VmEventsTimeline vmName="cefi-backfill-20260515" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/GCS down/)).toBeInTheDocument();
    });
  });

  it("refresh button re-loads events", async () => {
    mockFetchVmFilteredEvents.mockResolvedValue(makeResult([BASE_EVENT]));
    render(
      <MemoryRouter>
        <VmEventsTimeline vmName="cefi-backfill-20260515" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("event-row-STARTED")).toBeInTheDocument(),
    );
    const callsBefore = mockFetchVmFilteredEvents.mock.calls.length;
    fireEvent.click(
      screen.getByRole("button", { name: /refresh events timeline/i }),
    );
    await waitFor(() =>
      expect(mockFetchVmFilteredEvents.mock.calls.length).toBeGreaterThan(
        callsBefore,
      ),
    );
  });

  it("collapses and expands event details", async () => {
    const evtWithDetails = {
      ...BASE_EVENT,
      details: { rows_processed: "42", phase: "init" },
    };
    mockFetchVmFilteredEvents.mockResolvedValueOnce(
      makeResult([evtWithDetails]),
    );
    render(
      <MemoryRouter>
        <VmEventsTimeline vmName="cefi-backfill-20260515" />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("event-row-STARTED")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    await waitFor(() => {
      expect(screen.getByText(/rows_processed/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /collapse details/i }));
    await waitFor(() => {
      expect(screen.queryByText(/rows_processed/)).not.toBeInTheDocument();
    });
  });
});
