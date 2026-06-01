import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeatmapCalendar } from "./HeatmapCalendar";

const START = "2026-04-10";
const END = "2026-04-16";

function cellStatus(date: string) {
  const el = document.querySelector(`[data-testid="heatmap-day-${date}"]`);
  return el?.getAttribute("data-status") ?? null;
}

describe("HeatmapCalendar 4-state rendering (Phase C)", () => {
  it("renders every required state with a distinct data-status", () => {
    render(
      <HeatmapCalendar
        startDate={START}
        endDate={END}
        data={[
          { date: "2026-04-10", status: "complete", coverage: 100 },
          {
            date: "2026-04-11",
            status: "empty_confirmed",
            coverage: 0,
            tooltip: "attempted, confirmed empty",
          },
          {
            date: "2026-04-12",
            status: "attempted_failed",
            coverage: 0,
            errorReason: "RATE_LIMIT_HIT",
          },
          { date: "2026-04-13", status: "missing" },
          { date: "2026-04-14", status: "partial", coverage: 50 },
        ]}
      />,
    );

    expect(cellStatus("2026-04-10")).toBe("complete");
    expect(cellStatus("2026-04-11")).toBe("empty_confirmed");
    expect(cellStatus("2026-04-12")).toBe("attempted_failed");
    expect(cellStatus("2026-04-13")).toBe("missing");
    expect(cellStatus("2026-04-14")).toBe("partial");
  });

  it("legend exposes all 4 honest-coverage states", () => {
    render(
      <HeatmapCalendar
        startDate={START}
        endDate={END}
        data={[{ date: "2026-04-10", status: "complete", coverage: 100 }]}
      />,
    );
    const legend = screen.getByTestId("heatmap-legend");
    expect(legend.querySelector('[data-legend-state="captured"]')).toBeTruthy();
    expect(
      legend.querySelector('[data-legend-state="empty_confirmed"]'),
    ).toBeTruthy();
    expect(
      legend.querySelector('[data-legend-state="attempted_failed"]'),
    ).toBeTruthy();
    expect(legend.querySelector('[data-legend-state="missing"]')).toBeTruthy();
  });

  it("attempted_failed cells expose error in aria-label for a11y", () => {
    render(
      <HeatmapCalendar
        startDate={START}
        endDate={END}
        data={[
          {
            date: "2026-04-12",
            status: "attempted_failed",
            errorReason: "RATE_LIMIT_HIT",
          },
        ]}
      />,
    );
    const cell = screen.getByTestId("heatmap-day-2026-04-12");
    const label = cell.getAttribute("aria-label") ?? "";
    expect(label).toContain("attempted, failed");
    expect(label).toContain("RATE_LIMIT_HIT");
  });

  it("summary footer counts failed days separately from missing", () => {
    render(
      <HeatmapCalendar
        startDate={START}
        endDate={END}
        data={[
          { date: "2026-04-10", status: "complete", coverage: 100 },
          { date: "2026-04-11", status: "attempted_failed" },
          { date: "2026-04-12", status: "attempted_failed" },
          { date: "2026-04-13", status: "missing" },
        ]}
      />,
    );
    expect(screen.getByTestId("heatmap-failed-count").textContent).toBe("2");
  });

  it("no cell renders an 'unknown' state — every cell has a known status", () => {
    render(
      <HeatmapCalendar
        startDate={START}
        endDate={END}
        data={[
          { date: "2026-04-10", status: "complete", coverage: 100 },
          { date: "2026-04-11", status: "empty_confirmed" },
          { date: "2026-04-12", status: "attempted_failed" },
          { date: "2026-04-13", status: "missing" },
          { date: "2026-04-14", status: "partial", coverage: 50 },
          { date: "2026-04-15", status: "future" },
          { date: "2026-04-16", status: "no_expectation" },
        ]}
      />,
    );
    const validStates = new Set([
      "complete",
      "partial",
      "missing",
      "future",
      "no_expectation",
      "empty_confirmed",
      "attempted_failed",
    ]);
    const cells = document.querySelectorAll('[data-testid^="heatmap-day-"]');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((cell) => {
      const status = cell.getAttribute("data-status");
      expect(status).not.toBeNull();
      expect(validStates.has(status ?? "")).toBe(true);
    });
  });
});
