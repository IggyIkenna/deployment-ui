import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ReadinessTab } from "./ReadinessTab";

/**
 * Regression: ReadinessTab must render gracefully when the /checklist payload is a
 * non-null object missing its array fields (a partial/raced response, or a stale
 * mock). Before the `?? []` guards, `checklist.blocking_items.length` threw
 * "Cannot read properties of undefined (reading 'length')", crashing the tab into
 * the per-tab ErrorBoundary (same class as the DependenciesPanel fix, item 203).
 */

const mockUseServiceChecklist = vi.fn();
vi.mock("../hooks/useServices", () => ({
  useServiceChecklist: (serviceName: string | null) => mockUseServiceChecklist(serviceName),
}));

const fullChecklist = {
  service: "execution-service",
  last_updated: "2026-03-10T08:00:00Z",
  readiness_percent: 50,
  total_items: 2,
  completed_items: 1,
  partial_items: 0,
  pending_items: 1,
  not_applicable_items: 0,
  categories: [
    {
      name: "build_health",
      display_name: "Build Health",
      percent: 50,
      total_items: 2,
      completed_items: 1,
      items: [
        {
          id: "b1",
          description: "Build passing",
          status: "done",
          notes: "",
          verified_date: "2026-03-10",
          blocking: false,
        },
        {
          id: "b2",
          description: "Canary validated",
          status: "pending",
          notes: "no canary",
          verified_date: null,
          blocking: true,
        },
      ],
    },
  ],
  blocking_items: [{ id: "b2", description: "Canary validated", category: "Build Health", notes: "no canary" }],
};

describe("ReadinessTab partial-payload resilience", () => {
  beforeEach(() => mockUseServiceChecklist.mockReset());

  it("does not throw when a non-null checklist omits blocking_items + categories", () => {
    mockUseServiceChecklist.mockReturnValue({
      checklist: {
        service: "execution-service",
        last_updated: "2026-03-10T08:00:00Z",
        readiness_percent: 40,
        total_items: 5,
        completed_items: 2,
        partial_items: 0,
        pending_items: 3,
        not_applicable_items: 0,
        // blocking_items + categories intentionally absent (the crash payload)
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    expect(() => render(<ReadinessTab serviceName="execution-service" />)).not.toThrow();
  });

  it("renders blocking issues + category when the full payload is present", () => {
    mockUseServiceChecklist.mockReturnValue({
      checklist: fullChecklist,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const { getByText } = render(<ReadinessTab serviceName="execution-service" />);
    expect(getByText(/Blocking Issues/i)).toBeTruthy();
    expect(getByText("Build Health")).toBeTruthy();
  });
});
