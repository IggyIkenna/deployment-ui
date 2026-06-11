/**
 * Regression: DependenciesPanel / DependencyDag must NEVER white-screen the whole app
 * (root ErrorBoundary) on a partial / late / raced / drifted payload. Guards the fix for the
 * intermittent `Cannot read properties of undefined (reading 'length')` crash that made the
 * Status tab unreachable in stateful-flows (plan: monitoring_control_plane_master_2026_06_10.md,
 * item 203). A missing optional array (upstream / downstream_dependents / outputs / dag.nodes)
 * renders an empty state, not a crash.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DependenciesPanel, DependencyDag } from "./ServiceDetails";
import type { DependenciesResponse, DagData } from "../types";

describe("DependenciesPanel — partial-payload robustness", () => {
  it("renders empty states (no throw) when the optional arrays are undefined", () => {
    // A payload missing upstream / downstream_dependents / outputs — the exact shape that
    // crashed `.length`/`.map` before the `?? []` guards.
    const partial = {
      service: "instruments-service",
      description: "",
    } as unknown as DependenciesResponse;
    expect(() =>
      render(<DependenciesPanel dependencies={partial} currentService="instruments-service" />),
    ).not.toThrow();
    expect(screen.getByText(/No upstream dependencies/)).toBeTruthy();
    expect(screen.getByText(/No downstream dependents/)).toBeTruthy();
  });

  it("shows the no-info state when dependencies is null", () => {
    const { container } = render(<DependenciesPanel dependencies={null} currentService="x" />);
    expect(container.textContent).toContain("No dependency information");
  });
});

describe("DependencyDag — partial DAG robustness", () => {
  it("renders without throwing when dag.nodes / dag.edges are undefined", () => {
    const badDag = {} as unknown as DagData;
    expect(() => render(<DependencyDag dag={badDag} currentService="x" upstream={[]} downstream={[]} />)).not.toThrow();
  });
});
