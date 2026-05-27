import { describe, it, expect } from "vitest";
import {
  groupReasonSummary,
  hasRealFailures,
  reasonMeta,
  REASON_META,
} from "../../src/components/dataStatus/reasonCategory";

describe("groupReasonSummary", () => {
  it("buckets each category into its broad group", () => {
    const g = groupReasonSummary({
      captured: 100,
      empty_calendar: 5,
      empty_source_zero: 3,
      fail_auth: 4,
      fail_network: 2,
      fail_phantom: 7,
      pending: 9,
    });
    expect(g.captured).toBe(100);
    expect(g.empty).toBe(8); // 5 + 3
    expect(g.failed).toBe(6); // 4 + 2
    expect(g.phantom).toBe(7);
    expect(g.pending).toBe(9);
  });

  it("legacy migration markers count under failed group", () => {
    const g = groupReasonSummary({ fail_legacy_migration: 12 });
    expect(g.failed).toBe(12);
  });

  it("ignores zero counts and treats undefined as empty", () => {
    expect(groupReasonSummary(undefined)).toEqual({
      captured: 0,
      empty: 0,
      failed: 0,
      phantom: 0,
      pending: 0,
    });
    const g = groupReasonSummary({ captured: 0, fail_auth: 0 });
    expect(g.captured).toBe(0);
    expect(g.failed).toBe(0);
  });

  it("buckets unknown category ids as fail_other (failed group)", () => {
    const g = groupReasonSummary({ totally_unknown_reason: 3 });
    expect(g.failed).toBe(3);
  });
});

describe("hasRealFailures", () => {
  it("is true when a real failure (fail_auth) is present", () => {
    expect(hasRealFailures({ captured: 10, fail_auth: 1 })).toBe(true);
  });

  it("is false when only legacy migration markers are present", () => {
    expect(hasRealFailures({ captured: 10, fail_legacy_migration: 5 })).toBe(
      false,
    );
  });

  it("is false for pure-captured / empty / undefined", () => {
    expect(hasRealFailures({ captured: 10, empty_calendar: 2 })).toBe(false);
    expect(hasRealFailures(undefined)).toBe(false);
  });
});

describe("reasonMeta", () => {
  it("returns the matching meta for a known id", () => {
    expect(reasonMeta("fail_auth").id).toBe("fail_auth");
    expect(reasonMeta("captured")).toBe(REASON_META.captured);
  });

  it("falls back to fail_other for an unknown id", () => {
    expect(reasonMeta("does_not_exist")).toBe(REASON_META.fail_other);
  });
});
