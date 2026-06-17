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
    vi.spyOn(client, "getHonestCoverage").mockImplementation(() => new Promise(() => {}));

    render(<HonestCoverageCard />);
    expect(screen.getByText("Loading coverage…")).toBeTruthy();
  });

  it("renders the computed manifest-capture headline (not the captured-only coverage_pct)", async () => {
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(COVERAGE);

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("cefi")).toBeTruthy();
    });

    expect(screen.getByText("defi")).toBeTruthy();
    expect(screen.getByText("2026-05-15")).toBeTruthy();

    // Headline = manifest-capture ratio (of attempted) computed from raw counts:
    //   cefi: (495+0+0)/(495+0+0+10)              = 98.0%
    //   defi: (195+5+100)/(195+5+100+0)           = 100.0%
    // It must NOT render the cron's captured-only coverage_pct (49.5% / 19.5%).
    const headlines = screen.getAllByTestId("coverage-manifest-capture").map((el) => el.textContent);
    expect(headlines).toContain("98.0%");
    expect(headlines).toContain("100.0%");
    expect(headlines).not.toContain("49.5%");
    expect(headlines).not.toContain("19.5%");

    // Secondary captured-only ratio:
    //   cefi: 495/505 = 98.0% captured ; defi: 195/300 = 65.0% captured
    const captured = screen.getAllByTestId("coverage-captured").map((el) => el.textContent);
    expect(captured.some((t) => t?.includes("65.0% captured"))).toBe(true);
  });

  it("shows not-yet-computed message when API returns null", async () => {
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(null);

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByTestId("honest-coverage-not-yet-computed")).toBeTruthy();
    });
  });

  it("shows error message when API rejects", async () => {
    vi.spyOn(client, "getHonestCoverage").mockRejectedValue(new Error("network error"));

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("network error")).toBeTruthy();
    });
  });

  it("passes explicit date prop through to the API call", async () => {
    const spy = vi.spyOn(client, "getHonestCoverage").mockResolvedValue(COVERAGE);

    render(<HonestCoverageCard date="2026-05-14" />);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith("2026-05-14");
    });
  });
});
