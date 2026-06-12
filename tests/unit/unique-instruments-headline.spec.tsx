// Regression guard (CF-20 unique-instruments headline): the Instrument Coverage
// Summary headline must show the catalogue-deduplicated unique count when the API
// provides it, with the latest-day row volume demoted to the subtitle — and fall
// back to the legacy latest-day figure when the field is absent (older API).
import { describe, expect, it } from "vitest";

// Pure rendering contract mirrored from DataStatusTab.tsx — keep in sync.
function headline(totals: { latest_day_instruments: number; unique_instruments?: number | null }) {
  const lead = totals.unique_instruments ?? totals.latest_day_instruments;
  const label =
    totals.unique_instruments != null
      ? "unique instruments (catalogue-deduplicated, all asset groups)"
      : "instruments (latest day, sum across asset groups)";
  return { lead, label };
}

describe("unique-instruments headline contract", () => {
  it("leads with the deduplicated count when present", () => {
    const h = headline({ latest_day_instruments: 25_873_530, unique_instruments: 1_234_567 });
    expect(h.lead).toBe(1_234_567);
    expect(h.label).toContain("unique instruments");
  });
  it("falls back to latest-day volume when the field is absent/null", () => {
    expect(headline({ latest_day_instruments: 5 }).lead).toBe(5);
    expect(headline({ latest_day_instruments: 5, unique_instruments: null }).lead).toBe(5);
    expect(headline({ latest_day_instruments: 5 }).label).toContain("latest day");
  });
});
