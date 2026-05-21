/**
 * HonestCoverageCard unit tests.
 *
 * Covers:
 *   1. Loading spinner while fetch is in flight.
 *   2. Renders per-asset-group coverage bars and percentages with correct date.
 *   3. Shows "not yet computed" when API returns null (404).
 *   4. Shows error message when API rejects.
 *   5. Passes explicit date prop through to the API call.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 4.C.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as client from "../api/client";
import type { HonestCoverageResponse } from "../api/client";
import { HonestCoverageCard } from "./HonestCoverageCard";

const COVERAGE: HonestCoverageResponse = {
  generated_at: "2026-05-15T06:00:00Z",
  date: "2026-05-15",
  by_asset_group: {
    cefi: {
      captured: 495,
      empty_confirmed: 0,
      attempted_failed: 10,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: 495,
      total: 1000,
      coverage_pct: 49.5,
    },
    defi: {
      captured: 195,
      empty_confirmed: 5,
      attempted_failed: 0,
      expected_unattempted_known_empty: 100,
      expected_unattempted_pending_fetch: 700,
      total: 1000,
      coverage_pct: 19.5,
    },
  },
  by_venue: {},
  by_venue_data_type: {},
};

describe("HonestCoverageCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading spinner while fetch is in flight", () => {
    vi.spyOn(client, "getHonestCoverage").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<HonestCoverageCard />);
    expect(screen.getByText("Loading coverage…")).toBeTruthy();
  });

  it("renders coverage data with asset-group badges and percentages", async () => {
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(COVERAGE);

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("cefi")).toBeTruthy();
    });

    expect(screen.getByText("defi")).toBeTruthy();
    expect(screen.getByText("49.5%")).toBeTruthy();
    expect(screen.getByText("19.5%")).toBeTruthy();
    expect(screen.getByText("2026-05-15")).toBeTruthy();
  });

  it("shows not-yet-computed message when API returns null", async () => {
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(null);

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(
        screen.getByTestId("honest-coverage-not-yet-computed"),
      ).toBeTruthy();
    });
  });

  it("shows error message when API rejects", async () => {
    vi.spyOn(client, "getHonestCoverage").mockRejectedValue(
      new Error("network error"),
    );

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("network error")).toBeTruthy();
    });
  });

  it("passes explicit date prop through to the API call", async () => {
    const spy = vi
      .spyOn(client, "getHonestCoverage")
      .mockResolvedValue(COVERAGE);

    render(<HonestCoverageCard date="2026-05-14" />);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2026-05-14");
    });
  });
});
