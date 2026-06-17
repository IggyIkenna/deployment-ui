// Regression guard (R7, 2026-06-15): the Data Coverage (TURBO) headline must show an
// explicit CAPTURED vs ATTEMPTED split, not the ambiguous `completion_pct`.
//   capture  = could-exist cells that actually have data (captured / expected)
//   attempt  = cells we have an HONEST answer for (captured + empty_confirmed + failed) / expected
//              — empty confirmations count as COVERED, the operator-correct reading.
// Falls back to overall_completion_pct for capture (same value) and HIDES the attempt
// line until the backend overall_attempt_coverage_pct field deploys (older API).
// Pure rendering contract mirrored from DataStatusTab.tsx headline — keep in sync.
import { describe, expect, it } from "vitest";

function coverageHeadline(t: {
  overall_completion_pct: number;
  overall_capture_coverage_pct?: number;
  overall_attempt_coverage_pct?: number;
}) {
  return {
    captured: t.overall_capture_coverage_pct ?? t.overall_completion_pct,
    capturedLabel: "captured",
    attempt: t.overall_attempt_coverage_pct != null ? t.overall_attempt_coverage_pct : null,
    attemptLabel: t.overall_attempt_coverage_pct != null ? "attempted" : null,
  };
}

describe("data-coverage capture-vs-attempt headline contract", () => {
  it("shows captured + attempted labelled distinctly when both fields present", () => {
    const h = coverageHeadline({
      overall_completion_pct: 94.43,
      overall_capture_coverage_pct: 94.43,
      overall_attempt_coverage_pct: 100.0,
    });
    expect(h.captured).toBe(94.43);
    expect(h.capturedLabel).toBe("captured");
    expect(h.attempt).toBe(100.0);
    expect(h.attemptLabel).toBe("attempted");
  });

  it("falls back to overall_completion_pct for capture + hides attempt when fields absent (older API)", () => {
    const h = coverageHeadline({ overall_completion_pct: 70.2 });
    expect(h.captured).toBe(70.2);
    expect(h.capturedLabel).toBe("captured");
    expect(h.attempt).toBeNull();
    expect(h.attemptLabel).toBeNull();
  });
});
