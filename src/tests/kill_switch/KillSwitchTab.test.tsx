/**
 * KillSwitchTab tests — DR plan Phase 7.B UI close-out.
 *
 * KillSwitchTab fetches `/api/kill-switch/state` on mount (and every 5s while
 * the "active" sub-view is showing). Tests stub `global.fetch` per the
 * canonical pattern at `LiveDataStatusTab.test.tsx:39`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { KillSwitchTab } from "../../components/widgets/kill_switch/KillSwitchTab";
import type { KillSwitchState } from "../../components/widgets/kill_switch/KillSwitchPanel";

const _mkSwitch = (
  overrides: Partial<KillSwitchState> = {},
): KillSwitchState => ({
  switch_id: "global-emergency",
  scope: "GLOBAL",
  scope_value: null,
  description: "Emergency global stop",
  armed: false,
  armed_at: null,
  armed_by: null,
  provenance: null,
  metadata: null,
  ...overrides,
});

const _mkStateResponse = (switches: KillSwitchState[]) =>
  new Response(
    JSON.stringify({
      switches,
      refreshed_at: "2026-05-11T00:00:00Z",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

describe("KillSwitchTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the loading state on initial mount", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<KillSwitchTab />);
    expect(screen.getByTestId("kill-switch-loading")).toBeTruthy();
  });

  it("renders zero-armed badge when all switches are disarmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          _mkStateResponse([
            _mkSwitch({ switch_id: "global-emergency", armed: false }),
            _mkSwitch({
              switch_id: "cefi-stop",
              scope: "ASSET_GROUP",
              scope_value: "cefi",
              armed: false,
            }),
          ]),
        ),
      ),
    );
    render(<KillSwitchTab />);
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-armed-count").textContent).toContain(
        "0",
      );
    });
  });

  it("renders armed-count badge when ≥1 switch is armed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          _mkStateResponse([
            _mkSwitch({ switch_id: "global-emergency", armed: true, armed_at: "2026-05-11T00:00:00Z", armed_by: "operator" }),
            _mkSwitch({ switch_id: "cefi-stop", scope: "ASSET_GROUP", scope_value: "cefi", armed: false }),
          ]),
        ),
      ),
    );
    render(<KillSwitchTab />);
    await waitFor(() => {
      const badge = screen.getByTestId("kill-switch-armed-count");
      expect(badge.textContent).toContain("1 ARMED");
    });
  });

  it("renders the empty-state when no switches are registered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(_mkStateResponse([]))),
    );
    render(<KillSwitchTab />);
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-empty")).toBeTruthy();
    });
  });

  it("renders the error-state on a 5xx fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
        ),
      ),
    );
    render(<KillSwitchTab />);
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-error")).toBeTruthy();
    });
  });

  it("switches to the Audit log sub-view when the audit nav button is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(_mkStateResponse([]))),
    );
    render(<KillSwitchTab />);
    await waitFor(() => {
      expect(screen.getByTestId("kill-switch-subview-audit")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("kill-switch-subview-audit"));
    // After click, Audit-log nav is "default" variant -> accent-blue
    // background.  Active-switches nav reverts to "outline" -> border class.
    const auditBtn = screen.getByTestId("kill-switch-subview-audit");
    const activeBtn = screen.getByTestId("kill-switch-subview-active");
    expect(auditBtn.className).toContain("bg-[var(--color-accent-blue)]");
    expect(activeBtn.className).toContain("border-[var(--color-border-default)]");
  });

  it("renders the top-level kill-switch-tab container", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(_mkStateResponse([]))),
    );
    render(<KillSwitchTab />);
    expect(screen.getByTestId("kill-switch-tab")).toBeTruthy();
  });
});
