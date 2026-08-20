import { describe, expect, it } from "vitest";

import { formatDenominatorFreshness } from "../../src/lib/data-status-helpers";

describe("data-status denominator freshness annotation", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");

  it("shows the rollup age when the denominator is fresh", () => {
    expect(formatDenominatorFreshness("2026-08-20T11:48:00Z", now)).toEqual({
      label: "denominator last computed 12m ago",
      stale: false,
    });
  });

  it("marks a denominator older than the rollup freshness budget as stale", () => {
    expect(formatDenominatorFreshness("2026-08-20T11:20:00Z", now)).toEqual({
      label: "denominator last computed 40m ago",
      stale: true,
    });
  });

  it("does not invent freshness when the backend omits or corrupts the timestamp", () => {
    expect(formatDenominatorFreshness(undefined, now)).toBeNull();
    expect(formatDenominatorFreshness("not-a-timestamp", now)).toBeNull();
  });
});
