/**
 * LaunchTab — the cockpit's research-launch surface (Phase 0.7).
 *
 * Folds the three research-launch consoles (ML Experiments / Strategy Backtests /
 * Execution Backtests) into one cockpit tab via a segmented sub-control. Each pane
 * is LAZY-loaded + wrapped in an ErrorBoundary so a single console's load/data
 * failure can never blank the Launch tab (its chrome + sub-tabs always render).
 * The pages use a `<div>` shell (NOT `<main>`) and none reads `?tab`, so the
 * cockpit keeps ownership of the tab query-param.
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md Phase 0.7.
 */

import { type ComponentType, lazy, Suspense, useState } from "react";
import { BarChart2, Boxes, GitBranch } from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";

const MlExperiments = lazy(() => import("../../pages/MlExperiments").then((m) => ({ default: m.MlExperiments })));
const StrategyBacktests = lazy(() =>
  import("../../pages/StrategyBacktests").then((m) => ({ default: m.StrategyBacktests })),
);
const ExecutionBacktests = lazy(() =>
  import("../../pages/ExecutionBacktests").then((m) => ({ default: m.ExecutionBacktests })),
);

const LAUNCH_PANES: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}[] = [
  { id: "ml", label: "ML Experiments", icon: BarChart2, Component: MlExperiments },
  { id: "strategy", label: "Strategy Backtests", icon: GitBranch, Component: StrategyBacktests },
  { id: "exec", label: "Execution Backtests", icon: Boxes, Component: ExecutionBacktests },
];

export function LaunchTab() {
  const [active, setActive] = useState("ml");
  const ActivePane = (LAUNCH_PANES.find((p) => p.id === active) ?? LAUNCH_PANES[0]).Component;

  return (
    <div data-testid="cockpit-launch-panes" className="space-y-4">
      <div
        className="inline-flex flex-wrap items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-0.5"
        role="tablist"
      >
        {LAUNCH_PANES.map((p) => {
          const Icon = p.icon;
          const selected = p.id === active;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`cockpit-launch-tab-${p.id}`}
              onClick={() => setActive(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                selected
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          );
        })}
      </div>
      <ErrorBoundary fallbackTitle="This launch console failed to load">
        <Suspense fallback={<p className="text-xs text-[var(--color-text-tertiary)]">Loading console…</p>}>
          <ActivePane />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
