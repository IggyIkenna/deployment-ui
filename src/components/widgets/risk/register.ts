/**
 * Risk widget registry — Risk plan Phase 6.C registration.
 *
 * Exports the three Risk-cluster widgets (RiskTab + RuleBrowser +
 * PreflightPlayground) at canonical widget-registry shape so deployment-ui's
 * lifecycle nav can mount them.
 */

import { PreflightPlayground } from "./PreflightPlayground";
import { RiskTab } from "./RiskTab";
import { RuleBrowser } from "./RuleBrowser";

export interface WidgetRegistration {
  id: string;
  label: string;
  component: React.ComponentType<unknown>;
}

export const RISK_WIDGETS: readonly WidgetRegistration[] = [
  {
    id: "risk-tab",
    label: "Risk",
    component: RiskTab as React.ComponentType<unknown>,
  },
  {
    id: "risk-rule-browser",
    label: "Risk: Rule Browser",
    component: RuleBrowser as React.ComponentType<unknown>,
  },
  {
    id: "risk-preflight-playground",
    label: "Risk: Preflight Playground",
    component: PreflightPlayground as React.ComponentType<unknown>,
  },
] as const;

export { RiskTab, RuleBrowser, PreflightPlayground };
