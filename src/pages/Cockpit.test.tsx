/**
 * Unit test for the Cockpit page (scaffold stage).
 *
 * Asserts the page renders its shell, the Health landing tile grid (every monitoring
 * domain present), and ?tab= deep-linking — guarding the IA before per-pane data wiring.
 * No API mocks needed (placeholders).
 *
 * The tab BAR is no longer this page's: it was lifted into the top bar so it shows on
 * every route (operator 2026-07-17), so its triggers are asserted in TopNavBar.test.tsx.
 * This page still owns which pane `?tab=` renders, which is what the deep-link test pins.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Cockpit } from "./Cockpit";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Cockpit />
    </MemoryRouter>,
  );
}

describe("Cockpit", () => {
  it("renders the page shell without a title block (the top bar says where you are)", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-page")).toBeTruthy();
    // The "Cockpit" heading block was removed — it was pure vertical spend.
    expect(screen.queryByText("unified deployment & health observability")).toBeNull();
  });

  it("Health is the default tab and shows the full monitoring tile grid", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-health")).toBeTruthy();
    for (const id of ["deployments", "fleet", "consolidators", "coverage", "ci", "github", "billing", "alerts"]) {
      expect(screen.getByTestId(`cockpit-tile-${id}`)).toBeTruthy();
    }
  });

  it("Health landing lists the Consoles & tools links (folded surfaces are reachable)", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-consoles")).toBeTruthy();
    for (const id of ["vm-deployments", "live-ops", "chaos", "safety-ops", "ml", "strategy", "exec-bt"]) {
      expect(screen.getByTestId(`cockpit-console-${id}`)).toBeTruthy();
    }
  });

  it("honours the ?tab= query param for deep-linking", () => {
    renderAt("/cockpit?tab=fleet");
    expect(screen.getByTestId("cockpit-fleet")).toBeTruthy();
    expect(screen.getByTestId("cockpit-fleet-card-unknown")).toBeTruthy();
  });

  it("Deploy tab exposes the batch/live/paper deploy entry points", () => {
    renderAt("/cockpit?tab=deploy");
    expect(screen.getByTestId("cockpit-deploy")).toBeTruthy();
    for (const id of ["batch", "live", "paper"]) {
      expect(screen.getByTestId(`cockpit-deploy-${id}`)).toBeTruthy();
    }
  });
});
