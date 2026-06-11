/**
 * Repo-CI dashboard — fleet view of all repos' promotion-cycle state.
 *
 * One screen instead of 25 GitHub-UI visits: live SIT-run panel (alert-parity), the
 * stuck triage queue (stuck PRs + stuck-in-SIT), the 25-repo overview matrix, and a
 * repo dropdown drill-down (branch SHA history + v2 conclusions + PR cards + image).
 *
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import {
  getRepoCiDetail,
  getRepoCiOverview,
  type RepoCiDetail,
  type RepoCiOverview,
  type RepoCiOverviewRow,
  type RepoCiPr,
  type RepoCiSitLastRun,
} from "../api/client";
import {
  ciStatusTone,
  deltaLabel,
  formatAge,
  githubChecksUrl,
  githubCommitUrl,
  rowSeverity,
  shortSha,
  sitJobTone,
  STUCK_CLASS_LABELS,
  stuckClassTone,
  type ChipTone,
} from "../lib/repoCi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { GhRateBudget } from "../components/GhRateBudget";

const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
  blue: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
};

function Chip({ tone, children, testId }: { tone: ChipTone; children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A short-SHA that deep-links to its GitHub commit page (operator click-through rule:
 * GitHub-authoritative atoms link to GitHub). Renders a plain dash when no SHA. */
function ShaLink({ repo, sha }: { repo: string; sha: string | null }) {
  const url = githubCommitUrl(repo, sha);
  if (!url) return <span>—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:underline text-[var(--color-text-secondary)]"
    >
      {shortSha(sha)}
    </a>
  );
}

function SitRunPanel({ run }: { run: RepoCiSitLastRun | null }) {
  return (
    <Card data-testid="sit-run-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Last SIT / cascade run
          {run && (
            <Chip tone={run.conclusion === "success" ? "green" : run.conclusion ? "red" : "blue"}>
              {run.conclusion ?? run.status}
            </Chip>
          )}
          {run && (
            <span className="text-xs text-[var(--color-text-muted)] font-normal">{formatAge(run.age_min)} ago</span>
          )}
          {run?.url && (
            <a href={run.url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!run ? (
          <p className="text-sm text-[var(--color-text-muted)]">No cascade run found.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" data-testid="sit-run-jobs">
            {run.jobs.map((job) => (
              <Chip key={job.name} tone={sitJobTone(job)}>
                {job.name}
              </Chip>
            ))}
            {run.jobs.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No jobs reported.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StuckPanel({ stuckPrs, stuckInSit }: { stuckPrs: RepoCiPr[]; stuckInSit: string[] }) {
  const empty = stuckPrs.length === 0 && stuckInSit.length === 0;
  return (
    <Card data-testid="stuck-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          Stuck — triage queue
          <Chip tone={empty ? "green" : "red"}>{stuckPrs.length + stuckInSit.length}</Chip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {empty && (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="stuck-panel-empty">
            Nothing stuck — promotion contract flowing.
          </p>
        )}
        {stuckPrs.map((pr) => (
          <div
            key={`${pr.repo}#${pr.number}`}
            className="flex items-center gap-2 text-sm"
            data-testid={`stuck-pr-${pr.repo}-${pr.number}`}
          >
            {pr.stuck_class && (
              <Chip tone={stuckClassTone(pr.stuck_class)} testId={`stuck-class-${pr.stuck_class}`}>
                {STUCK_CLASS_LABELS[pr.stuck_class]}
              </Chip>
            )}
            <span className="font-mono text-[var(--color-text-primary)]">
              {pr.repo}#{pr.number}
            </span>
            <span className="text-[var(--color-text-muted)]">→ {pr.base}</span>
            <span className="text-[var(--color-text-muted)]">{formatAge(pr.age_min)}</span>
            {pr.url && (
              <a href={pr.url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
        {stuckInSit.map((repo) => (
          <div key={repo} className="flex items-center gap-2 text-sm" data-testid={`stuck-in-sit-${repo}`}>
            <Chip tone="red" testId="stuck-class-stuck_in_sit">
              Stuck in SIT
            </Chip>
            <span className="font-mono text-[var(--color-text-primary)]">{repo}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OverviewTable({
  rows,
  selected,
  onSelect,
}: {
  rows: RepoCiOverviewRow[];
  selected: string | null;
  onSelect: (repo: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => rowSeverity(b) - rowSeverity(a) || a.repo.localeCompare(b.repo));
  return (
    <table className="w-full text-sm" aria-label="Repo CI overview" data-testid="repo-ci-table">
      <thead>
        <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)]">
          <th className="text-left py-1.5 font-medium">Repo</th>
          <th className="text-left py-1.5 font-medium">CI status</th>
          <th className="text-left py-1.5 font-medium">LDR</th>
          <th className="text-left py-1.5 font-medium">staging</th>
          <th className="text-left py-1.5 font-medium">main</th>
          <th className="text-left py-1.5 font-medium">LDR→main delta</th>
          <th className="text-left py-1.5 font-medium">SIT</th>
          <th className="text-left py-1.5 font-medium">PRs</th>
          <th className="text-left py-1.5 font-medium">Image</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const bySha = new Map(row.branches.map((b) => [b.branch, b.sha]));
          const ldrMain = row.deltas.find((d) => d.base === "main" && d.head === "live-defi-rollout");
          const stuckCount = row.open_prs.filter((pr) => pr.stuck_class).length;
          return (
            <tr
              key={row.repo}
              data-testid={`repo-row-${row.repo}`}
              onClick={() => onSelect(row.repo)}
              className={`border-b border-[var(--color-border-default)]/40 cursor-pointer hover:bg-[var(--color-bg-secondary)] ${
                selected === row.repo ? "bg-[var(--color-bg-secondary)]" : ""
              }`}
            >
              <td className="py-1.5 font-mono text-[var(--color-text-primary)]">{row.repo}</td>
              <td className="py-1.5">
                {/* CI "feature green" chip click-throughs to the GitHub checks of the LDR head. */}
                <a
                  href={githubChecksUrl(row.repo, bySha.get("live-defi-rollout") ?? null)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Chip tone={ciStatusTone(row.ci_status)}>{row.ci_status}</Chip>
                </a>
              </td>
              <td className="py-1.5 font-mono">
                <ShaLink repo={row.repo} sha={bySha.get("live-defi-rollout") ?? null} />
              </td>
              <td className="py-1.5 font-mono">
                <ShaLink repo={row.repo} sha={bySha.get("staging") ?? null} />
              </td>
              <td className="py-1.5 font-mono">
                <ShaLink repo={row.repo} sha={bySha.get("main") ?? null} />
              </td>
              <td className="py-1.5 text-[var(--color-text-secondary)]">
                {ldrMain ? deltaLabel(ldrMain.files_changed, ldrMain.ahead_by) : "—"}
              </td>
              <td className="py-1.5">
                {row.sit.stuck_in_sit ? (
                  <Chip tone="red">stuck</Chip>
                ) : row.sit.in_breaking_pending ? (
                  <Chip tone="yellow">pending</Chip>
                ) : (
                  <Chip tone="gray">—</Chip>
                )}
              </td>
              <td className="py-1.5">
                {stuckCount > 0 ? (
                  <Chip tone="red">{`${row.open_prs.length} (${stuckCount} stuck)`}</Chip>
                ) : row.open_prs.length > 0 ? (
                  <Chip tone="yellow">{row.open_prs.length}</Chip>
                ) : (
                  <Chip tone="gray">0</Chip>
                )}
              </td>
              <td className="py-1.5">
                {row.image.image_stale === true ? (
                  <Chip tone="yellow">stale</Chip>
                ) : row.image.last_build_status ? (
                  <Chip tone={row.image.last_build_status === "SUCCESS" ? "green" : "red"}>
                    {row.image.last_build_status}
                  </Chip>
                ) : (
                  <Chip tone="gray">{row.image.deployed_version ?? "unknown"}</Chip>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Exported for the per-service "CI" tab on the home view (operator add 2026-06-10) —
 * one drill-down component serves both the fleet page and the single-service context. */
export function RepoDetailPanel({ repo }: { repo: string }) {
  const [detail, setDetail] = useState<RepoCiDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    getRepoCiDetail(repo)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  if (error)
    return (
      <p className="text-sm text-red-400" data-testid="repo-detail-error">
        {error}
      </p>
    );
  if (!detail) return <p className="text-sm text-[var(--color-text-muted)]">Loading {repo}…</p>;

  return (
    <div className="space-y-4" data-testid="repo-detail">
      <div className="flex items-center gap-2 flex-wrap">
        <GitBranch className="h-4 w-4 text-[var(--color-text-muted)]" />
        <span className="font-mono text-sm text-[var(--color-text-primary)]">{detail.repo}</span>
        <Chip tone={ciStatusTone(detail.ci_status)}>{detail.ci_status}</Chip>
        {detail.sit.stuck_in_sit && <Chip tone="red">stuck in SIT</Chip>}
        {detail.image.deployed_version && <Chip tone="gray">deployed {detail.image.deployed_version}</Chip>}
      </div>
      {/* Cross-links to the EXISTING surfaces for this repo — don't redo those tabs
          (operator add 2026-06-10: repo drill-down deep-links data-status / monitor /
          fleet git-health / GitHub). */}
      <div className="flex items-center gap-3 text-xs" data-testid="repo-detail-crosslinks">
        <span className="text-[var(--color-text-muted)]">Open:</span>
        <a
          href={`https://github.com/IggyIkenna/${detail.repo}`}
          target="_blank"
          rel="noreferrer"
          className="text-cyan-400 hover:underline inline-flex items-center gap-1"
        >
          GitHub <ExternalLink className="h-3 w-3" />
        </a>
        <Link to={`/service/${detail.repo}/data-status`} className="text-cyan-400 hover:underline">
          Data status
        </Link>
        <Link to={`/service/${detail.repo}/monitor`} className="text-cyan-400 hover:underline">
          Deployments
        </Link>
        <Link to="/fleet" className="text-cyan-400 hover:underline" data-testid="repo-detail-fleet-link">
          Fleet Git
        </Link>
      </div>
      {detail.open_prs.length > 0 && (
        <div className="space-y-1" data-testid="repo-detail-prs">
          {detail.open_prs.map((pr) => (
            <div key={pr.number} className="flex items-center gap-2 text-sm">
              {pr.stuck_class && (
                <Chip tone={stuckClassTone(pr.stuck_class)}>{STUCK_CLASS_LABELS[pr.stuck_class]}</Chip>
              )}
              <span className="font-mono">#{pr.number}</span>
              <span className="text-[var(--color-text-secondary)] truncate max-w-[28rem]">{pr.title}</span>
              <span className="text-[var(--color-text-muted)]">→ {pr.base}</span>
              {pr.url && (
                <a href={pr.url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {detail.history.map((branchHistory) => (
          <Card key={branchHistory.branch}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-mono">{branchHistory.branch}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {branchHistory.commits.map((commit) => (
                <div key={commit.sha} className="flex items-center gap-2 text-xs">
                  {/* v2 chip click-throughs to the commit's GitHub checks page. */}
                  <a href={githubChecksUrl(detail.repo, commit.sha)} target="_blank" rel="noreferrer">
                    <Chip
                      tone={
                        commit.v2_conclusion === "success"
                          ? "green"
                          : commit.v2_conclusion === "failure"
                            ? "red"
                            : "gray"
                      }
                    >
                      v2
                    </Chip>
                  </a>
                  <span className="font-mono">
                    <ShaLink repo={detail.repo} sha={commit.sha} />
                  </span>
                  <span className="text-[var(--color-text-muted)] truncate">{commit.message}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * RepoCiContent — the Repos-CI dashboard body, rendered as a tab inside the
 * deployment-ui home shell (LandingTabs) AND as the /repos deep-link. It owns no
 * page chrome (no `<main>`); the host shell supplies layout + padding so this is a
 * first-class dashboard tab, not a separate full-page app (operator add 2026-06-10).
 */
export function RepoCiContent() {
  const [overview, setOverview] = useState<RepoCiOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRepoCiOverview()
      .then(setOverview)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-4" data-testid="repo-ci-page">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          Repos CI
          {overview && (
            <span
              data-testid="repo-ci-source-badge"
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                overview.source === "live"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/40"
              }`}
              title={`generated_at: ${overview.generated_at}`}
            >
              {overview.source.toUpperCase()} · as of {overview.generated_at.slice(11, 19)}Z
            </span>
          )}
        </h1>
        <div className="flex items-center gap-3">
          <GhRateBudget />
          <select
            data-testid="repo-dropdown"
            className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] rounded-lg px-2 py-1.5 text-sm text-[var(--color-text-primary)]"
            value={selectedRepo ?? ""}
            onChange={(e) => setSelectedRepo(e.target.value || null)}
          >
            <option value="">All repos…</option>
            {overview?.repos.map((row) => (
              <option key={row.repo} value={row.repo}>
                {row.repo}
              </option>
            ))}
          </select>
          <Button onClick={load} variant="ghost" size="sm" disabled={loading} data-testid="repo-ci-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {error && (
        <div className="p-3 rounded-lg status-error text-sm text-red-400" data-testid="repo-ci-error">
          {error}
        </div>
      )}
      {overview && (
        <>
          {overview.errors && overview.errors.length > 0 && (
            <div
              className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm"
              data-testid="repo-ci-degraded"
            >
              <div className="text-amber-400 font-medium mb-1">
                Degraded repos ({overview.errors.length}) — GitHub aggregation failed, row dropped (not silent)
              </div>
              <div className="space-y-0.5 text-xs text-[var(--color-text-muted)]">
                {overview.errors.map((e) => (
                  <div key={e.repo}>
                    <span className="font-mono text-[var(--color-text-secondary)]">{e.repo}</span>: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SitRunPanel run={overview.sit_last_run} />
            <StuckPanel stuckPrs={overview.stuck_prs} stuckInSit={overview.stuck_in_sit} />
          </div>
          {selectedRepo ? (
            <Card>
              <CardContent className="pt-4">
                <RepoDetailPanel repo={selectedRepo} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              <OverviewTable rows={overview.repos} selected={selectedRepo} onSelect={setSelectedRepo} />
            </CardContent>
          </Card>
        </>
      )}
      {!overview && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
