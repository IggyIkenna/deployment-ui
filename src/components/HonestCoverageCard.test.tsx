/**
 * HonestCoverageCard unit tests.
 *
 * Covers:
 *   1. Loading spinner while fetch is in flight.
 *   2. Renders per-asset-group coverage bars and percentages with correct date.
 *   3. Shows "not yet computed" when API returns null (404).
 *   4. Shows error message when API rejects.
 *   5. Passes explicit date prop through to the API call.
 *   6. Honest-absence: partial banner lists failed asset groups (P1 fix).
 *   7. Staleness: stale banner when a non-partial file predates today (14-day fallback).
 *   8. No banner when the file is today's and complete.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 4.C;
 *       data-status P1 honest-coverage partial/stale surfacing (2026-07-16).
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

  it("shows a partial banner listing the failed asset groups when the run was partial", async () => {
    const partial: HonestCoverageResponse = {
      ...COVERAGE,
      partial: true,
      asset_groups_requested: ["cefi", "defi", "tradfi", "sports", "prediction"],
      asset_groups_measured: ["cefi", "defi"],
      asset_groups_failed: ["tradfi", "sports", "prediction"],
    };
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(partial);

    render(<HonestCoverageCard />);

    const banner = await screen.findByTestId("honest-coverage-partial-banner");
    expect(banner.textContent).toContain("3 asset groups failed to load");
    expect(banner.textContent).toContain("tradfi, sports, prediction");
    expect(banner.textContent).toContain("Showing 2 of 5");
    // Partial takes precedence — the stale banner must not also render.
    expect(screen.queryByTestId("honest-coverage-stale-banner")).toBeNull();
  });

  it("shows a stale banner when a non-partial file predates today (14-day fallback)", async () => {
    // COVERAGE.date is 2026-05-15 — always in the past relative to the test run.
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(COVERAGE);

    render(<HonestCoverageCard />);

    const banner = await screen.findByTestId("honest-coverage-stale-banner");
    expect(banner.textContent).toContain("2026-05-15");
    expect(screen.queryByTestId("honest-coverage-partial-banner")).toBeNull();
  });

  it("Honest-Coverage v2: gates the Layer-2 headline amber + shows Layer-1 completeness when denominator_complete is false — leaves a complete AG unaffected (synthetic-gap fixture)", async () => {
    const V2_COVERAGE: HonestCoverageResponse = {
      generated_at: "2026-08-09T06:00:00Z",
      date: "2026-08-09",
      schema_version: 2,
      by_asset_group: {
        // Layer-1 INCOMPLETE (79.55%) — Layer-2 must be gated: amber headline,
        // the "DENOMINATOR INCOMPLETE" badge, and the layer-1 completeness row.
        cefi: {
          captured: 950,
          empty_confirmed: 0,
          attempted_failed: 0,
          expected_unattempted: 50,
          total: 1000,
          coverage_pct: 95.0,
          denominator_complete: false,
          instrument_gates_download: true,
          layer1_completeness_pct: 79.5,
        },
        // Layer-1 COMPLETE (100%) — same near-identical Layer-2 numbers must
        // render WITHOUT the gate: this is the "correct layer drags down"
        // proof — only the incomplete AG's rendering is dragged into the
        // gated/lower-bound treatment, not every AG uniformly.
        defi: {
          captured: 950,
          empty_confirmed: 0,
          attempted_failed: 0,
          expected_unattempted: 50,
          total: 1000,
          coverage_pct: 95.0,
          denominator_complete: true,
          instrument_gates_download: false,
          layer1_completeness_pct: 100.0,
        },
      },
      by_venue: {},
      by_venue_data_type: {},
    };
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue(V2_COVERAGE);

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("cefi")).toBeTruthy();
    });

    // cefi (gated): headline carries data-layer2-gated + the incomplete badge
    // + a visible layer-1 completeness row.
    const headlines = screen.getAllByTestId("coverage-manifest-capture");
    const cefiHeadline = headlines.find((el) => el.getAttribute("data-layer2-gated") === "true");
    expect(cefiHeadline).toBeTruthy();
    expect(cefiHeadline?.className).toContain("text-amber-500");

    const badges = screen.getAllByTestId("coverage-denominator-incomplete-badge");
    expect(badges).toHaveLength(1); // only cefi, not defi

    const layer1Rows = screen.getAllByTestId("coverage-layer1-completeness").map((el) => el.textContent);
    expect(layer1Rows).toContain("79.5%");
    expect(layer1Rows).toContain("100.0%");

    // defi (complete): its headline must NOT be gated/amber.
    const defiHeadline = headlines.find((el) => el.getAttribute("data-layer2-gated") !== "true");
    expect(defiHeadline).toBeTruthy();
    expect(defiHeadline?.className).not.toContain("text-amber-500");
  });

  it("shows no banner when the file is today's and complete", async () => {
    const now = new Date();
    const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(
      now.getUTCDate(),
    ).padStart(2, "0")}`;
    vi.spyOn(client, "getHonestCoverage").mockResolvedValue({ ...COVERAGE, date: todayUtc });

    render(<HonestCoverageCard />);

    await waitFor(() => {
      expect(screen.getByText("cefi")).toBeTruthy();
    });
    expect(screen.queryByTestId("honest-coverage-partial-banner")).toBeNull();
    expect(screen.queryByTestId("honest-coverage-stale-banner")).toBeNull();
  });
});
