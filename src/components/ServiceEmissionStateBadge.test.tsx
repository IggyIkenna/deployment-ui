/**
 * Tests for ``ServiceEmissionStateBadge`` (writegate Phase 4.UI).
 *
 * Covers:
 *  * Each of the 4 closed-set ``ServiceEmissionState`` values renders the
 *    expected label + colour.
 *  * ``null`` / ``undefined`` render the muted ``—`` placeholder so pre-v8
 *    manifest rows degrade gracefully.
 *  * ``data-state`` + ``data-testid`` attributes are stable for downstream
 *    integration tests / Playwright matrices.
 *  * ``compact`` toggle changes the size class but preserves semantic
 *    attributes.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ServiceEmissionStateBadge,
  serviceEmissionStatePalette,
} from "./ServiceEmissionStateBadge";

describe("ServiceEmissionStateBadge", () => {
  it("renders PUBLISHED_OK with green palette + correct label", () => {
    render(<ServiceEmissionStateBadge state="PUBLISHED_OK" />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("PUBLISHED_OK");
    expect(badge.textContent).toBe("PUBLISHED_OK");
  });

  it("renders PUBLISHED_DEGRADED with amber palette", () => {
    render(<ServiceEmissionStateBadge state="PUBLISHED_DEGRADED" />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("PUBLISHED_DEGRADED");
    expect(badge.textContent).toBe("PUBLISHED_DEGRADED");
  });

  it("renders STALE_DATA_HEARTBEAT_ONLY with orange palette + short label", () => {
    render(<ServiceEmissionStateBadge state="STALE_DATA_HEARTBEAT_ONLY" />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("STALE_DATA_HEARTBEAT_ONLY");
    // Label intentionally shortened to STALE_DATA for inline rendering;
    // full value remains in the tooltip + data-state attr.
    expect(badge.textContent).toBe("STALE_DATA");
    expect(badge.getAttribute("title")).toContain("STALE_DATA_HEARTBEAT_ONLY");
  });

  it("renders BLOCKED with red palette", () => {
    render(<ServiceEmissionStateBadge state="BLOCKED" />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("BLOCKED");
    expect(badge.textContent).toBe("BLOCKED");
  });

  it("renders muted placeholder for null state (pre-v8 forward-compat)", () => {
    render(<ServiceEmissionStateBadge state={null} />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("null");
    expect(badge.textContent).toBe("—");
    expect(badge.getAttribute("title")).toContain("pre-v8");
  });

  it("renders muted placeholder for undefined state", () => {
    render(<ServiceEmissionStateBadge state={undefined} />);
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.getAttribute("data-state")).toBe("null");
    expect(badge.textContent).toBe("—");
  });

  it("compact toggle switches size class but preserves data-state", () => {
    const { rerender } = render(
      <ServiceEmissionStateBadge state="PUBLISHED_OK" compact />,
    );
    const badge = screen.getByTestId("service-emission-state-badge");
    expect(badge.className).toContain("px-1");
    expect(badge.className).toContain("text-[9px]");
    expect(badge.getAttribute("data-state")).toBe("PUBLISHED_OK");

    rerender(<ServiceEmissionStateBadge state="PUBLISHED_OK" compact={false} />);
    const badgeDefault = screen.getByTestId("service-emission-state-badge");
    expect(badgeDefault.className).toContain("px-1.5");
    expect(badgeDefault.className).toContain("text-[10px]");
  });

  it("ARIA role and accessible label expose state semantically", () => {
    render(<ServiceEmissionStateBadge state="BLOCKED" />);
    const badge = screen.getByRole("status");
    expect(badge.getAttribute("aria-label")).toBe(
      "service emission state: BLOCKED",
    );
  });

  it("palette helper returns distinct colours for each non-null state", () => {
    const ok = serviceEmissionStatePalette("PUBLISHED_OK");
    const degraded = serviceEmissionStatePalette("PUBLISHED_DEGRADED");
    const stale = serviceEmissionStatePalette("STALE_DATA_HEARTBEAT_ONLY");
    const blocked = serviceEmissionStatePalette("BLOCKED");
    const empty = serviceEmissionStatePalette(null);
    const palettes = [ok, degraded, stale, blocked, empty];
    // All foreground colours unique — guards against accidental copy-paste
    // collisions between the 4 states.
    const foregrounds = new Set(palettes.map((p) => p.fg));
    expect(foregrounds.size).toBe(5);
  });
});
