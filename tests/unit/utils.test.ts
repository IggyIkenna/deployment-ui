import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRatePerDay,
  isRateMetricRow,
} from "../../src/lib/utils";

describe("formatDate", () => {
  it("formats ISO string to readable date", () => {
    const result = formatDate("2026-03-02T12:00:00Z");
    expect(result).toContain("Mar");
    expect(result).toContain("2");
    expect(result).toContain("2026");
  });

  it("formats Date object", () => {
    const result = formatDate(new Date("2025-12-25T00:00:00Z"));
    expect(result).toContain("Dec");
    expect(result).toContain("25");
    expect(result).toContain("2025");
  });
});

describe("formatDateTime", () => {
  it("includes time components", () => {
    const result = formatDateTime("2026-03-02T14:30:45Z");
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
    // Should have time portion
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it("formats Date object with time", () => {
    const d = new Date("2025-06-15T09:05:30Z");
    const result = formatDateTime(d);
    expect(result).toContain("Jun");
    expect(result).toContain("2025");
  });
});

describe("formatDuration", () => {
  it("formats seconds under a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60)).toBe("1m 0s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(3661)).toBe("1h 1m");
    expect(formatDuration(7200)).toBe("2h 0m");
    expect(formatDuration(86400)).toBe("24h 0m");
  });
});

describe("isRateMetricRow", () => {
  it("flags sports FIXTURE_STATS-style rows where num >> denom", () => {
    // Real examples from the bug report:
    expect(isRateMetricRow(3311, 1583)).toBe(true); // FIXTURE_STATS
    expect(isRateMetricRow(71995, 1583)).toBe(true); // MATCHES
    expect(isRateMetricRow(2116865, 335)).toBe(true); // SFI_PROGRESSIVE_STATS
  });

  it("accepts normal coverage rows where num <= denom", () => {
    expect(isRateMetricRow(100, 100)).toBe(false);
    expect(isRateMetricRow(80, 100)).toBe(false);
    expect(isRateMetricRow(0, 100)).toBe(false);
  });

  it("tolerates slight over-100% drift without flipping to rate", () => {
    // Up to 1.1x ratio = coverage (shard-level noise); above = rate metric.
    expect(isRateMetricRow(105, 100)).toBe(false);
    expect(isRateMetricRow(110, 100)).toBe(false);
    expect(isRateMetricRow(111, 100)).toBe(true);
  });

  it("handles missing or zero denominators safely", () => {
    expect(isRateMetricRow(100, 0)).toBe(false);
    expect(isRateMetricRow(100, null)).toBe(false);
    expect(isRateMetricRow(100, undefined)).toBe(false);
    expect(isRateMetricRow(null, 100)).toBe(false);
    expect(isRateMetricRow(undefined, 100)).toBe(false);
  });
});

describe("formatRatePerDay", () => {
  it("produces `<rate>/day` label from numerator + denominator", () => {
    // 2116865 rows / 335 days ≈ 6,319/day
    expect(formatRatePerDay(2116865, 335)).toBe("6,319/day");
    // 71995 / 1583 ≈ 45/day
    expect(formatRatePerDay(71995, 1583)).toBe("45/day");
    // Small values still formatted
    expect(formatRatePerDay(10, 2)).toBe("5/day");
  });

  it("falls back gracefully on zero denominator", () => {
    expect(formatRatePerDay(100, 0)).toBe("100/day");
  });

  it("rounds to nearest integer", () => {
    expect(formatRatePerDay(7, 2)).toBe("4/day"); // 3.5 → 4
    expect(formatRatePerDay(6, 4)).toBe("2/day"); // 1.5 → 2
  });
});
