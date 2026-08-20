/**
 * TopNavBar — the always-visible page nav in the top bar (the sole desktop nav surface;
 * the dropdown it used to run alongside was RULED 2026-07-28 and deleted).
 *
 * Inherits the tab-trigger assertions that used to live in Cockpit.test.tsx: the bar was
 * lifted out of the Cockpit into the Header (operator 2026-07-17), so the triggers are no
 * longer that page's to render. What's pinned here is the contract the lift must preserve —
 * the full NAV_ITEMS_CANONICAL list, the retired per-mode tabs staying dead, and cockpit
 * entries rendering as URL Links (which is what lets the bar select a tab from any route).
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TopNavBar } from "./TopNavBar";
import { NAV_ITEMS_CANONICAL } from "./NavMenu";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopNavBar />
    </MemoryRouter>,
  );
}

// live/batch/paper collapsed into ONE "deployments" tab (operator 2026-07-08 merge).
const TAB_IDS = ["health", "deploy", "deployments", "consolidators", "ci", "alerts", "launch", "chaos", "safety"];

describe("TopNavBar", () => {
  it("renders every cockpit tab trigger (incl. the merged Deployments tab)", () => {
    renderAt("/cockpit");
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(`cockpit-tab-${id}`)).toBeTruthy();
    }
    // The retired per-mode tabs are gone.
    for (const id of ["live", "batch", "paper"]) {
      expect(screen.queryByTestId(`cockpit-tab-${id}`)).toBeNull();
    }
  });

  it("renders the 8 screens with no cockpit twin as route links", () => {
    renderAt("/cockpit");
    // vm-deployments (the standalone list page) is fully retired (2026-07-21) — see
    // NavMenu.test.tsx "legacy quarantine" for the nav-side coverage. venue-config is its
    // relocated venue-panel replacement (2026-07-21). vm-resource-comparison added 2026-07-27.
    // cloud-run-jobs added 2026-08-20 (deployment_service_api_integration_cleanup_2026_08_18.md item 9).
    for (const id of [
      "home",
      "epics",
      "venue-config",
      "cloud-run-jobs",
      "data-status",
      "costs",
      "vm-resource-comparison",
      "artifacts",
    ]) {
      expect(screen.getByTestId(`cockpit-navlink-${id}`)).toBeTruthy();
    }
  });

  it("shows all 17 canonical entries — the bar is the sole nav surface", () => {
    renderAt("/cockpit");
    const bar = screen.getByTestId("top-nav-bar");
    expect(bar.querySelectorAll("a")).toHaveLength(NAV_ITEMS_CANONICAL.length);
    expect(NAV_ITEMS_CANONICAL).toHaveLength(17);
  });

  it("is present off-cockpit too — that is the point of lifting it into the top bar", () => {
    renderAt("/ops/costs");
    expect(screen.getByTestId("top-nav-bar")).toBeTruthy();
    // Each former pane is now its own plain route (2026-07-17: `?tab=` retired).
    expect(screen.getByTestId("cockpit-tab-consolidators").getAttribute("href")).toBe("/consolidators");
  });

  it("marks the active entry via aria-current, driven by the URL", () => {
    renderAt("/consolidators");
    expect(screen.getByTestId("cockpit-tab-consolidators").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("cockpit-tab-health").getAttribute("aria-current")).toBeNull();
  });

  it("treats bare /cockpit as the default health tab", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-tab-health").getAttribute("aria-current")).toBe("page");
  });

  it("keeps a route entry lit on its deeper detail routes", () => {
    // /deployments/:name is navItemIsActive's own cited example (NavMenu.tsx docstring) — the
    // prior vm-deployments/:deploymentId case is off this bar entirely (no nav entry, and
    // /vm-deployments itself is retired, 2026-07-21), so it can no longer exercise this
    // prefix-match behaviour.
    renderAt("/deployments/some-target-name");
    expect(screen.getByTestId("cockpit-tab-deployments").getAttribute("aria-current")).toBe("page");
  });
});
