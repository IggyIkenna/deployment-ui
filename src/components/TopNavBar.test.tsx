/**
 * TopNavBar — the always-visible page nav in the top bar.
 *
 * Inherits the tab-trigger assertions that used to live in Cockpit.test.tsx: the bar was
 * lifted out of the Cockpit into the Header (operator 2026-07-17), so the triggers are no
 * longer that page's to render. What's pinned here is the contract the lift must preserve —
 * the same 16 entries as the dropdown, the retired per-mode tabs staying dead, and cockpit
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
const TAB_IDS = [
  "health",
  "deploy",
  "deployments",
  "fleet",
  "consolidators",
  "ci",
  "alerts",
  "launch",
  "chaos",
  "safety",
];

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

  it("renders the 6 screens with no cockpit twin as route links", () => {
    renderAt("/cockpit");
    // vm-deployments moved to the legacy quarantine (Fleet-tab consolidation, 2026-07-21) — off
    // the canonical bar/dropdown; see NavMenu.test.tsx "legacy quarantine" for its own coverage.
    // venue-config is its relocated venue-panel replacement (2026-07-21).
    for (const id of ["home", "epics", "venue-config", "data-status", "costs", "artifacts"]) {
      expect(screen.getByTestId(`cockpit-navlink-${id}`)).toBeTruthy();
    }
  });

  it("shows all 16 canonical entries — the same list as the dropdown", () => {
    renderAt("/cockpit");
    const bar = screen.getByTestId("top-nav-bar");
    expect(bar.querySelectorAll("a")).toHaveLength(NAV_ITEMS_CANONICAL.length);
    expect(NAV_ITEMS_CANONICAL).toHaveLength(16);
  });

  it("is present off-cockpit too — that is the point of lifting it into the top bar", () => {
    renderAt("/ops/costs");
    expect(screen.getByTestId("top-nav-bar")).toBeTruthy();
    // Each former pane is now its own plain route (2026-07-17: `?tab=` retired).
    expect(screen.getByTestId("cockpit-tab-fleet").getAttribute("href")).toBe("/fleet");
  });

  it("marks the active entry via aria-current, driven by the URL", () => {
    renderAt("/fleet");
    expect(screen.getByTestId("cockpit-tab-fleet").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("cockpit-tab-health").getAttribute("aria-current")).toBeNull();
  });

  it("treats bare /cockpit as the default health tab", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-tab-health").getAttribute("aria-current")).toBe("page");
  });

  it("keeps a route entry lit on its deeper detail routes", () => {
    // /deployments/:name is navItemIsActive's own cited example (NavMenu.tsx docstring) — the
    // prior vm-deployments/:deploymentId case moved to the legacy quarantine (2026-07-21), off
    // this bar entirely, so it can no longer exercise this prefix-match behaviour.
    renderAt("/deployments/some-target-name");
    expect(screen.getByTestId("cockpit-tab-deployments").getAttribute("aria-current")).toBe("page");
  });
});
