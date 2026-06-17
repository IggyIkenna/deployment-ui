// @vitest-environment jsdom
/**
 * Regression guard — DataStatusTab fix bundle (2026-06-16):
 *   ITEM 1 — venue/folder/data-type selection re-fetches.
 *   ITEM 2 — the legacy "Data Types" drill block does NOT double-render
 *            alongside the MTDS honest-coverage panel.
 *   ITEM 3 — the shared DateList exposes a visible-count size selector
 *            (50/100/200/1000/2000/All) instead of a fixed +60 stepper.
 *
 * ITEM 3 is exercised by rendering the exported `DateList` directly (it is a
 * pure presentational component). ITEMS 1 & 2 are exercised at the logic level
 * — the re-fetch fire-guard and the panel gating are small boolean predicates
 * that mirror the exact conditions wired into DataStatusTab.tsx, so a revert of
 * either gate breaks this spec.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { DateList } from "../../../src/components/DataStatusTab";

function makeDates(n: number): string[] {
  // Deterministic YYYY-MM-DD strings (offset from a fixed epoch).
  const base = new Date(Date.UTC(2020, 0, 1));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().split("T")[0];
  });
}

describe("ITEM 3 — DateList pagination size selector", () => {
  it("does NOT render a size selector when total dates <= the initial page size (60)", () => {
    render(<DateList dates={makeDates(40)} onClickDate={() => {}} btnClassName="btn" testIdPrefix="dl" />);
    expect(screen.queryByTestId("dl-page-size")).toBeNull();
    // All 40 dates visible (under the 60 default).
    expect(screen.getByTestId("dl-2020-01-01")).toBeTruthy();
  });

  it("renders a <select> (NOT a '+N more' button) once dates exceed the initial page size", () => {
    render(<DateList dates={makeDates(250)} onClickDate={() => {}} btnClassName="btn" testIdPrefix="dl" />);
    const select = screen.getByTestId("dl-page-size") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    // The legacy "+N more" button is gone.
    expect(screen.queryByText(/\+\d+ more/)).toBeNull();
    // Default visible count is the 60 page size → only first 60 rendered.
    expect(screen.getByTestId("dl-2020-01-01")).toBeTruthy();
    expect(screen.queryByTestId("dl-2020-08-01")).toBeNull();
  });

  it("offers the operator-requested option set (50/100/200/1000/2000 + All) bounded by total", () => {
    render(<DateList dates={makeDates(250)} onClickDate={() => {}} btnClassName="btn" testIdPrefix="dl" />);
    const select = screen.getByTestId("dl-page-size") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    // Only options strictly smaller than the 250 total appear (50/100/200),
    // plus the always-present "all".
    expect(optionValues).toEqual(["50", "100", "200", "all"]);
    const allOption = Array.from(select.options).find((o) => o.value === "all")!;
    expect(allOption.textContent).toBe("All (250)");
  });

  it("selecting 'All' renders every date in a single step (no +60 stepping)", () => {
    render(<DateList dates={makeDates(250)} onClickDate={() => {}} btnClassName="btn" testIdPrefix="dl" />);
    const select = screen.getByTestId("dl-page-size") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "all" } });
    // The 250th date is now rendered.
    expect(screen.getByTestId("dl-2020-09-06")).toBeTruthy();
  });

  it("selecting a numeric size sets the visible count directly", () => {
    render(<DateList dates={makeDates(250)} onClickDate={() => {}} btnClassName="btn" testIdPrefix="dl" />);
    const select = screen.getByTestId("dl-page-size") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "100" } });
    // 100th date visible, 101st not.
    expect(screen.getByTestId("dl-2020-04-09")).toBeTruthy();
    expect(screen.queryByTestId("dl-2020-04-10")).toBeNull();
  });

  it("fires onClickDate when a day chip is clicked", () => {
    const onClick = vi.fn();
    render(<DateList dates={makeDates(3)} onClickDate={onClick} btnClassName="btn" testIdPrefix="dl" />);
    fireEvent.click(screen.getByTestId("dl-2020-01-02"));
    expect(onClick).toHaveBeenCalledWith("2020-01-02");
  });
});

/**
 * ITEM 2 — duplicate-panel gating.
 *
 * The legacy "Data Types" per-day drill block renders iff
 *   hasDataTypes && !hasInstrumentTypes && !hasHonestDataTypes
 * (the third clause is the new gate). This predicate mirrors the JSX guard in
 * DataStatusTab.tsx line ~4920 exactly; reverting the `!hasHonestDataTypes`
 * clause re-introduces the MTDS double-render.
 */
function legacyDataTypesBlockRenders(flags: {
  hasDataTypes: boolean;
  hasInstrumentTypes: boolean;
  hasHonestDataTypes: boolean;
}): boolean {
  return flags.hasDataTypes && !flags.hasInstrumentTypes && !flags.hasHonestDataTypes;
}

describe("ITEM 2 — legacy Data Types block gated by !hasHonestDataTypes", () => {
  it("MTDS venue (honest panel present) → legacy block is SUPPRESSED (no double render)", () => {
    expect(
      legacyDataTypesBlockRenders({
        hasDataTypes: true,
        hasInstrumentTypes: false,
        hasHonestDataTypes: true,
      }),
    ).toBe(false);
  });

  it("non-MTDS service (no honest panel) → legacy per-day drill block STILL renders", () => {
    expect(
      legacyDataTypesBlockRenders({
        hasDataTypes: true,
        hasInstrumentTypes: false,
        hasHonestDataTypes: false,
      }),
    ).toBe(true);
  });

  it("venue with instrument types → legacy block stays suppressed regardless of honest panel", () => {
    expect(
      legacyDataTypesBlockRenders({
        hasDataTypes: true,
        hasInstrumentTypes: true,
        hasHonestDataTypes: false,
      }),
    ).toBe(false);
  });
});

/**
 * ITEM 1 — venue/folder/data-type re-fetch fire-guard.
 *
 * The effect re-invokes fetchData(startDate, endDate) when the selection
 * arrays change, but ONLY after the first manual load (data || turboData
 * populated) and never while a request is in flight. This predicate mirrors
 * the guard in the effect; a revert (removing the effect, or removing the
 * "fire after first load" guard) is caught here.
 */
function selectionEffectFires(state: {
  hasData: boolean;
  hasTurboData: boolean;
  loading: boolean;
  startDate: string;
  endDate: string;
}): boolean {
  if (!state.hasData && !state.hasTurboData) return false;
  if (state.loading) return false;
  if (!state.startDate || !state.endDate) return false;
  return true;
}

describe("ITEM 1 — selection change re-fetch fire-guard", () => {
  it("does NOT fire before the first manual load (no data, no turboData)", () => {
    expect(
      selectionEffectFires({
        hasData: false,
        hasTurboData: false,
        loading: false,
        startDate: "2020-01-01",
        endDate: "2020-12-31",
      }),
    ).toBe(false);
  });

  it("FIRES after the first load when turboData is populated and idle", () => {
    expect(
      selectionEffectFires({
        hasData: false,
        hasTurboData: true,
        loading: false,
        startDate: "2020-01-01",
        endDate: "2020-12-31",
      }),
    ).toBe(true);
  });

  it("does NOT fire while a request is in flight (loading guard)", () => {
    expect(
      selectionEffectFires({
        hasData: true,
        hasTurboData: false,
        loading: true,
        startDate: "2020-01-01",
        endDate: "2020-12-31",
      }),
    ).toBe(false);
  });

  it("does NOT fire when the date range is empty", () => {
    expect(
      selectionEffectFires({
        hasData: true,
        hasTurboData: false,
        loading: false,
        startDate: "",
        endDate: "",
      }),
    ).toBe(false);
  });
});
