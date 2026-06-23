/**
 * Unit test for the Cockpit page (scaffold stage).
 *
 * Asserts the page renders its header, the Overview tile grid (every monitoring
 * domain present), and all 7 tab triggers — guarding the IA before per-pane data
 * wiring. No API mocks needed (placeholders make no calls).
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
  it("renders the page shell + title", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-page")).toBeTruthy();
    expect(screen.getByText("Cockpit")).toBeTruthy();
  });

  it("renders all 7 tab triggers", () => {
    renderAt("/cockpit");
    for (const id of ["overview", "live", "batch", "paper", "fleet", "consolidators", "health"]) {
      expect(screen.getByTestId(`cockpit-tab-${id}`)).toBeTruthy();
    }
  });

  it("Overview is the default tab and shows the full monitoring tile grid", () => {
    renderAt("/cockpit");
    expect(screen.getByTestId("cockpit-overview")).toBeTruthy();
    for (const id of [
      "live",
      "batch",
      "paper",
      "fleet",
      "consolidators",
      "ci",
      "orchestrator",
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
});
