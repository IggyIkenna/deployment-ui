/**
 * VersionCoherencePanel — fleet version-coherence verdicts (VERSION_SPLIT /
 * VESTIGIAL_SCALAR_DRIFT / DEP_FLOOR_UNSATISFIABLE / OK) per repo.
 *
 * Reads GET /api/version-coherence/overview, which proxies the Firestore verdict-store
 * unified-trading-pm's version-coherence-check.yml (scheduled, every 30 min) writes via
 * assert_version_coherence.py --json. **This panel is a pure READ — it never re-derives the
 * verdict itself** (the do-NOT-reimplement trap flagged when this panel was first scoped:
 * CLAUDE.md § "Manifest version-surface semantics" — VESTIGIAL_SCALAR_DRIFT is harmless-when-stale,
 * dep-floors are intentional range pins, not bugs to "fix" by syncing).
 *
 * Self-contained fetch + 60s poll (mirrors GhRateBudget) — degrades to an honest "unavailable"
 * state rather than fabricating a verdict when Firestore can't be reached.
 *
 * Plan: unified-trading-pm/plans/active/monitoring_control_plane_master_2026_06_10.md
 * (version-coherence panel item).
 */

import { useCallback, useEffect, useState } from "react";

import {
  getVersionCoherenceOverview,
  type VersionCoherenceOverview,
  type VersionCoherenceVerdict,
} from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";

const REFRESH_INTERVAL_MS = 60_000;

type Tone = "green" | "yellow" | "red" | "gray";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

/** Tone for each verdict class — VERSION_SPLIT and DEP_FLOOR_UNSATISFIABLE are the two classes
 * assert_version_coherence.py actually gates on (exit 1 without --warn-only);
 * VESTIGIAL_SCALAR_DRIFT is a display-scalar nit (yellow, not red). */
export function versionCoherenceVerdictTone(verdict: VersionCoherenceVerdict): Tone {
  switch (verdict) {
    case "OK":
      return "green";
    case "VESTIGIAL_SCALAR_DRIFT":
      return "yellow";
    case "VERSION_SPLIT":
    case "DEP_FLOOR_UNSATISFIABLE":
      return "red";
    default:
      return "gray";
  }
}

function Chip({ tone, children, testId }: { tone: Tone; children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function VersionCoherencePanel() {
  const [data, setData] = useState<VersionCoherenceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getVersionCoherenceOverview()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useVisibilityPausedInterval(load, REFRESH_INTERVAL_MS);

  const entries = data ? Object.entries(data.repos).sort(([a], [b]) => a.localeCompare(b)) : [];
  const flagged = entries.filter(([, v]) => v.verdict !== "OK");

  return (
    <Card data-testid="version-coherence-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">Version coherence</CardTitle>
        <p className="text-xs text-[var(--color-text-muted)]">
          Fleet version-surface checker · source ==manifest · reads the stored verdict, never re-derives
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <p className="text-xs text-red-400" data-testid="version-coherence-error">
            {error}
          </p>
        )}
        {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
        {data && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs" data-testid="version-coherence-source">
              <span className="text-[var(--color-text-secondary)]">
                {entries.length} repo{entries.length === 1 ? "" : "s"} checked
              </span>
              <Chip tone={data.source === "firestore" ? "green" : data.source === "mock" ? "gray" : "yellow"}>
                {data.source}
              </Chip>
            </div>
            {flagged.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]" data-testid="version-coherence-all-ok">
                {entries.length === 0 ? "No verdicts reported yet." : "All repos coherent."}
              </p>
            ) : (
              <div className="space-y-1" data-testid="version-coherence-flagged">
                {flagged.map(([repo, v]) => (
                  <div
                    key={repo}
                    className="flex items-start justify-between gap-2 text-xs"
                    data-testid={`version-coherence-row-${repo}`}
                  >
                    <span className="font-mono text-[var(--color-text-secondary)] truncate">{repo}</span>
                    <Chip tone={versionCoherenceVerdictTone(v.verdict)} testId={`version-coherence-verdict-${repo}`}>
                      {v.verdict}
                    </Chip>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
