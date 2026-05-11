/**
 * RiskTab — top-level Risk lifecycle tab (Risk plan Phase 6.C).
 *
 * Composes the two sub-widgets shipped in Round 3:
 *   - RuleBrowser — per-axis rule listing with scope + applies_to filters.
 *   - PreflightPlayground — interactive `risk_preflight` runner.
 *
 * Sub-view switch via React state (no router dependency). Default sub-view
 * is "Rules" (read-only browse before action).
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { RuleBrowser, RuleBrowserProps } from "./RuleBrowser";
import { PreflightPlayground, PreflightPlaygroundProps } from "./PreflightPlayground";

export type RiskSubView = "rules" | "preflight";

export interface RiskTabProps {
  /** Pass-through to RuleBrowser — mocked in tests, production = real fetch. */
  ruleBrowserProps?: RuleBrowserProps;
  /** Pass-through to PreflightPlayground — submitter mock for tests. */
  preflightProps?: PreflightPlaygroundProps;
}

export function RiskTab({ ruleBrowserProps, preflightProps }: RiskTabProps = {}) {
  const [view, setView] = useState<RiskSubView>("rules");

  return (
    <Card data-testid="risk-tab">
      <CardHeader>
        <CardTitle>Risk</CardTitle>
        <div className="flex gap-2 mt-2">
          <Button
            variant={view === "rules" ? "default" : "outline"}
            onClick={() => setView("rules")}
            data-testid="risk-tab-nav-rules"
          >
            Rules
          </Button>
          <Button
            variant={view === "preflight" ? "default" : "outline"}
            onClick={() => setView("preflight")}
            data-testid="risk-tab-nav-preflight"
          >
            Preflight Playground
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {view === "rules" && <RuleBrowser {...(ruleBrowserProps ?? {})} />}
        {view === "preflight" && (
          <PreflightPlayground {...(preflightProps ?? {})} />
        )}
      </CardContent>
    </Card>
  );
}

export default RiskTab;
