// @vitest-environment jsdom
/**
 * Regression guard — Data Status drilldown OOM fan-out (2026-07-15).
 *
 * The per-asset_group hierarchical drilldown lives inside a default-collapsed
 * `<details>`. A native `<details>` collapses its children VISUALLY but React
 * still MOUNTS them, so the drilldown's fetch-on-mount effect used to fire for
 * EVERY asset_group on page load — five concurrent full-index reads that
 * OOM-killed the 4 GiB deployment-api container (503 storm on /drilldown +
 * /api/health flap → "Backend unreachable"). `LazyDrilldownDetails` gates the
 * mount on the `open` state so the expensive request fires ONLY on expand.
 *
 * This spec locks that behaviour: a revert to eager mounting (rendering the
 * child unconditionally) re-fires the fetch while collapsed and breaks it.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../../../src/api/client";
import { LazyDrilldownDetails } from "../../../src/components/DataStatusTab";

const EMPTY_DRILLDOWN = {
  axes: ["venue", "date"],
  tree: [],
  totals: {
    captured: 0,
    empty_confirmed: 0,
    attempted_failed: 0,
    expected_unattempted: 0,
    total: 0,
    completion_pct: 0,
  },
  filtered_by: {},
  service: "instruments-service",
  asset_group: "cefi",
  child_offset: 0,
  child_limit: 200,
  total_top_axis_children: 0,
} as unknown as Awaited<ReturnType<typeof apiClient.getHierarchicalDrilldown>>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LazyDrilldownDetails — fetch only on expand (OOM fan-out guard)", () => {
  it("does NOT call getHierarchicalDrilldown while collapsed", () => {
    const spy = vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(EMPTY_DRILLDOWN);
    render(
      <LazyDrilldownDetails
        service="instruments-service"
        assetGroup="cefi"
        startDate="2026-04-16"
        endDate="2026-07-14"
      />,
    );
    // Collapsed on mount → the expensive drilldown request must not have fired.
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls getHierarchicalDrilldown exactly once, only after the <details> is opened", async () => {
    const spy = vi.spyOn(apiClient, "getHierarchicalDrilldown").mockResolvedValue(EMPTY_DRILLDOWN);
    render(
      <LazyDrilldownDetails
        service="instruments-service"
        assetGroup="cefi"
        startDate="2026-04-16"
        endDate="2026-07-14"
      />,
    );
    expect(spy).not.toHaveBeenCalled();

    // Expand: set the native open state + dispatch the `toggle` event so the
    // onToggle handler runs and mounts the child (jsdom does not auto-toggle
    // <details> on summary click).
    const details = screen.getByText(/Hierarchical drill-down/i).closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle", { bubbles: false }));

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ service: "instruments-service", asset_group: "cefi" }));
  });
});
