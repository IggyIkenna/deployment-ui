/**
 * Unit tests for the cockpit pane page-components.
 *
 * Since the `?tab=` scheme was retired (2026-07-17) each pane is its own plain-route page
 * component (CockpitHealth = /cockpit, CockpitDeploy = /deploy, …) instead of one `Cockpit`
 * that switch-rendered on `?tab=`. These tests render the pane components directly. The
 * always-visible nav bar is asserted in TopNavBar.test.tsx / tests/smoke/top-nav-bar.spec.ts.
 * No API mocks needed (placeholders).
 *
 * CockpitFleet (/fleet) was removed 2026-07-27 — fleet git-health's only home is now
 * agent-orchestrator's own dashboard; see deployment_ui_fleet_tab_removal_2026_07_27.md.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CockpitHealth, CockpitDeploy } from "./Cockpit";

function renderPane(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("Cockpit panes", () => {
  it("Health renders the page shell without a title block (the top bar says where you are)", () => {
    renderPane(<CockpitHealth />);
    expect(screen.getByTestId("cockpit-page")).toBeTruthy();
    // The "Cockpit" heading block was removed — it was pure vertical spend.
    expect(screen.queryByText("unified deployment & health observability")).toBeNull();
  });

  it("Health shows the full monitoring tile grid", () => {
    renderPane(<CockpitHealth />);
    expect(screen.getByTestId("cockpit-health")).toBeTruthy();
    for (const id of [
      "deployments",
      "consolidators",
      "coverage",
      "ci",
      "billing",
      "alerts",
      "artifacts",
      "vm-resources",
    ]) {
      expect(screen.getByTestId(`cockpit-tile-${id}`)).toBeTruthy();
    }
  });

  it("Health lists the Consoles & tools links (other surfaces are one click away)", () => {
    renderPane(<CockpitHealth />);
    expect(screen.getByTestId("cockpit-consoles")).toBeTruthy();
    // "live-ops" was dropped 2026-07-17 — /ops/live-deployments is deleted and its content
    // renders inside the Deployments page. "vm-deployments" was dropped 2026-07-21 — /vm-deployments
    // (the standalone list page) is retired; /deployments is already a top-level nav entry.
    for (const id of ["chaos", "safety-ops", "ml", "strategy", "exec-bt"]) {
      expect(screen.getByTestId(`cockpit-console-${id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("cockpit-console-live-ops")).toBeNull();
    expect(screen.queryByTestId("cockpit-console-vm-deployments")).toBeNull();
  });

  it("Deploy pane exposes the batch/live/paper deploy entry points", () => {
    renderPane(<CockpitDeploy />);
    expect(screen.getByTestId("cockpit-deploy")).toBeTruthy();
    for (const id of ["batch", "live", "paper"]) {
      expect(screen.getByTestId(`cockpit-deploy-${id}`)).toBeTruthy();
    }
  });
});
