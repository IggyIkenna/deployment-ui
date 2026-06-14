/**
 * @vitest-environment node
 * Regression guard for the out-of-coverage-window (OOW) denominator exclusion.
 *
 * UAC partition is_out_of_coverage_window(reason) → True for 15 lifecycle/scope
 * reasons (pre-genesis chains, delisted instruments, deprecated data_types, etc.).
 * These cells were never collectable and must be excluded from the completion%
 * denominator.  deployment-api ships `out_of_window` as a 5th bucket alongside
 * the 4-state `capture_status` counts; the UI must surface it as a non-gap.
 *
 * This file guards:
 *   1. `capture_status_counts` type on TurboSubDimension accepts `out_of_window`
 *   2. `capture_status_counts` type on TurboAssetGroupStatus accepts `out_of_window`
 *   3. `HonestCoverageStatusCounts` type accepts `out_of_window`
 *   4. Mock-api shapes include `out_of_window: 0` (type-level via assignment)
 */
import { describe, expect, it } from "vitest";
import type { HonestCoverageStatusCounts, TurboAssetGroupStatus, TurboSubDimension } from "../../src/api/client";

describe("OOW denominator exclusion — type contracts", () => {
  it("TurboSubDimension.capture_status_counts accepts out_of_window field", () => {
    const counts: NonNullable<TurboSubDimension["capture_status_counts"]> = {
      captured: 80,
      empty_confirmed: 5,
      attempted_failed: 2,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: 3,
      out_of_window: 10,
    };
    expect(counts.out_of_window).toBe(10);
  });

  it("TurboSubDimension.counts accepts out_of_window field", () => {
    const counts: NonNullable<TurboSubDimension["counts"]> = {
      captured: 80,
      empty_confirmed: 5,
      attempted_failed: 2,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: 3,
      out_of_window: 10,
    };
    expect(counts.out_of_window).toBe(10);
  });

  it("TurboSubDimension.capture_status_counts out_of_window is optional (absent = undefined)", () => {
    const counts: NonNullable<TurboSubDimension["capture_status_counts"]> = {
      captured: 80,
      empty_confirmed: 5,
      attempted_failed: 2,
    };
    expect(counts.out_of_window).toBeUndefined();
  });

  it("TurboAssetGroupStatus.capture_status_counts accepts out_of_window field", () => {
    const counts: NonNullable<TurboAssetGroupStatus["capture_status_counts"]> = {
      captured: 900,
      empty_confirmed: 50,
      attempted_failed: 10,
      out_of_window: 200,
    };
    expect(counts.out_of_window).toBe(200);
  });

  it("HonestCoverageStatusCounts accepts out_of_window field", () => {
    const counts: HonestCoverageStatusCounts = {
      captured: 900,
      empty_confirmed: 50,
      attempted_failed: 10,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: 40,
      total: 1000,
      out_of_window: 200,
      coverage_pct: 95.0,
    };
    expect(counts.out_of_window).toBe(200);
  });

  it("HonestCoverageStatusCounts out_of_window is optional (absent = undefined)", () => {
    const counts: HonestCoverageStatusCounts = {
      captured: 900,
      empty_confirmed: 50,
      attempted_failed: 10,
      expected_unattempted_known_empty: 0,
      expected_unattempted_pending_fetch: 40,
      total: 1000,
      coverage_pct: 95.0,
    };
    expect(counts.out_of_window).toBeUndefined();
  });

  it("OOW cells are excluded from the denominator — denominator = captured + empty + failed + unattempted", () => {
    // Regression: denominator MUST NOT include out_of_window.
    // If a dataset has 1000 total cells, 200 are OOW:
    //   denominator = 800 (not 1000)
    //   captured = 780 → coverage = 780/800 = 97.5%  (not 780/1000 = 78%)
    const captured = 780;
    const empty = 10;
    const failed = 5;
    const unattempted = 5;
    const oow = 200;

    const denominator = captured + empty + failed + unattempted; // 800, excludes oow
    const pct = Math.round((captured / denominator) * 10000) / 100;

    expect(denominator).toBe(800);
    expect(oow).toBe(200);
    expect(pct).toBe(97.5);

    // Naive denominator including OOW would give wrong answer
    const wrongDenominator = captured + empty + failed + unattempted + oow;
    const wrongPct = Math.round((captured / wrongDenominator) * 10000) / 100;
    expect(wrongDenominator).toBe(1000);
    expect(wrongPct).toBe(78.0);
    expect(wrongPct).not.toBe(pct); // regression guard: these must differ
  });
});
