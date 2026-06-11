/**
 * EpicsPlans component tests — Epics tab v2 (live PM epics + plan drilldown).
 *
 * Covers: epic cards render from the API payload, drilldown expands to plan rows,
 * the orphan strip surfaces, the STALE badge appears ONLY on a stale (rate-limited
 * cached) payload — the 2026-06-11 GitHub-quota fix — and the error state renders.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { EpicsPlansResponse } from "../api/client";

const mockGetEpicsPlans = vi.fn();

vi.mock("../api/client", () => ({
  getEpicsPlans: () => mockGetEpicsPlans(),
}));

import { EpicsPlansContent } from "./EpicsPlans";

function payload(overrides: Partial<EpicsPlansResponse> = {}): EpicsPlansResponse {
  return {
    generated_at: "2026-06-11T12:00:00Z",
    source: "live",
    stale: false,
    epics: [
      {
        name: "observability_master",
        slug: "observability_master",
        title: "Observability Master",
        tier: "L4",
        priority: "P0",
        assigned_vm: "vm-cross-cutting",
        status: "active",
        github_url: "https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/epics/observability_master.md",
        plans: [
          {
            slug: "ci_dashboard_deployment_ui_2026_06_10",
            parent_epic: "observability_master",
            status: "active",
            estimate_class: "brand-new",
            done: 30,
            open: 4,
            open_p0p1: 1,
            pct: 88.2,
            github_url:
              "https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/active/ci_dashboard_deployment_ui_2026_06_10.md",
          },
        ],
        plan_count: 1,
        done_total: 30,
        open_total: 4,
      },
    ],
    orphans: [],
    orphan_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetEpicsPlans.mockReset();
});

describe("EpicsPlansContent", () => {
  it("renders epic cards from the live payload", async () => {
    mockGetEpicsPlans.mockResolvedValue(payload());
    render(<EpicsPlansContent />);
    await waitFor(() => expect(screen.getByTestId("epic-card-observability_master")).toBeTruthy());
    expect(screen.getByText("Observability Master")).toBeTruthy();
    expect(screen.queryByTestId("epics-stale-badge")).toBeNull();
  });

  it("expands an epic to its plan drilldown rows", async () => {
    mockGetEpicsPlans.mockResolvedValue(payload());
    render(<EpicsPlansContent />);
    await waitFor(() => expect(screen.getByTestId("epic-toggle-observability_master")).toBeTruthy());
    fireEvent.click(screen.getByTestId("epic-toggle-observability_master"));
    expect(screen.getByTestId("epic-plan-ci_dashboard_deployment_ui_2026_06_10")).toBeTruthy();
  });

  it("shows the STALE badge on a stale (rate-limited cached) payload", async () => {
    mockGetEpicsPlans.mockResolvedValue(payload({ stale: true }));
    render(<EpicsPlansContent />);
    await waitFor(() => expect(screen.getByTestId("epics-stale-badge")).toBeTruthy());
    expect(screen.getByText("STALE")).toBeTruthy();
  });

  it("surfaces orphans as the review-blocking strip", async () => {
    mockGetEpicsPlans.mockResolvedValue(
      payload({
        orphans: [
          {
            slug: "lost_plan_2026_06_01",
            parent_epic: "",
            status: "active",
            estimate_class: "infra",
            done: 0,
            open: 3,
            open_p0p1: 2,
            pct: 0,
            github_url:
              "https://github.com/IggyIkenna/unified-trading-pm/blob/main/plans/active/lost_plan_2026_06_01.md",
          },
        ],
        orphan_count: 1,
      }),
    );
    render(<EpicsPlansContent />);
    await waitFor(() => expect(screen.getByTestId("epics-orphans")).toBeTruthy());
  });

  it("renders the error card when the API fails", async () => {
    mockGetEpicsPlans.mockRejectedValue(new Error("boom"));
    render(<EpicsPlansContent />);
    await waitFor(() => expect(screen.getByTestId("epics-error")).toBeTruthy());
  });
});
