/**
 * Unit test for the Cockpit page (scaffold stage).
 *
 * Asserts the page renders its header, the Health landing tile grid (every
 * monitoring domain present), all 7 tab triggers, and ?tab= deep-linking —
 * guarding the IA before per-pane data wiring. No API mocks needed (placeholders).
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

// live/batch/paper collapsed into ONE "deployments" tab (operator 2026-07-08 merge).
const TAB_IDS = ["health", "deploy", "deployments", "fleet", "consolidators"];

describe("Cockpit", () => {
  it("renders the page shell + title", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-page")).toBeTruthy();
    expect(screen.getByText("Cockpit")).toBeTruthy();
  });

  it("renders the core tab triggers (incl. the merged Deployments tab)", () => {
    renderAt("/cockpit");
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(`cockpit-tab-${id}`)).toBeTruthy();
    }
    // The retired per-mode tabs are gone.
    for (const id of ["live", "batch", "paper"]) {
      expect(screen.queryByTestId(`cockpit-tab-${id}`)).toBeNull();
    }
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
