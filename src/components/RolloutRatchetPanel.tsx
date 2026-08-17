/**
 * RolloutRatchetPanel — 3-column fleet rollout-ratchet matrix: workflow-template drift,
 * Dockerfile digest-pin status, and ruleset/branch-protection drift, per repo.
 *
 * Reads GET /api/rollout-ratchet/overview (template + ruleset drift) and the digest-pin
 * classification already exposed by GET /api/artifacts/running (DRIFT_PINNED / DRIFT_STALE /
 * etc — the artifact-pipeline feature's own concept; this panel re-reads it via
 * getArtifactRunning, it does NOT re-derive it). **Pure READ on both sources** — never
 * re-derives a verdict itself, mirrors VersionCoherencePanel.tsx.
 *
 * Digest-pin column: `deployment-api`'s DRIFT_* flags describe a live WORKLOAD's runtime image
 * digest (service x artifact-version), not "has this repo's Dockerfile source been converted to
 * @sha256 pinning" — a related but distinct question with no backend signal yet (see the issue
 * doc). This column surfaces the closest available substitute (the running-workload verdict,
 * worst-of per repo inferred from `service` naming) with an honest label, rather than inventing
 * a new backend concept.
 *
 * Plan: unified-trading-pm/plans/active/issues/rollout_ratchet_panel_ui_only_mis_scoped_needs_backend_2026_08_17.md
 */

import { useCallback, useEffect, useState } from "react";

import { getRolloutRatchetOverview, type RolloutRatchetOverview } from "../api/client";
import { getArtifactRunning, type RunningResponse } from "../api/deploymentApi";
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

function verdictTone(verdict: string): Tone {
  switch (verdict) {
    case "CLEAN":
    case "OK":
      return "green";
    case "WARN":
      return "yellow";
    case "ERROR":
    case "DRIFT":
      return "red";
    default:
      return "gray";
  }
}

function digestPinTone(drift: string): Tone {
  switch (drift) {
    case "pinned":
    case "ok":
      return "green";
    case "stale":
    case "fragmented":
      return "yellow";
    case "floating":
    case "hand":
    case "fake":
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

interface RatchetRow {
  repo: string;
  templateDrift: { verdict: string; checkedAt: string | null } | null;
  rulesetDrift: { verdict: string; checkedAt: string | null } | null;
  digestPin: { drift: string; why: string } | null;
}

/** Worst-of digest-pin verdict per repo, inferred from the `running` view's service names —
 * the closest available substitute for "this repo's Dockerfile is digest-pinned" (see header
 * docstring). "" service->repo mapping is best-effort substring match; a service with no
 * matching repo name is simply not shown in this column (honest omission, not a guess). */
function digestPinByRepo(
  running: RunningResponse | null,
  repos: string[],
): Map<string, { drift: string; why: string }> {
  const out = new Map<string, { drift: string; why: string }>();
  if (!running) return out;
  const rank: Record<string, number> = {
    floating: 5,
    hand: 5,
    fake: 5,
    unknown: 3,
    stale: 2,
    fragmented: 2,
    pinned: 0,
    ok: 0,
  };
  for (const repo of repos) {
    let best: { drift: string; why: string } | null = null;
    let bestRank = -1;
    for (const group of running.groups) {
      if (!group.service.toLowerCase().includes(repo.toLowerCase())) continue;
      for (const v of group.versions) {
        for (const d of v.drift) {
          const r = rank[d] ?? 1;
          if (r > bestRank) {
            bestRank = r;
            best = { drift: d, why: v.why };
          }
        }
      }
    }
    if (best) out.set(repo, best);
  }
  return out;
}

export function RolloutRatchetPanel() {
  const [overview, setOverview] = useState<RolloutRatchetOverview | null>(null);
  const [running, setRunning] = useState<RunningResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getRolloutRatchetOverview(), getArtifactRunning()])
      .then(([ov, run]) => {
        setOverview(ov);
        setRunning(run);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useVisibilityPausedInterval(load, REFRESH_INTERVAL_MS);

  const repos = overview
    ? Array.from(new Set([...Object.keys(overview.template_drift), ...Object.keys(overview.ruleset_drift)])).sort()
    : [];
  const pinByRepo = digestPinByRepo(running, repos);

  const rows: RatchetRow[] = repos.map((repo) => ({
    repo,
    templateDrift: overview?.template_drift[repo]
      ? { verdict: overview.template_drift[repo].verdict, checkedAt: overview.template_drift[repo].checked_at }
      : null,
    rulesetDrift: overview?.ruleset_drift[repo]
      ? { verdict: overview.ruleset_drift[repo].verdict, checkedAt: overview.ruleset_drift[repo].checked_at }
      : null,
    digestPin: pinByRepo.get(repo) ?? null,
  }));

  const flagged = rows.filter(
    (r) =>
      (r.templateDrift && r.templateDrift.verdict !== "CLEAN") ||
      (r.rulesetDrift && r.rulesetDrift.verdict !== "CLEAN") ||
      (r.digestPin && r.digestPin.drift !== "pinned" && r.digestPin.drift !== "ok"),
  );

  return (
    <Card data-testid="rollout-ratchet-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">Rollout ratchet</CardTitle>
        <p className="text-xs text-[var(--color-text-muted)]">
          Workflow-template drift · ruleset/branch-protection drift · digest-pin status · reads stored verdicts, never
          re-derives
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <p className="text-xs text-red-400" data-testid="rollout-ratchet-error">
            {error}
          </p>
        )}
        {!overview && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
        {overview && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs" data-testid="rollout-ratchet-sources">
              <span className="text-[var(--color-text-secondary)]">
                {repos.length} repo{repos.length === 1 ? "" : "s"} tracked
              </span>
              <span className="flex items-center gap-1.5">
                <Chip
                  tone={
                    overview.template_drift_source === "firestore"
                      ? "green"
                      : overview.template_drift_source === "mock"
                        ? "gray"
                        : "yellow"
                  }
                  testId="rollout-ratchet-template-source"
                >
                  template: {overview.template_drift_source}
                </Chip>
                <Chip
                  tone={
                    overview.ruleset_drift_source === "firestore"
                      ? "green"
                      : overview.ruleset_drift_source === "mock"
                        ? "gray"
                        : "yellow"
                  }
                  testId="rollout-ratchet-ruleset-source"
                >
                  ruleset: {overview.ruleset_drift_source}
                </Chip>
              </span>
            </div>
            {flagged.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]" data-testid="rollout-ratchet-all-clean">
                {repos.length === 0 ? "No verdicts reported yet." : "All repos clean across all 3 columns."}
              </p>
            ) : (
              <div className="overflow-x-auto" data-testid="rollout-ratchet-table">
                <table className="w-full min-w-[560px] border-collapse text-xs">
                  <thead>
                    <tr className="text-left" style={{ color: "var(--color-text-tertiary)" }}>
                      <th className="px-1.5 py-1 font-medium">Repo</th>
                      <th className="px-1.5 py-1 font-medium">Template drift</th>
                      <th className="px-1.5 py-1 font-medium">Ruleset drift</th>
                      <th className="px-1.5 py-1 font-medium">Digest-pin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.map((r) => (
                      <tr key={r.repo} data-testid={`rollout-ratchet-row-${r.repo}`}>
                        <td className="px-1.5 py-1 font-mono text-[var(--color-text-secondary)]">{r.repo}</td>
                        <td className="px-1.5 py-1">
                          {r.templateDrift ? (
                            <Chip
                              tone={verdictTone(r.templateDrift.verdict)}
                              testId={`rollout-ratchet-template-${r.repo}`}
                            >
                              {r.templateDrift.verdict}
                            </Chip>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">not checked</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          {r.rulesetDrift ? (
                            <Chip
                              tone={verdictTone(r.rulesetDrift.verdict)}
                              testId={`rollout-ratchet-ruleset-${r.repo}`}
                            >
                              {r.rulesetDrift.verdict}
                            </Chip>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">not checked</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          {r.digestPin ? (
                            <Chip tone={digestPinTone(r.digestPin.drift)} testId={`rollout-ratchet-digest-${r.repo}`}>
                              {r.digestPin.drift}
                            </Chip>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">no running workload</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
