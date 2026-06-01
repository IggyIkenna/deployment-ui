/**
 * RiskTab tests — Risk plan Phase 6.C UI close-out.
 *
 * Covers sub-view switching between RuleBrowser (default) and
 * PreflightPlayground. The two children are mocked via props pass-through
 * (RiskTab forwards `ruleBrowserProps` + `preflightProps` to them) so
 * RiskTab's own logic — the React state machine + the nav buttons — is the
 * unit under test.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { RiskTab } from "../../components/widgets/risk/RiskTab";
import type {
  RiskRule,
  RiskRuleScope,
} from "../../components/widgets/risk/RuleBrowser";
import type {
  PreflightResult,
  RuleEvalContext,
} from "../../components/widgets/risk/PreflightPlayground";

const EMPTY_RULES_FETCHER = vi.fn(
  async (_params: {
    scope: RiskRuleScope;
    applies_to: string;
  }): Promise<RiskRule[]> => [],
);

const PASS_PREFLIGHT_SUBMITTER = vi.fn(
  async (_ctx: RuleEvalContext): Promise<PreflightResult> => ({
    decision: "ALLOW",
    scale_factor: 1.0,
    fired_rules: [],
    blocked_by: [],
    composite_reason: "all rules passed",
  }),
);

describe("RiskTab", () => {
  it("renders Risk title and both nav buttons", () => {
    render(
      <RiskTab
        ruleBrowserProps={{ fetcher: EMPTY_RULES_FETCHER }}
        preflightProps={{ submitter: PASS_PREFLIGHT_SUBMITTER }}
      />,
    );
    expect(screen.getByTestId("risk-tab")).toBeTruthy();
    expect(screen.getByTestId("risk-tab-nav-rules")).toBeTruthy();
    expect(screen.getByTestId("risk-tab-nav-preflight")).toBeTruthy();
  });

  it("defaults to the Rules sub-view (RuleBrowser mounted, Preflight hidden)", () => {
    render(
      <RiskTab
        ruleBrowserProps={{ fetcher: EMPTY_RULES_FETCHER }}
        preflightProps={{ submitter: PASS_PREFLIGHT_SUBMITTER }}
      />,
    );
    // Rules view active → fetcher called once on mount; preflight submitter never called.
    expect(EMPTY_RULES_FETCHER).toHaveBeenCalled();
    expect(PASS_PREFLIGHT_SUBMITTER).not.toHaveBeenCalled();
  });

  it("switches to Preflight sub-view when the nav button is clicked", () => {
    render(
      <RiskTab
        ruleBrowserProps={{ fetcher: EMPTY_RULES_FETCHER }}
        preflightProps={{ submitter: PASS_PREFLIGHT_SUBMITTER }}
      />,
    );
    fireEvent.click(screen.getByTestId("risk-tab-nav-preflight"));
    // After click Preflight nav is "default" variant (active) -> has the
    // accent-blue background class.  Rules nav reverts to "outline" variant ->
    // border class instead.
    const preflightBtn = screen.getByTestId("risk-tab-nav-preflight");
    const rulesBtn = screen.getByTestId("risk-tab-nav-rules");
    expect(preflightBtn.className).toContain("bg-[var(--color-accent-blue)]");
    expect(rulesBtn.className).toContain(
      "border-[var(--color-border-default)]",
    );
  });

  it("switches back to Rules when the Rules nav button is clicked", () => {
    render(
      <RiskTab
        ruleBrowserProps={{ fetcher: EMPTY_RULES_FETCHER }}
        preflightProps={{ submitter: PASS_PREFLIGHT_SUBMITTER }}
      />,
    );
    fireEvent.click(screen.getByTestId("risk-tab-nav-preflight"));
    fireEvent.click(screen.getByTestId("risk-tab-nav-rules"));
    const rulesBtn = screen.getByTestId("risk-tab-nav-rules");
    const preflightBtn = screen.getByTestId("risk-tab-nav-preflight");
    expect(rulesBtn.className).toContain("bg-[var(--color-accent-blue)]");
    expect(preflightBtn.className).toContain(
      "border-[var(--color-border-default)]",
    );
  });

  it("renders without props (default fetchers wired via children)", () => {
    // Smoke: child widgets supply their own default fetchers if no props given;
    // RiskTab itself must not throw on the empty-props code path.
    expect(() => render(<RiskTab />)).not.toThrow();
    expect(screen.getByTestId("risk-tab")).toBeTruthy();
  });
});
