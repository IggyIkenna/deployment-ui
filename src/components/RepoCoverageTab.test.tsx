import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RepoCoverageTab } from "./RepoCoverageTab";
import type { RepoCoverage } from "../api/repoCoverage";

vi.mock("../api/repoCoverage", () => ({
  fetchRepoCoverage: vi.fn(),
}));

import { fetchRepoCoverage } from "../api/repoCoverage";
const mockFetch = vi.mocked(fetchRepoCoverage);

const MOCK_DATA: RepoCoverage[] = [
  {
    repo: "deployment-api",
    all_above_target: true,
    snapshot_at: "2026-05-17T06:00:00Z",
    worst_surface: null,
    worst_actual_pct: null,
    worst_target_pct: null,
  },
  {
    repo: "features-service",
    all_above_target: false,
    snapshot_at: "2026-05-17T06:00:00Z",
    worst_surface: "per_archetype_calculators",
    worst_actual_pct: 79.5,
    worst_target_pct: 90,
  },
];

describe("RepoCoverageTab", () => {
  it("renders loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<RepoCoverageTab />);
    expect(screen.getByTestId("repo-coverage-tab")).toBeDefined();
  });

  it("renders coverage data after load", async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    render(<RepoCoverageTab />);
    await waitFor(() => {
      expect(screen.getByTestId("coverage-table-body")).toBeDefined();
    });
    expect(screen.getByTestId("coverage-row-deployment-api")).toBeDefined();
    expect(screen.getByTestId("coverage-row-features-service")).toBeDefined();
  });

  it("shows green badge for above-target repo", async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    render(<RepoCoverageTab />);
    await waitFor(() => {
      expect(screen.getByTestId("coverage-row-deployment-api")).toBeDefined();
    });
    const row = screen.getByTestId("coverage-row-deployment-api");
    expect(row.textContent).toContain("All green");
  });

  it("shows red badge with worst surface for below-target repo", async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);
    render(<RepoCoverageTab />);
    await waitFor(() => {
      expect(screen.getByTestId("coverage-row-features-service")).toBeDefined();
    });
    const row = screen.getByTestId("coverage-row-features-service");
    expect(row.textContent).toContain("Below target");
    expect(row.textContent).toContain("per_archetype_calculators");
    expect(row.textContent).toContain("79.5%");
  });

  it("shows error message when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<RepoCoverageTab />);
    await waitFor(() => {
      expect(screen.getByTestId("coverage-error")).toBeDefined();
    });
    expect(screen.getByTestId("coverage-error").textContent).toContain(
      "Network error",
    );
  });

  it("shows empty state when no data returned", async () => {
    mockFetch.mockResolvedValue([]);
    render(<RepoCoverageTab />);
    await waitFor(() => {
      expect(screen.queryByTestId("coverage-table-body")).toBeNull();
    });
    expect(screen.getByTestId("repo-coverage-tab").textContent).toContain(
      "No data",
    );
  });
});
