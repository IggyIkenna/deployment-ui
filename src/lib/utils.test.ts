import { describe, it, expect } from "vitest";
import {
  formatEventDrivenCoverageLabel,
  formatRatePerDay,
  isRateMetricRow,
} from "./utils";

describe("formatEventDrivenCoverageLabel", () => {
  it("renders both numbers + empty-rate for PREDICTION (Polymarket) row — captured is headline", () => {
    // Real Polymarket PREDICTION numbers: 99 underlyings observed, 8191/35049
    // shards captured. attempt=100%, capture=23.37%, empty≈0.77.
    const label = formatEventDrivenCoverageLabel(100.0, 23.37, 0.7663);
    expect(label.text).toBe("23.4% captured · 100.0% attempted (77% empty)");
    expect(label.tooltip).toContain("event-driven");
    expect(label.tooltip).toContain("real data on disk");
  });

  it("omits empty-rate when estimate is null (edge case)", () => {
    const label = formatEventDrivenCoverageLabel(100.0, 100.0, null);
    expect(label.text).toBe("100.0% captured · 100.0% attempted");
    // Still explains both axes in the tooltip.
    expect(label.tooltip).toContain("Captured =");
    expect(label.tooltip).toContain("Attempted =");
  });

  it("handles undefined inputs without throwing", () => {
    const label = formatEventDrivenCoverageLabel(
      undefined,
      undefined,
      undefined,
    );
    // 0.0% / 0.0% with no empty-rate suffix; captured first
    expect(label.text).toBe("0.0% captured · 0.0% attempted");
  });

  it("rounds empty-rate to whole %", () => {
    // 0.834 → 83% empty (rounded); captured headline
    const label = formatEventDrivenCoverageLabel(100.0, 16.6, 0.834);
    expect(label.text).toBe("16.6% captured · 100.0% attempted (83% empty)");
  });
});

describe("existing formatters remain intact", () => {
  it("isRateMetricRow still flags over-1.1x rows", () => {
    expect(isRateMetricRow(3311, 1583)).toBe(true);
    expect(isRateMetricRow(100, 100)).toBe(false);
  });

  it("formatRatePerDay still formats (num, den)", () => {
    expect(formatRatePerDay(6319, 1)).toBe("6,319/day");
  });
});
