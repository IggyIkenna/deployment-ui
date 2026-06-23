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

const TAB_IDS = ["health", "deploy", "live", "batch", "paper", "fleet", "consolidators"];

describe("Cockpit", () => {
  it("renders the page shell + title", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-page")).toBeTruthy();
    expect(screen.getByText("Cockpit")).toBeTruthy();
  });

  it("renders all 7 tab triggers", () => {
    renderAt("/cockpit");
    for (const id of TAB_IDS) {
      expect(screen.getByTestId(`cockpit-tab-${id}`)).toBeTruthy();
    }
  });

  it("Health is the default tab and shows the full monitoring tile grid", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-health")).toBeTruthy();
    for (const id of [
      "live",
      "batch",
      "paper",
      "fleet",
      "consolidators",
      "coverage",
      "ci",
      "github",
      "billing",
      "alerts",
    ]) {
      expect(screen.getByTestId(`cockpit-tile-${id}`)).toBeTruthy();
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
