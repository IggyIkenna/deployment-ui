import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GhRateBudget, rateBudgetTone } from "./GhRateBudget";
import type { GhRateLimit } from "../api/ghRateLimit";

/**
 * GhRateBudget tests — GitHub rate-budget tracker on the repos tab.
 *
 * Covers the pure `rateBudgetTone` mapper (red<10% / amber<25% / else green) in
 * isolation + the component's loading / healthy / low / error render states.
 * Mocks `fetchGhRateLimit` at the api-client module level. Regression guard for
 * the operator-visible fleet-PAT budget bars.
 */

vi.mock("../api/ghRateLimit", () => ({
  fetchGhRateLimit: vi.fn(),
}));

import { fetchGhRateLimit } from "../api/ghRateLimit";
const mockFetch = vi.mocked(fetchGhRateLimit);

const RED = "var(--color-accent-red)";
const AMBER = "var(--color-accent-amber)";
const GREEN = "var(--color-accent-green)";

function makeData(coreRemaining: number, coreLimit = 5000): GhRateLimit {
  return {
    fetched_at: "2026-06-11T12:00:00Z",
    resources: {
      core: { limit: coreLimit, remaining: coreRemaining, used: coreLimit - coreRemaining, reset: 1_780_000_000 },
      graphql: { limit: 5000, remaining: 4800, used: 200, reset: 1_780_000_000 },
      search: { limit: 30, remaining: 30, used: 0, reset: 1_780_000_000 },
    },
  };
}

describe("rateBudgetTone", () => {
  it("returns green when >=25% remaining", () => {
    expect(rateBudgetTone(100)).toBe(GREEN);
    expect(rateBudgetTone(25)).toBe(GREEN);
    expect(rateBudgetTone(50)).toBe(GREEN);
  });

  it("returns amber when 10% <= pct < 25%", () => {
    expect(rateBudgetTone(24)).toBe(AMBER);
    expect(rateBudgetTone(10)).toBe(AMBER);
  });

  it("returns red when pct < 10%", () => {
    expect(rateBudgetTone(9)).toBe(RED);
    expect(rateBudgetTone(0)).toBe(RED);
  });
});

describe("GhRateBudget", () => {
  it("renders a loading state before the first load resolves", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<GhRateBudget />);
    expect(screen.getByTestId("gh-rate-budget-loading")).toBeDefined();
  });

  it("renders REST + GraphQL budget bars after load", async () => {
    mockFetch.mockResolvedValue(makeData(4200));
    render(<GhRateBudget />);
    await waitFor(() => {
      expect(screen.getByTestId("gh-rate-budget")).toBeDefined();
    });
    expect(screen.getByTestId("gh-rate-budget-pool-core").textContent).toContain("4200/5000");
    expect(screen.getByTestId("gh-rate-budget-pool-graphql").textContent).toContain("4800/5000");
  });

  it("tones a healthy REST budget green", async () => {
    mockFetch.mockResolvedValue(makeData(4200)); // 84% -> green
    render(<GhRateBudget />);
    await waitFor(() => {
      expect(screen.getByTestId("gh-rate-budget-pool-core")).toBeDefined();
    });
    const remaining = screen.getByTestId("gh-rate-budget-pool-core").querySelector(".font-mono") as HTMLElement;
    expect(remaining.style.color).toBe(GREEN);
  });

  it("tones a low REST budget red", async () => {
    mockFetch.mockResolvedValue(makeData(200)); // 4% -> red
    render(<GhRateBudget />);
    await waitFor(() => {
      expect(screen.getByTestId("gh-rate-budget-pool-core")).toBeDefined();
    });
    const remaining = screen.getByTestId("gh-rate-budget-pool-core").querySelector(".font-mono") as HTMLElement;
    expect(remaining.style.color).toBe(RED);
  });

  it("shows n/a when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("HTTP 503: down"));
    render(<GhRateBudget />);
    await waitFor(() => {
      expect(screen.getByTestId("gh-rate-budget-error")).toBeDefined();
    });
    expect(screen.getByTestId("gh-rate-budget-error").textContent).toContain("n/a");
  });
});
