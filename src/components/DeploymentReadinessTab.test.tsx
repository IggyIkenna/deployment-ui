/**
 * DeploymentReadinessTab unit tests (B-013).
 *
 * Covers:
 *   1. Loading state while fetch is in flight.
 *   2. All-ready table rows render correctly.
 *   3. Mixed-ready rows render correct badges.
 *   4. Error state when fetch rejects.
 *   5. Empty result when API returns empty array.
 *   6. Manual refresh button re-triggers fetch.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 4.B.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../api/repoReadiness";
import type { RepoReadiness } from "../api/repoReadiness";
import { DeploymentReadinessTab } from "./DeploymentReadinessTab";

const ALL_READY: RepoReadiness[] = [
  {
    repo: "deployment-api",
    deploy_ready: true,
    reason: "all_criteria_met",
    last_snapshot_date: "2026-05-15T06:00:00Z",
  },
  {
    repo: "deployment-ui",
    deploy_ready: true,
    reason: "all_criteria_met",
    last_snapshot_date: "2026-05-15T06:00:00Z",
  },
];

const MIXED: RepoReadiness[] = [
  {
    repo: "deployment-api",
    deploy_ready: true,
    reason: "all_criteria_met",
    last_snapshot_date: "2026-05-15T06:00:00Z",
  },
  {
    repo: "strategy-service",
    deploy_ready: false,
    reason: "snapshot_failing: lint",
    last_snapshot_date: "2026-05-14T06:00:00Z",
  },
  {
    repo: "unified-api-contracts",
    deploy_ready: false,
    reason: "in_flight_refactor",
    last_snapshot_date: null,
  },
];

describe("DeploymentReadinessTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state while fetch is in flight", async () => {
    let resolve!: (v: RepoReadiness[]) => void;
    vi.spyOn(api, "fetchRepoReadiness").mockImplementation(
      () =>
        new Promise<RepoReadiness[]>((r) => {
          resolve = r;
        }),
    );

    render(<DeploymentReadinessTab />);
    expect(screen.getByText("Loading…")).toBeTruthy();

    resolve(ALL_READY);
  });

  it("renders all-ready rows after data loads", async () => {
    vi.spyOn(api, "fetchRepoReadiness").mockResolvedValue(ALL_READY);

    render(<DeploymentReadinessTab />);

    await waitFor(() => {
      expect(screen.getByTestId("readiness-table-body")).toBeTruthy();
    });

    expect(screen.getByTestId("readiness-row-deployment-api")).toBeTruthy();
    expect(screen.getByTestId("readiness-row-deployment-ui")).toBeTruthy();
    expect(screen.getAllByText("Ready").length).toBe(2);
  });

  it("renders mixed-ready rows with correct badges", async () => {
    vi.spyOn(api, "fetchRepoReadiness").mockResolvedValue(MIXED);

    render(<DeploymentReadinessTab />);

    await waitFor(() => {
      expect(screen.getByTestId("readiness-table-body")).toBeTruthy();
    });

    expect(screen.getAllByText("Ready").length).toBe(1);
    expect(screen.getAllByText("Not Ready").length).toBe(2);

    // reason text with underscores replaced by spaces
    expect(screen.getByText("all criteria met")).toBeTruthy();
    expect(screen.getByText("in flight refactor")).toBeTruthy();
  });

  it("shows error state when fetch rejects", async () => {
    vi.spyOn(api, "fetchRepoReadiness").mockRejectedValue(
      new Error("Network failure"),
    );

    render(<DeploymentReadinessTab />);

    await waitFor(() => {
      expect(screen.getByTestId("readiness-error")).toBeTruthy();
    });

    expect(screen.getByTestId("readiness-error").textContent).toContain(
      "Network failure",
    );
  });

  it("shows empty-state message when API returns empty array", async () => {
    vi.spyOn(api, "fetchRepoReadiness").mockResolvedValue([]);

    render(<DeploymentReadinessTab />);

    await waitFor(() => {
      expect(
        screen.getByText(/No data — QG snapshot cron not yet running/),
      ).toBeTruthy();
    });
  });

  it("re-triggers fetch when Refresh button is clicked", async () => {
    const spy = vi
      .spyOn(api, "fetchRepoReadiness")
      .mockResolvedValue(ALL_READY);

    render(<DeploymentReadinessTab />);

    await waitFor(() => {
      expect(screen.getByTestId("readiness-table-body")).toBeTruthy();
    });

    expect(spy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("readiness-refresh-btn"));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
