/**
 * GhRateBudget — GitHub API rate-budget tracker for the repos surface.
 *
 * The whole fleet shares ONE GitHub PAT (per-user 5000/hr REST budget). When it
 * is exhausted, every GitHub caller 403s (blinding CI reconcile / repo-CI). This
 * widget makes the remaining budget visible so the operator can SEE when it is
 * low, before the 403 wave hits.
 *
 * Consumes GET /api/repos/gh-rate-limit from deployment-api. Polls every 60 s;
 * shows a loading state before first load, "n/a" on error. Renders REST (core) +
 * GraphQL budget bars with remaining/limit, tone-coloured by % remaining.
 *
 * Two pools are surfaced when present: the shared user **PAT** (the fleet-wide
 * 403 source) and the GitHub **App** ("uts-ci-poller") installation-token pool —
 * a SEPARATE 5000/hr budget the fleet's CI pollers now draw from. The App row is
 * rendered only when the API returns the `app` block (best-effort there); when
 * absent only the PAT row shows (no crash).
 *
 * Mirrors agent-orchestrator/dashboard/src/FleetGit.tsx `GhRateLimit` +
 * `rateBudgetTone`, ported to deployment-ui's design system (CSS vars / Tailwind).
 *
 * Plan: gh_rate_budget_tracker_deployment_ui_2026_06_11.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchGhRateLimit } from "../api/ghRateLimit";
import type { GhRatePool, GhRateLimit } from "../api/ghRateLimit";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * GitHub rate-budget % remaining → CSS-var colour token.
 * <10% red, <25% amber, else green. Pure + exported so it is unit-testable in
 * isolation (mirrors FleetGit `rateBudgetTone`).
 */
export function rateBudgetTone(pct: number): string {
  if (pct < 10) return "var(--color-accent-red)";
  if (pct < 25) return "var(--color-accent-amber)";
  return "var(--color-accent-green)";
}

/** Pools rendered, in display order. `core` is the REST budget (the 403 source). */
const POOLS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "core", label: "REST" },
  { key: "graphql", label: "GraphQL" },
];

/** Render the REST + GraphQL bars for one budget pool (PAT or App). `prefix`
 * namespaces the testids so the two rows are independently assertable. */
function PoolBars({ resources, prefix }: { resources: Record<string, GhRatePool>; prefix: string }) {
  return (
    <>
      {POOLS.map(({ key, label }) => {
        const pool = resources[key];
        if (!pool) return null;
        const pct = pool.limit > 0 ? Math.floor((pool.remaining * 100) / pool.limit) : 0;
        const tone = rateBudgetTone(pct);
        return (
          <span key={key} className="inline-flex items-center gap-1.5" data-testid={`${prefix}-pool-${key}`}>
            <span className="text-[var(--color-text-secondary)]">{label}</span>
            <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
              <span className="block h-full" style={{ width: `${pct}%`, background: tone }} />
            </span>
            <span className="font-mono" style={{ color: tone }}>
              {pool.remaining}/{pool.limit}
            </span>
          </span>
        );
      })}
    </>
  );
}

export function GhRateBudget() {
  const [data, setData] = useState<GhRateLimit | null>(null);
  const [err, setErr] = useState(false);
  const cancelledRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchRate = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const j = await fetchGhRateLimit(controller.signal);
      if (!cancelledRef.current) {
        setData(j);
        setErr(false);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (!cancelledRef.current) setErr(true);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void fetchRate();
    return () => {
      cancelledRef.current = true;
      controllerRef.current?.abort();
    };
  }, [fetchRate]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(fetchRate, REFRESH_INTERVAL_MS);

  if (err) {
    return (
      <span className="text-xs text-[var(--color-text-secondary)]" data-testid="gh-rate-budget-error">
        GH budget: n/a
      </span>
    );
  }
  if (!data?.resources) {
    return (
      <span className="text-xs text-[var(--color-text-secondary)]" data-testid="gh-rate-budget-loading">
        GH budget…
      </span>
    );
  }

  const appResources = data.app?.resources;

  return (
    <div
      className="flex items-center gap-3 text-xs"
      data-testid="gh-rate-budget"
      title="GitHub API budget · PAT = shared fleet user token · App = uts-ci-poller (separate pool) · resets hourly"
    >
      <span className="text-[var(--color-text-secondary)]">GH budget:</span>
      <span className="inline-flex items-center gap-2" data-testid="gh-rate-budget-pat">
        <span className="font-medium text-[var(--color-text-secondary)]">PAT</span>
        <PoolBars resources={data.resources} prefix="gh-rate-budget" />
      </span>
      {appResources ? (
        <span className="inline-flex items-center gap-2" data-testid="gh-rate-budget-app">
          <span className="font-medium text-[var(--color-text-secondary)]">App</span>
          <PoolBars resources={appResources} prefix="gh-rate-budget-app" />
        </span>
      ) : null}
    </div>
  );
}
