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
import { useCloudProvider } from "../contexts/CloudProviderContext";
import { AlertCircle, ExternalLink, GitBranch, HelpCircle, RefreshCw, ShieldAlert } from "lucide-react";
import {
  getRepoCiDetail,
  getRepoCiOverview,
  type RepoCiDetail,
  type RepoCiOverview,
  type RepoCiImageSignal,
  type RepoCiLastGreen,
  type RepoCiOverviewRow,
  type RepoCiPr,
  type RepoCiPromoteRun,
  type RepoCiPromotionBlocked,
  type RepoCiPromotionDrain,
  type RepoCiPromotionHeld,
  type RepoCiSemverHealth,
  type RepoCiSitLastRun,
  type RepoCiSitState,
} from "../api/client";
import {
  branchTone,
  buildSourceLabel,
  buildTimeLabel,
  ciStatusTone,
  classifyStall,
  deltaLabel,
  formatAge,
  githubChecksUrl,
  githubCommitUrl,
  promotionBlockedLabel,
  promotionBlockedTone,
  prV2State,
  rowSeverity,
  shortSha,
  sitJobTone,
  STUCK_CLASS_LABELS,
  stuckClassTone,
  type ChipTone,
  type StallReason,
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

// Solid status-dot + tinted text for the per-branch SHA cells (operator review 2026-06-19 —
// the per-branch colour replaces the standalone CI-status column).
const TONE_DOT: Record<ChipTone, string> = {
  green: "bg-emerald-400",
  yellow: "bg-amber-400",
  red: "bg-red-400",
  gray: "bg-zinc-500",
  blue: "bg-cyan-400",
};
const TONE_TEXT: Record<ChipTone, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
  gray: "text-zinc-400",
  blue: "text-cyan-400",
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

/** Per-hop file deltas for a lagging row — WHICH promotion hop holds the content: LDR→staging then
 * staging→main, each green ✓ when drained (0 files) or red "Nf" when content is stuck on it. The
 * row-level mirror of the detail panel's pipeline; renders only when the row has real lag, so the
 * eye is drawn to the stuck leg (e.g. AO: LDR→stg ✓, stg→main 144f). */
function HopPills({ row }: { row: RepoCiOverviewRow }) {
  const hop = (base: string, head: string): number =>
    row.deltas.find((d) => d.base === base && d.head === head)?.files_changed ?? 0;
  const pill = (label: string, files: number, testId: string) => (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-0.5 ${files > 0 ? TONE_TEXT.red : TONE_TEXT.green}`}
    >
      {label} {files > 0 ? `${files}f` : "✓"}
    </span>
  );
  return (
    <span className="inline-flex flex-col items-start gap-0.5 text-[11px]" data-testid={`stall-hops-${row.repo}`}>
      {pill("LDR→stg", hop("staging", "live-defi-rollout"), `hop-ldr-staging-${row.repo}`)}
      {pill("stg→main", hop("main", "staging"), `hop-staging-main-${row.repo}`)}
    </span>
  );
}

/** The one-glance WHY for a lagging row — the classified promotion stall. Renders only for the
 * not-otherwise-surfaced classes (staging→main promoter not firing / LDR→staging drain behind /
 * a jammed PR); dep-order is carried by the existing blocked-by chip and drain-stalled by its own.
 * Severity tracks the lag age (red past the 60-min monitor threshold, else yellow) so a fresh
 * staging→main gap reads as "promoting" while AO's 8-day stall reads red. */
function StallReasonChip({ row, reason }: { row: RepoCiOverviewRow; reason: StallReason }) {
  const lagTone: ChipTone = (row.main_lag_age_min ?? 0) > 60 ? "red" : "yellow";
  if (reason.kind === "staging-to-main") {
    const detail = reason.ciStatusStale ? `status stale (${row.ci_status})` : "no promotion PR";
    return (
      <Chip tone={lagTone} testId={`stall-reason-${row.repo}`}>
        staging→main not promoting · {detail}
      </Chip>
    );
  }
  if (reason.kind === "ldr-to-staging") {
    return (
      <Chip tone={lagTone} testId={`stall-reason-${row.repo}`}>
        LDR→staging drain behind
      </Chip>
    );
  }
  if (reason.kind === "pr-stuck" && reason.stuckClass) {
    return (
      <Chip tone={stuckClassTone(reason.stuckClass)} testId={`stall-reason-${row.repo}`}>
        PR #{reason.pr}: {STUCK_CLASS_LABELS[reason.stuckClass]}
      </Chip>
    );
  }
  return null;
}

/** The "Stall reason" column cell — the single home for every promotion WHY: this repo is a root
 * blocker (holds others) / is itself held by a dep (dep-order) / its drain leg is broken / the
 * classified hop stall (staging→main not promoting · LDR→staging drain behind · a jammed PR).
 * "—" when the row is clean. */
function StallReasonCell({ row, stall }: { row: RepoCiOverviewRow; stall: StallReason }) {
  const blocking = row.blocking ?? [];
  const blockedBy = row.blocked_by ?? [];
  const hasHopReason =
    !row.drain_stalled &&
    (stall.kind === "staging-to-main" || stall.kind === "ldr-to-staging" || stall.kind === "pr-stuck");
  if (blocking.length === 0 && blockedBy.length === 0 && !row.drain_stalled && !hasHopReason) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {blocking.length > 0 && (
        <Chip tone="red" testId={`root-blocker-${row.repo}`}>
          root blocker · {blocking.length} waiting
        </Chip>
      )}
      {blockedBy.length > 0 && (
        <Chip tone="yellow" testId={`blocked-by-${row.repo}`}>
          blocked-by: {blockedBy.map((dep) => `${dep.name} (tier ${dep.tier})`).join(", ")}
        </Chip>
      )}
      {row.drain_stalled && (
        <Chip tone="red" testId={`drain-stalled-${row.repo}`}>
          drain stalled
        </Chip>
      )}
      {hasHopReason && <StallReasonChip row={row} reason={stall} />}
    </span>
  );
}

/** Click-to-open `?` help popover — a small info button that reveals explanatory text, closing on
 * an outside click (transparent overlay; no ref/effect). Reused by every top card so any element
 * can carry a "what is this?" (operator request 2026-06-19). `align` flips the drop side so a
 * right-edge card's popover doesn't run off-screen. */
function HelpPopover({
  label,
  testId,
  align = "left",
  children,
}: {
  label: string;
  testId?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex font-normal">
      <button
        type="button"
        data-testid={testId ? `${testId}-toggle` : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={label}
        aria-expanded={open}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            data-testid={testId}
            className={`absolute ${align === "right" ? "right-0" : "left-0"} top-6 z-20 w-72 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 text-left text-[11px] leading-relaxed text-[var(--color-text-secondary)] shadow-lg`}
          >
            {children}
          </div>
        </>
      )}
    </span>
  );
}

/** The `?` help shown inside a card title — a one-glance "what is this card + what does it say". */
function CardHelp({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <HelpPopover label={`What is ${title}?`} testId={`card-help-${id}`}>
      <p className="mb-1 font-medium text-[var(--color-text-primary)]">{title}</p>
      {children}
    </HelpPopover>
  );
}

/** A table column header carrying a click-to-open `?` help (operator request 2026-06-19 — every
 * column explains what it represents). `align="right"` for right-edge columns so the popover drops
 * inward, not off the table. */
function Th({
  id,
  label,
  align,
  help,
}: {
  id: string;
  label: string;
  align?: "left" | "right";
  help: React.ReactNode;
}) {
  return (
    <th className="text-left py-1.5 font-medium">
      <span className="inline-flex items-center gap-1">
        {label}
        <HelpPopover label={`What is the ${label} column?`} testId={`col-help-${id}`} align={align}>
          <p className="mb-1 font-medium text-[var(--color-text-primary)]">{label}</p>
          {help}
        </HelpPopover>
      </span>
    </th>
  );
}

/** A short-SHA that deep-links to its GitHub commit page (operator click-through rule:
 * GitHub-authoritative atoms link to GitHub). Renders a plain dash when no SHA. When `tone`
 * is supplied (the LDR/staging/main overview cells) the SHA carries a per-branch CI colour —
 * a solid status dot + tinted text — so branch pass/fail reads at a glance, replacing the
 * standalone CI-status column. `data-tone` exposes the colour for tests. */
function ShaLink({ repo, sha, tone, testId }: { repo: string; sha: string | null; tone?: ChipTone; testId?: string }) {
  const url = githubCommitUrl(repo, sha);
  if (!url)
    return (
      <span data-testid={testId} data-tone={tone ?? "gray"} className="text-[var(--color-text-muted)]">
        —
      </span>
    );
  const textClass = tone ? TONE_TEXT[tone] : "text-[var(--color-text-secondary)]";
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid={testId}
      data-tone={tone ?? ""}
      className={`inline-flex items-center gap-1 hover:underline ${textClass}`}
    >
      {tone && <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />}
      {shortSha(sha)}
    </a>
  );
}

function SitRunPanel({ run }: { run: RepoCiSitLastRun | null }) {
  return (
    <Card data-testid="sit-run-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Breaking cascade / SIT
          <CardHelp id="sit" title="Breaking cascade / SIT">
            The <span className="font-medium">breaking-change</span> promotion path — the counterpart to "Promotion
            drain". SIT fires only when a breaking public-surface change crosses into staging (most promotions are
            non-breaking, so it's usually idle). Shows the last cascade run's result + age and its per-job steps (QG,
            Slack-notify, escalate, persist-event).
          </CardHelp>
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

/** One leg of the routine promotion drain (LDR→staging or LDR→main). */
function PromoteDrainRow({ label, run, testId }: { label: string; run: RepoCiPromoteRun | null; testId?: string }) {
  const tone: ChipTone = !run ? "gray" : run.conclusion === "success" ? "green" : run.conclusion ? "red" : "blue";
  return (
    <div className="flex items-center justify-between gap-2 text-xs" data-testid={testId}>
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <Chip tone={tone}>{run ? (run.conclusion ?? run.status) : "—"}</Chip>
        {run && <span className="text-[var(--color-text-muted)]">{formatAge(run.age_min)} ago</span>}
        {run?.url && (
          <a href={run.url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

/** Semver-agent standing health (G2) — the bump-rate circuit-breaker + dispatch-failure are
 * CRITICAL pages with no UI element today. Shows the last bump run + pending-bump count +
 * breaker-armed state so the operator sees the breaker BEFORE it pages. */
function SemverHealthPanel({ health }: { health: RepoCiSemverHealth | null | undefined }) {
  const lastTone: ChipTone = !health
    ? "gray"
    : health.last_run_conclusion === "success"
      ? "green"
      : health.last_run_conclusion
        ? "red"
        : health.last_run_status
          ? "blue"
          : "gray";
  return (
    <Card data-testid="semver-health-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Semver-agent health
          <CardHelp id="semver" title="Semver-agent health">
            The version-stamper's <span className="font-medium">circuit breaker</span>. The semver-agent stamps a
            version on each staging promotion; if too many bumps stack up (≥3/hr or consecutive) the breaker ARMS and
            pages. Shows the last bump run, the pending-bump count, breaker state, and which repos are pending.
          </CardHelp>
        </CardTitle>
        <p className="text-xs text-[var(--color-text-muted)]">Last bump · pending bumps · circuit-breaker</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {health ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs" data-testid="semver-last-run">
              <span className="text-[var(--color-text-secondary)]">Last bump run</span>
              <div className="flex items-center gap-2">
                <Chip tone={lastTone}>{health.last_run_conclusion ?? health.last_run_status ?? "—"}</Chip>
                {health.last_run_age_min !== null && (
                  <span className="text-[var(--color-text-muted)]">{formatAge(health.last_run_age_min)} ago</span>
                )}
                {health.last_run_url && (
                  <a
                    href={health.last_run_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-text-muted)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs" data-testid="semver-breaker">
              <span className="text-[var(--color-text-secondary)]">
                Pending bumps ({health.pending_bump_count}/{health.breaker_threshold})
              </span>
              <Chip tone={health.breaker_armed ? "red" : "green"}>
                {health.breaker_armed ? "breaker ARMED" : "breaker clear"}
              </Chip>
            </div>
            {health.pending_bump_repos.length > 0 && (
              <div className="flex flex-wrap gap-1" data-testid="semver-pending-repos">
                {health.pending_bump_repos.map((r) => (
                  <span key={r} className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">No semver-agent data.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Routine LDR→staging / LDR→main auto-merge drain (PM-central, every 15 min) — DISTINCT from the
 * Breaking cascade/SIT panel (which only fires on a breaking change). Answers the operator gap
 * "when did we last promote LDR→staging via auto-merge + QG, and did it pass". */
function PromotionDrainPanel({
  drain,
  stalledRepos,
}: {
  drain: RepoCiPromotionDrain | null | undefined;
  stalledRepos: string[];
}) {
  return (
    <Card data-testid="promotion-drain-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Promotion drain
          <CardHelp id="drain" title="Promotion drain">
            The <span className="font-medium">routine, non-breaking</span> promotion path. PM-central bots auto-merge
            content up every 15 min — LDR→staging and LDR→main. Shows each leg's last result + age, plus any repo whose
            drain is <span className="font-medium">stalled</span> (real content ahead but a stale/failing leg).
          </CardHelp>
        </CardTitle>
        <p className="text-xs text-[var(--color-text-muted)]">Routine LDR→staging / →main auto-merge (every 15 min)</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {drain ? (
          <>
            <PromoteDrainRow label="LDR → staging" run={drain.ldr_to_staging} testId="drain-ldr-to-staging" />
            <PromoteDrainRow label="LDR → main" run={drain.ldr_to_main} testId="drain-ldr-to-main" />
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">No promote-drain data.</p>
        )}
        {/* promotion-drain follow-up: repos with content ahead + a stale/failing drain (bug-#11). */}
        {stalledRepos.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1" data-testid="drain-stalled-summary">
            <Chip tone="red">{stalledRepos.length} drain-stalled</Chip>
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{stalledRepos.join(", ")}</span>
          </div>
        ) : (
          <p className="pt-1 text-[10px] text-[var(--color-text-muted)]" data-testid="drain-stalled-summary">
            No drain-stalled repos.
          </p>
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
          <CardHelp id="stuck" title="Stuck — triage queue">
            PRs that need a <span className="font-medium">human/worker</span> — genuinely stuck on a merge conflict, a
            failing required check, or a <span className="font-mono">[skip ci]</span> jam — plus repos stuck mid-SIT.
            The count is how many need attention; each row shows the blocking check + GitHub's reason.
          </CardHelp>
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
            className="flex flex-col gap-0.5"
            data-testid={`stuck-pr-${pr.repo}-${pr.number}`}
          >
            <div className="flex items-center gap-2 text-sm">
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
            {/* The actual blocking required check(s) + reason — so the operator sees WHY a PR is
              stuck (e.g. "AWS CodeBuild ✗ — PR approval required") without leaving the dashboard. */}
            {pr.blocking_checks && pr.blocking_checks.length > 0 && (
              <div className="flex flex-col gap-0.5 pl-1" data-testid={`stuck-pr-blockers-${pr.repo}-${pr.number}`}>
                {pr.blocking_checks.map((c, i) => (
                  <span key={i} className="text-[11px]" data-testid={`stuck-pr-blocker-${pr.repo}-${pr.number}`}>
                    <span className={c.state === "pending" ? "text-amber-400" : "text-red-400"}>
                      {c.state === "pending" ? "⏳ " : "✗ "}
                      {c.name}
                    </span>
                    {c.description ? <span className="text-[var(--color-text-muted)]"> — {c.description}</span> : null}
                  </span>
                ))}
              </div>
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

/** Image-column deploy signal (B1 — operator add 2026-06-11): status chip (→ build log) +
 * the built COMMIT SHA (→ that commit on GitHub, "where this build came from") + build TIME.
 * Answers "why is the image this colour / what code built it / when / where's the log" — not a
 * bare status word. Honest-unknown stays "unknown" (no fabricated sha/time/link). */
/** SHA tone by build status (Option B — the colour carries the status, no status word): green =
 * success, red = failed, amber = building/other, gray = stale or no build. */
function buildShaTone(image: RepoCiImageSignal | null | undefined): string {
  if (!image?.last_build_status || image.image_stale === true) return "text-[var(--color-text-muted)]";
  if (image.last_build_status === "SUCCESS") return "text-emerald-400";
  if (image.last_build_status === "FAILURE" || image.last_build_status === "FAILED") return "text-red-400";
  return "text-amber-400";
}

/** One cloud's build line in the dual-cloud Image cell: cloud label + colour-coded build SHA (→ that
 * commit on GitHub; hover = status · sha · time) + build datetime + log link. Shows "—" when that
 * cloud has no build / isn't reachable (honest, never fabricated). */
function CloudBuildLine({ cloud, image, repo }: { cloud: string; image?: RepoCiImageSignal | null; repo: string }) {
  const sha = image?.last_build_sha ?? null;
  const status = image?.image_stale ? "stale" : (image?.last_build_status ?? (image ? "no build" : "no access"));
  const commitUrl = sha ? githubCommitUrl(repo, sha) : null;
  const title = [`${cloud}: ${status}`, sha ?? "", image?.last_build_time ? `at ${image.last_build_time}` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-1.5" data-testid={`image-${cloud.toLowerCase()}`} title={title}>
      <span className="w-7 shrink-0 text-[10px] font-semibold text-[var(--color-text-muted)]">{cloud}</span>
      {sha ? (
        <a
          href={commitUrl ?? "#"}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`font-mono text-[11px] hover:underline ${buildShaTone(image)}`}
          data-testid={`image-sha-${cloud.toLowerCase()}`}
        >
          {shortSha(sha)}
        </a>
      ) : (
        <span
          className="font-mono text-[11px] text-[var(--color-text-muted)]"
          data-testid={`image-sha-${cloud.toLowerCase()}`}
        >
          —
        </span>
      )}
      {image?.last_build_time && (
        <span className="text-[10px] text-[var(--color-text-muted)]">· {buildTimeLabel(image.last_build_time)}</span>
      )}
      {image?.last_build_log_url && (
        <a
          href={image.last_build_log_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex"
          title={`${cloud} build log`}
        >
          <ExternalLink className="h-3 w-3 text-[var(--color-text-muted)]" />
        </a>
      )}
    </div>
  );
}

/** Image column — GCP + AWS side-by-side (no provider toggle). deployed_version (shared) on top,
 * then each cloud's build: SHA colour-coded by status + datetime + log link. SSOT: dual-cloud image
 * status (operator 2026-06-22 — see both clouds at once instead of switching provider). */
function ImageCell({
  gcp,
  aws,
  deployedVersion,
  repo,
}: {
  gcp?: RepoCiImageSignal | null;
  aws?: RepoCiImageSignal | null;
  deployedVersion?: string | null;
  repo: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid="image-cell">
      {deployedVersion && (
        <span className="text-[10px] text-[var(--color-text-muted)]" data-testid="image-deployed">
          {deployedVersion}
        </span>
      )}
      <CloudBuildLine cloud="GCP" image={gcp} repo={repo} />
      <CloudBuildLine cloud="AWS" image={aws} repo={repo} />
    </div>
  );
}

function PromotionBlockedPanel({ blocked }: { blocked: RepoCiPromotionBlocked[] }) {
  const empty = blocked.length === 0;
  return (
    <Card data-testid="promotion-blocked-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          Promotion blocked — staging→main
          <Chip tone={empty ? "green" : "red"}>{blocked.length}</Chip>
          <CardHelp id="blocked" title="Promotion blocked — staging→main">
            Repos <span className="font-medium">parked by repeated FAILURE</span> — quarantined after consecutive
            staging→main failures. A failure-park signal. This is <span className="font-medium">not</span> a clean
            dependency-order wait — for that, see the "Promotion held — dependency order" card.
          </CardHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {empty && (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="promotion-blocked-empty">
            Nothing parked — staging→main draining cleanly.
          </p>
        )}
        {blocked.map((b) => (
          <div key={b.repo} className="flex items-center gap-2 text-sm" data-testid={`promotion-blocked-${b.repo}`}>
            <Chip tone={promotionBlockedTone(b)}>{promotionBlockedLabel(b)}</Chip>
            <span className="font-mono text-[var(--color-text-primary)]">{b.repo}</span>
            {b.escalated && <span className="text-[var(--color-text-muted)] text-xs">escalated</span>}
            {b.since != null && (
              <span className="text-[var(--color-text-muted)] text-xs">since {b.since.slice(0, 10)}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Promotion held — dependency order (operator 2026-06-19): repos WAITING (not failing) for a
 * dependency to reach main. The staging→main gate promotes a repo only once all its deps are on
 * main, so a low-tier dep lagging (e.g. unified-api-contracts at STAGING_GREEN) holds everything
 * above it. The clean-HOLD counterpart to the failure-park "Promotion blocked" panel. */
function PromotionHeldPanel({ held }: { held: RepoCiPromotionHeld | null | undefined }) {
  const rootBlockers = held?.root_blockers ?? [];
  const heldRepos = held?.held_repos ?? [];
  const empty = heldRepos.length === 0;
  return (
    <Card data-testid="promotion-held-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-amber-400" />
          Promotion held — dependency order
          <Chip tone={empty ? "green" : "yellow"}>{heldRepos.length}</Chip>
          <CardHelp id="held" title="Promotion held — dependency order">
            Repos <span className="font-medium">WAITING</span> (not failing) for a dependency to reach main. The
            staging→main gate promotes a repo only once all its deps are on main, so a low-tier dep lagging holds
            everything above it. Shows the root dep blocking the fleet + who's held — the clean-wait counterpart to
            "Promotion blocked" (failure-park).
          </CardHelp>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {empty && (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="promotion-held-empty">
            Nothing held — every repo's deps are on main.
          </p>
        )}
        {rootBlockers.map((b) => (
          <div key={b.repo} className="flex items-center gap-2 text-sm" data-testid={`promotion-held-root-${b.repo}`}>
            <Chip tone="red">blocking {b.blocking_count}</Chip>
            <span className="font-mono text-[var(--color-text-primary)]">{b.repo}</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              tier {b.tier} · {b.ci_status} · main {b.main_files_behind} behind
            </span>
          </div>
        ))}
        {!empty && (
          <p className="pt-0.5 text-[11px] text-[var(--color-text-muted)]" data-testid="promotion-held-repos">
            Held: <span className="font-mono">{heldRepos.join(", ")}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Click-to-open legend for the per-branch SHA-cell colours (operator request 2026-06-19).
 * A `?`/HelpCircle toggle that explains what green/red/gray mean on the LDR/staging/main cells.
 * The full-screen transparent overlay closes it on an outside click (no ref/effect needed). */
function BranchLegend() {
  const [open, setOpen] = useState(false);
  const dotRow = (tone: ChipTone, label: string, body: string) => (
    <li className="flex items-start gap-2">
      <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      <span>
        <span className={TONE_TEXT[tone]}>{label}</span> — {body}
      </span>
    </li>
  );
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="branch-legend-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label="Branch colour legend"
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Legend
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            data-testid="branch-legend"
            className="absolute right-0 top-6 z-20 w-72 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 text-[11px] shadow-lg"
          >
            <p className="mb-2 font-medium text-[var(--color-text-primary)]">
              LDR / staging / main SHA colour = that branch's last <span className="font-mono">quality-gates-v2</span>
            </p>
            <ul className="space-y-1.5">
              {dotRow("green", "green", "last v2 run passed")}
              {dotRow("red", "red", "last v2 run failed")}
              {dotRow("gray", "gray", "branch absent or status unknown")}
            </ul>
            <p className="mt-2 text-[var(--color-text-muted)]">
              A branch that is merely behind (stale) is still green — staleness shows in "last green (main)" + the
              "LDR→main delta" lag chip, not in this pass/fail colour.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

type SortMode = "severity" | "alpha" | "tier";

/** Tier rank for the "tier" sort — numeric manifest tiers (0,1,3 …) sort by value (most
 * foundational dependency first); unknown/categorical tiers sort last. */
function tierRank(tier: string | undefined): number {
  if (tier == null || tier === "") return 999;
  const n = Number(tier);
  return Number.isNaN(n) ? 500 : n;
}

/** Segmented sort control for the overview table (operator 2026-06-19): severity (default,
 * worst-first) / alphabetical / dependency-tier (shows the layer stack, root at top). */
function SortControl({ mode, onChange }: { mode: SortMode; onChange: (m: SortMode) => void }) {
  const opts: { id: SortMode; label: string }[] = [
    { id: "severity", label: "severity" },
    { id: "alpha", label: "A–Z" },
    { id: "tier", label: "tier" },
  ];
  return (
    <div className="inline-flex items-center gap-1 text-[11px]" data-testid="repo-sort-control">
      <span className="text-[var(--color-text-muted)]">sort:</span>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          data-testid={`repo-sort-${o.id}`}
          aria-pressed={mode === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded border px-1.5 py-0.5 ${
            mode === o.id
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-400"
              : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OverviewTable({
  rows,
  selected,
  onSelect,
  sortMode,
}: {
  rows: RepoCiOverviewRow[];
  selected: string | null;
  onSelect: (repo: string) => void;
  sortMode: SortMode;
}) {
  const sorted = [...rows].sort((a, b) => {
    if (sortMode === "alpha") return a.repo.localeCompare(b.repo);
    if (sortMode === "tier") return tierRank(a.tier) - tierRank(b.tier) || a.repo.localeCompare(b.repo);
    return rowSeverity(b) - rowSeverity(a) || a.repo.localeCompare(b.repo);
  });
  return (
    <table
      // Per-column vertical dividers + horizontal padding so the 14 columns read apart
      // (operator 2026-06-22 — "very little distinction between columns"). border-r on every
      // cell except the last draws the divider; px-3 gives breathing room (first/last cells
      // stay flush to the card edge). Colour reuses the existing /40·/15 border tokens.
      className="w-full text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-1 [&_td:first-child]:pl-1 [&_th:last-child]:pr-1 [&_td:last-child]:pr-1 [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--color-border-default)]/40 [&_td]:border-[var(--color-border-default)]/15"
      aria-label="Repo CI overview"
      data-testid="repo-ci-table"
    >
      <thead>
        <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)]">
          <Th
            id="repo"
            label="Repo"
            help={<>The repository. Click a row to drill into its branch SHA history, open PRs, SIT state and image.</>}
          />
          <Th
            id="ldr"
            label="LDR"
            help={
              <>
                <span className="font-mono">live-defi-rollout</span> HEAD — the integration trunk where finished work
                lands first. The dot/colour is that branch's last <span className="font-mono">quality-gates-v2</span>{" "}
                (green = passed · red = failed). Click the SHA → its GitHub commit.
              </>
            }
          />
          <Th
            id="staging"
            label="staging"
            help={
              <>
                <span className="font-mono">staging</span> HEAD — the promotion gate between LDR and main (the checks
                run here; nothing builds or deploys). Colour = last v2. SHA → commit.
              </>
            }
          />
          <Th
            id="main"
            label="main"
            help={
              <>
                <span className="font-mono">main</span> HEAD — the deployed projection; container images build on push
                here. Colour = last v2. A green-but-behind main reads green here plus a lag chip in "LDR→main delta".
              </>
            }
          />
          <Th
            id="last-green"
            label="last green (main)"
            help={
              <>
                The most-recent <span className="font-mono">main</span> SHA whose <span className="font-mono">v2</span>{" "}
                passed, and when — distinct from the main HEAD (which may be red/pending). Answers "what's the last good
                main".
              </>
            }
          />
          <Th
            id="delta"
            label="LDR→main delta"
            align="right"
            help={
              <>
                How far LDR leads main overall: files-ahead (the honest signal — "in sync" when it's only squash-skew) +
                commits, plus the promotion-lag chip (red &gt;60min — the age of the oldest LDR commit not yet on main).
                WHERE and WHY that lag sits are split into the next two columns.
              </>
            }
          />
          <Th
            id="hops"
            label="Promotion hops"
            help={
              <>
                WHICH promotion hop holds the content: LDR→staging then staging→main. <b>✓</b> = that hop is drained (0
                files); <b>Nf</b> (red) = N files stuck on it. The drained-then-stuck pattern (LDR→stg ✓ · stg→main
                144f) localizes an 8-day lag to the staging→main hop instead of one opaque number.
              </>
            }
          />
          <Th
            id="reason"
            label="Stall reason"
            help={
              <>
                WHY the promotion is stuck — one of: <b>dep-order</b> (held behind a dependency not yet on main — the
                blocked-by chip); <b>staging→main not promoting</b> (staging is ahead of main with no PR — the promoter
                isn't firing; <b>status stale</b> means ci_status reads on-main, e.g. MAIN_GREEN, while git says it
                isn't — the agent-orchestrator class, invisible to every status-based view);{" "}
                <b>LDR→staging drain behind</b> (the Tier-C drain hasn't carried LDR to staging); <b>PR #N</b> (a
                promotion PR exists but is jammed — conflict / failing / [skip ci]); <b>root blocker</b> (this repo
                isn't on main and is holding others); <b>drain stalled</b> (content ahead + a dead drain leg).
              </>
            }
          />
          <Th
            id="sit"
            label="SIT"
            align="right"
            help={
              <>
                System-integration-test state for the breaking-change cascade (fires only on a breaking public-surface
                change): <span className="font-medium">stuck</span> · <span className="font-medium">pending</span> · —
                (idle — the common case).
              </>
            }
          />
          <Th
            id="prs"
            label="PRs"
            align="right"
            help={
              <>
                Open PRs into a promotion base + how many are stuck. Red = ≥1 stuck; the "Stuck — triage queue" card
                lists them with the blocking check.
              </>
            }
          />
          <Th
            id="image"
            label="Image"
            align="right"
            help={
              <>
                Latest container-image deploy signal: build status (→ log) + the built commit SHA (→ GitHub) + time.
                "stale" = main HEAD ≠ last successful build sha; "unknown" = honest-absent.
              </>
            }
          />
          <Th
            id="coverage"
            label="Cov%"
            align="right"
            help={
              <>
                Test-coverage % from the most-recent <span className="font-mono">quality-gates.sh</span> run on{" "}
                <span className="font-mono">main</span>. Red &lt;70 (below the workspace floor); yellow 70–79; green
                ≥80. Absent for tool repos or when CI hasn't emitted the metric yet.
              </>
            }
          />
          <Th
            id="qg-reason"
            label="QG reason"
            align="right"
            help={
              <>
                The first <span className="font-mono">quality-gates.sh</span> step that failed on the last run — e.g.{" "}
                <span className="font-mono">pytest</span> / <span className="font-mono">basedpyright</span> /{" "}
                <span className="font-mono">ruff</span> / <span className="font-mono">bandit</span>. Blank when QG
                passed.
              </>
            }
          />
          <Th
            id="file-debt"
            label="File debt"
            align="right"
            help={
              <>
                Files exceeding the 900-line hard limit (red) or in the 700–899 warn zone (yellow). Zero is normal;
                non-zero signals tech-debt that blocks future refactors.
              </>
            }
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, rowIndex) => {
          const bySha = new Map(row.branches.map((b) => [b.branch, b.sha]));
          const ldrMain = row.deltas.find((d) => d.base === "main" && d.head === "live-defi-rollout");
          const stuckCount = row.open_prs.filter((pr) => pr.stuck_class).length;
          const stall = classifyStall(row);
          return (
            <tr
              key={row.repo}
              data-testid={`repo-row-${row.repo}`}
              onClick={() => onSelect(row.repo)}
              className={`border-b border-[var(--color-border-default)]/40 cursor-pointer hover:bg-[var(--color-bg-secondary)] ${
                selected === row.repo ? "bg-[var(--color-bg-secondary)]" : rowIndex % 2 === 1 ? "bg-white/[0.04]" : ""
              }`}
            >
              <td className="py-1.5 font-mono text-[var(--color-text-primary)]">{row.repo}</td>
              {/* Per-branch CI colour on each SHA cell (operator review 2026-06-19) — replaces the
                  standalone CI-status column: green = that branch's last v2 passed, red = failed. */}
              <td className="py-1.5 font-mono">
                <ShaLink
                  repo={row.repo}
                  sha={bySha.get("live-defi-rollout") ?? null}
                  tone={branchTone(row, "live-defi-rollout", bySha.get("live-defi-rollout") ?? null)}
                  testId={`branch-ldr-${row.repo}`}
                />
              </td>
              <td className="py-1.5 font-mono">
                <ShaLink
                  repo={row.repo}
                  sha={bySha.get("staging") ?? null}
                  tone={branchTone(row, "staging", bySha.get("staging") ?? null)}
                  testId={`branch-staging-${row.repo}`}
                />
              </td>
              <td className="py-1.5 font-mono">
                <ShaLink
                  repo={row.repo}
                  sha={bySha.get("main") ?? null}
                  tone={branchTone(row, "main", bySha.get("main") ?? null)}
                  testId={`branch-main-${row.repo}`}
                />
              </td>
              {/* N2: the last GREEN main sha + age ("green as of <sha> · <age>") — distinct from the
                  main head above, which may be red/pending. */}
              <td className="py-1.5 font-mono text-xs" data-testid={`last-green-${row.repo}`}>
                {row.last_green_main ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <ShaLink repo={row.repo} sha={row.last_green_main.sha} />
                    <span className="text-[var(--color-text-muted)]">· {buildTimeLabel(row.last_green_main.at)}</span>
                  </span>
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
                )}
              </td>
              <td className="py-1.5 text-[var(--color-text-secondary)] align-top">
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  {/* LDR→main commit count = the real squash-free count (main_unpromoted_commits)
                      when there's content drift; ahead_by only for the in-sync squash-skew case. */}
                  <span>
                    {ldrMain ? deltaLabel(ldrMain.files_changed, row.main_unpromoted_commits ?? ldrMain.ahead_by) : "—"}
                  </span>
                  {/* G6: promotion-lag age — red past the 60-min monitor threshold. */}
                  {typeof row.main_lag_age_min === "number" && (
                    <Chip tone={row.main_lag_age_min > 60 ? "red" : "yellow"} testId={`lag-${row.repo}`}>
                      {formatAge(row.main_lag_age_min)} lag
                    </Chip>
                  )}
                </span>
              </td>
              {/* Promotion hops (operator 2026-06-19) — WHICH hop holds the content, so an 8d lag is
                  localizable at a glance: LDR→staging drained (✓) vs staging→main stuck (Nf). */}
              <td className="py-1.5 align-top" data-testid={`hops-cell-${row.repo}`}>
                {stall.kind === "none" ? (
                  <span className="text-[var(--color-text-muted)]">—</span>
                ) : (
                  <HopPills row={row} />
                )}
              </td>
              {/* Stall reason — the single WHY: dep-order / staging→main promoter not firing /
                  LDR→staging drain behind / a jammed PR / this repo itself a root blocker. */}
              <td className="py-1.5 align-top" data-testid={`reason-cell-${row.repo}`}>
                <StallReasonCell row={row} stall={stall} />
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
                <ImageCell
                  gcp={row.image_gcp}
                  aws={row.image_aws}
                  deployedVersion={row.image.deployed_version}
                  repo={row.repo}
                />
              </td>
              {/* Codebase-health columns (2026-06-19): coverage%, QG fail reason, file-size debt. */}
              <td className="py-1.5 text-right" data-testid={`cov-${row.repo}`}>
                {row.codebase_health?.coverage_pct != null ? (
                  <Chip
                    tone={
                      row.codebase_health.coverage_pct < 70
                        ? "red"
                        : row.codebase_health.coverage_pct < 80
                          ? "yellow"
                          : "green"
                    }
                  >
                    {row.codebase_health.coverage_pct}%
                  </Chip>
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
                )}
              </td>
              <td className="py-1.5 text-right" data-testid={`qg-reason-${row.repo}`}>
                {row.codebase_health?.qg_red_reason ? (
                  <Chip tone="red">
                    <span className="font-mono">{row.codebase_health.qg_red_reason}</span>
                  </Chip>
                ) : row.codebase_health != null ? (
                  <Chip tone="green">✓</Chip>
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
                )}
              </td>
              <td className="py-1.5 text-right" data-testid={`file-debt-${row.repo}`}>
                {row.codebase_health != null ? (
                  (row.codebase_health.large_file_count ?? 0) > 0 ? (
                    <Chip tone="red">{row.codebase_health.large_file_count} &gt;900L</Chip>
                  ) : (row.codebase_health.warn_file_count ?? 0) > 0 ? (
                    <Chip tone="yellow">{row.codebase_health.warn_file_count} &gt;700L</Chip>
                  ) : (
                    <Chip tone="green">✓</Chip>
                  )
                ) : (
                  <span className="text-[var(--color-text-muted)]">—</span>
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
/** SIT-stage tone — defensive against unknown last_sit_run_status strings. */
function sitStageTone(sit: RepoCiDetail["sit"]): ChipTone {
  if (sit.stuck_in_sit) return "red";
  const s = (sit.last_sit_run_status ?? "").toLowerCase();
  if (!s) return "gray";
  if (s.includes("success") || s.includes("complete")) return "green";
  if (s.includes("fail") || s.includes("cancel") || s.includes("timed")) return "red";
  if (s.includes("progress") || s.includes("queue") || s.includes("pending") || s.includes("running")) return "blue";
  return "gray";
}

/** One labelled node in the promotion pipeline strip. */
function PipelineStage({
  label,
  tone,
  testId,
  children,
}: {
  label: string;
  tone: ChipTone;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[76px] shrink-0" data-testid={testId}>
      <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      <Chip tone={tone}>{children}</Chip>
    </div>
  );
}

function PipelineArrow() {
  return <span className="text-[var(--color-text-muted)] px-0.5 shrink-0">→</span>;
}

/**
 * Promotion pipeline strip — the repo's position in the LDR → staging PR → SIT →
 * main → image cycle, rendered from the detail payload (branches/deltas/open_prs/
 * sit/image). The v2-never-reported deadlock + [skip ci] jam classes surface as
 * explicit badges so a stuck promotion is visible at a glance rather than buried in
 * the PR list. Plan: monitoring master — promotion-pipeline-visualization.
 */
/** N2-followup: per-branch last-green strip (LDR / staging / main). Each chip is the most-recent
 * SHA on that branch whose quality-gates-v2 concluded success — distinct from the branch HEAD,
 * which the pipeline strip above shows (and which may be red/pending). */
function BranchLastGreenStrip({ lastGreen }: { lastGreen?: Record<string, RepoCiLastGreen | null> }) {
  if (!lastGreen) return null;
  const branches = ["live-defi-rollout", "staging", "main"] as const;
  const label: Record<string, string> = {
    "live-defi-rollout": "LDR",
    staging: "staging",
    main: "main",
  };
  return (
    <div
      className="flex flex-wrap items-center gap-3 text-xs rounded-lg border border-[var(--color-border-default)] px-3 py-2"
      data-testid="repo-detail-last-green"
    >
      <span className="text-[var(--color-text-muted)]">Last green (v2):</span>
      {branches.map((b) => {
        const lg = lastGreen[b] ?? null;
        return (
          <span key={b} className="inline-flex items-center gap-1.5" data-testid={`last-green-branch-${b}`}>
            <span className="text-[var(--color-text-secondary)]">{label[b]}</span>
            {lg ? (
              <>
                <Chip tone="green">{shortSha(lg.sha)}</Chip>
                <span className="text-[var(--color-text-muted)]">· {buildTimeLabel(lg.at)}</span>
              </>
            ) : (
              <Chip tone="gray">none</Chip>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** SIT / staging-lock detail line. The pipeline strip above shows the lock/stuck STATE; this
 * surfaces the WHY + age the operator needs to act: staging_locked_reason (e.g. "breaking cascade
 * in flight") and last_sit_run_age_min — both already on the payload but unsurfaced until now.
 * Renders nothing for a clean repo (no lock, no breaking-pending, no SIT run) to avoid clutter. */
function SitLockDetail({ sit }: { sit: RepoCiSitState }) {
  const hasLockReason = sit.staging_locked && sit.staging_locked_reason;
  const hasSitAge = sit.last_sit_run_age_min !== null && sit.last_sit_run_age_min !== undefined;
  if (!hasLockReason && !hasSitAge && !sit.in_breaking_pending && !sit.stuck_in_sit) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="repo-detail-sit-lock">
      {sit.staging_locked && (
        <Chip tone="yellow">
          {sit.staging_locked_reason ? `staging locked: ${sit.staging_locked_reason}` : "staging locked"}
        </Chip>
      )}
      {sit.in_breaking_pending && <Chip tone="yellow">breaking-pending</Chip>}
      {sit.stuck_in_sit && <Chip tone="red">stuck in SIT</Chip>}
      {hasSitAge && (
        <span className="text-[var(--color-text-muted)]" data-testid="sit-run-age">
          last SIT run {sit.last_sit_run_status ? `(${sit.last_sit_run_status}) ` : ""}
          {formatAge(sit.last_sit_run_age_min)} ago
        </span>
      )}
    </div>
  );
}

function PromotionPipeline({ detail }: { detail: RepoCiDetail }) {
  const branchHead = (name: string) => detail.branches.find((b) => b.branch === name) ?? null;
  const ldr = branchHead("live-defi-rollout");
  const main = branchHead("main");
  const stagingPr = detail.open_prs.find((pr) => pr.base === "staging") ?? null;
  const mainPr = detail.open_prs.find((pr) => pr.base === "main") ?? null;
  // Each promotion hop's net delta, leading with the honest files_changed (deltaLabel renders
  // "in sync (squash skew)" when files_changed==0 despite ahead_by>0) — L294,
  // promotion_queue_conflict_wall_pileup_2026_06_17 § Class D. NB the LDR→main leg MUST pin
  // head==="live-defi-rollout": both the staging→main and LDR→main legs carry base==="main", so a
  // bare `.find(d => d.base === "main")` returned the staging→main leg (the prior ambiguous bug).
  const ldrStaging = detail.deltas.find((d) => d.base === "staging" && d.head === "live-defi-rollout") ?? null;
  const stagingMain = detail.deltas.find((d) => d.base === "main" && d.head === "staging") ?? null;
  const mainDelta = detail.deltas.find((d) => d.base === "main" && d.head === "live-defi-rollout") ?? null;
  const sit = detail.sit;
  const img = detail.image;

  const stagingTone: ChipTone = stagingPr?.stuck_class
    ? stuckClassTone(stagingPr.stuck_class)
    : stagingPr
      ? "blue"
      : sit.staging_locked
        ? "yellow"
        : "gray";
  const mainTone: ChipTone = mainPr?.stuck_class ? stuckClassTone(mainPr.stuck_class) : ciStatusTone(detail.ci_status);
  const imageTone: ChipTone = img.last_build_status === "SUCCESS" ? "green" : img.last_build_status ? "red" : "gray";

  // Explicit badges for the deadlock/jam classes the cycle most often hides.
  const jammed = detail.open_prs.flatMap((pr) =>
    pr.stuck_class === "v2_never_reported" || pr.stuck_class === "skip_ci_jammed"
      ? [{ number: pr.number, stuckClass: pr.stuck_class }]
      : [],
  );

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto rounded-lg border border-[var(--color-border-default)] px-3 py-2"
      data-testid="promotion-pipeline"
    >
      <PipelineStage label="LDR" tone="blue" testId="pipeline-stage-ldr">
        {ldr?.sha ? <ShaLink repo={detail.repo} sha={ldr.sha} /> : "—"}
      </PipelineStage>
      <PipelineArrow />
      <PipelineStage label="staging PR" tone={stagingTone} testId="pipeline-stage-staging">
        {stagingPr ? `#${stagingPr.number}` : sit.staging_locked ? "locked" : "—"}
      </PipelineStage>
      <PipelineArrow />
      <PipelineStage label="SIT" tone={sitStageTone(sit)} testId="pipeline-stage-sit">
        {sit.stuck_in_sit ? "stuck" : (sit.last_sit_run_status ?? "—")}
      </PipelineStage>
      <PipelineArrow />
      <PipelineStage label="main" tone={mainTone} testId="pipeline-stage-main">
        {main?.sha ? <ShaLink repo={detail.repo} sha={main.sha} /> : "—"}
      </PipelineStage>
      <PipelineArrow />
      <PipelineStage label="image" tone={imageTone} testId="pipeline-stage-image">
        {img.last_build_status ?? "—"}
      </PipelineStage>
      {(ldrStaging || stagingMain || mainDelta) && (
        <span
          className="ml-2 flex shrink-0 flex-wrap items-center gap-x-2 text-[10px] text-[var(--color-text-muted)]"
          data-testid="pipeline-deltas"
        >
          {ldrStaging && (
            <span data-testid="delta-ldr-staging">
              LDR→stg: {deltaLabel(ldrStaging.files_changed, ldrStaging.ahead_by)}
            </span>
          )}
          {stagingMain && (
            <span data-testid="delta-staging-main">
              stg→main: {deltaLabel(stagingMain.files_changed, stagingMain.ahead_by)}
            </span>
          )}
          {mainDelta && (
            <span data-testid="delta-ldr-main">
              LDR→main: {deltaLabel(mainDelta.files_changed, mainDelta.ahead_by)}
            </span>
          )}
        </span>
      )}
      {jammed.map((j) => (
        <Chip key={j.number} tone={stuckClassTone(j.stuckClass)} testId="pipeline-jam-badge">
          #{j.number} {STUCK_CLASS_LABELS[j.stuckClass]}
        </Chip>
      ))}
    </div>
  );
}

export function RepoDetailPanel({ repo }: { repo: string }) {
  const [detail, setDetail] = useState<RepoCiDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Image signal follows the GCP/AWS toggle (Option B ?provider=), refetching on switch.
  const { target } = useCloudProvider();

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    getRepoCiDetail(repo, target)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repo, target]);

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
      {/* Promotion pipeline strip — where this repo sits in LDR → staging → SIT → main → image. */}
      <PromotionPipeline detail={detail} />
      {/* SIT / staging-lock detail — the pipeline strip shows "locked"/"stuck"; this line surfaces
          WHY (staging_locked_reason) + how old the last SIT run is (last_sit_run_age_min), both
          already on the payload but previously unsurfaced. */}
      <SitLockDetail sit={detail.sit} />
      {/* N2-followup: per-branch last-green (LDR / staging / main) — the most-recent green v2 sha
          per branch, distinct from each branch HEAD which may be red/pending. */}
      <BranchLastGreenStrip lastGreen={detail.last_green} />
      {/* B2: build-details header — the last image build's status + source (Cloud Build/CodeBuild)
          + time + built commit (→ GitHub) + log link. Shares the B1 image signal; honest-absent
          when the repo has no Cloud Build / CodeBuild. */}
      <div
        className="flex flex-wrap items-center gap-3 text-xs rounded-lg border border-[var(--color-border-default)] px-3 py-2"
        data-testid="repo-detail-build-header"
      >
        <span className="text-[var(--color-text-muted)]">Last image build:</span>
        {detail.image.last_build_status ? (
          <>
            <Chip
              tone={
                detail.image.image_stale === true
                  ? "yellow"
                  : detail.image.last_build_status === "SUCCESS"
                    ? "green"
                    : "red"
              }
            >
              {detail.image.image_stale === true ? "stale" : detail.image.last_build_status}
            </Chip>
            {buildSourceLabel(detail.image.last_build_log_url) && (
              <span className="text-[var(--color-text-secondary)]" data-testid="build-header-source">
                {buildSourceLabel(detail.image.last_build_log_url)}
              </span>
            )}
            {detail.image.last_build_time && (
              <span className="text-[var(--color-text-muted)]" data-testid="build-header-time">
                {buildTimeLabel(detail.image.last_build_time)}
              </span>
            )}
            {detail.image.last_build_sha && (
              <a
                href={githubCommitUrl(detail.repo, detail.image.last_build_sha) ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[var(--color-text-secondary)] hover:underline"
                data-testid="build-header-sha"
                title="built commit → GitHub"
              >
                {shortSha(detail.image.last_build_sha)}
              </a>
            )}
            {detail.image.last_build_log_url && (
              <a
                href={detail.image.last_build_log_url}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                data-testid="build-header-log"
              >
                log <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {detail.image.deployed_version && (
              <span className="text-[var(--color-text-muted)]">deployed {detail.image.deployed_version}</span>
            )}
          </>
        ) : (
          <span className="text-[var(--color-text-muted)]" data-testid="build-header-none">
            no Cloud Build / CodeBuild for this repo
          </span>
        )}
      </div>
      {/* When the latest build is RED, show the LAST SUCCESSFUL build separately — the last good
          image's sha/time/log, so a failed latest doesn't hide where the running image came from. */}
      {detail.image.last_build_status &&
        detail.image.last_build_status !== "SUCCESS" &&
        detail.image.last_success_sha && (
          <div
            className="flex flex-wrap items-center gap-3 text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
            data-testid="repo-detail-last-success"
          >
            <span className="text-[var(--color-text-muted)]">Last successful build:</span>
            <Chip tone="green">SUCCESS</Chip>
            {detail.image.last_success_time && (
              <span className="text-[var(--color-text-muted)]">{buildTimeLabel(detail.image.last_success_time)}</span>
            )}
            <a
              href={githubCommitUrl(detail.repo, detail.image.last_success_sha) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-emerald-400 hover:underline"
              data-testid="last-success-sha"
              title="last good commit → GitHub"
            >
              {shortSha(detail.image.last_success_sha)}
            </a>
            {detail.image.last_success_log_url && (
              <a
                href={detail.image.last_success_log_url}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline inline-flex items-center gap-1"
                data-testid="last-success-log"
              >
                log <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      {detail.open_prs.length > 0 && (
        <div className="space-y-1" data-testid="repo-detail-prs">
          {detail.open_prs.map((pr) => {
            const v2 = prV2State(pr);
            return (
              <div
                key={pr.number}
                className="flex items-center gap-2 text-sm"
                data-testid={`repo-detail-pr-${pr.number}`}
              >
                {/* Explicit standing-PR quality-gates-v2 state (promotion-drain follow-up remainder) —
                  previously only implicit via stuck_class. */}
                <Chip tone={v2.tone} testId={`pr-v2-${pr.number}`}>
                  {v2.label}
                </Chip>
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
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="repo-detail-history">
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
  const [sortMode, setSortMode] = useState<SortMode>("severity");
  // Option B: the GCP/AWS toggle drives ?provider= on the repo-CI fetch (one backend serves both
  // clouds), NOT a base-URL swap — so the Image column reflects the selected cloud's build status.
  const { target } = useCloudProvider();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getRepoCiOverview(target)
      .then(setOverview)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [target]);

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
          {/* Promotion-stalled banner — the one-glance "here's WHY the fleet isn't reaching main":
              a dependency-order HOLD (a clean wait), not a failure. Only renders when something is held. */}
          {overview.promotion_held && overview.promotion_held.root_blockers.length > 0 && (
            <div
              data-testid="promotion-stalled-banner"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
            >
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <span className="text-amber-300">
                <span className="font-medium">Promotion stalled</span> — {overview.promotion_held.held_repos.length}{" "}
                repo{overview.promotion_held.held_repos.length === 1 ? "" : "s"} held behind{" "}
                {overview.promotion_held.root_blockers.map((b, i) => (
                  <span key={b.repo}>
                    <span className="font-mono">{b.repo}</span> (tier {b.tier}, main {b.main_files_behind} file
                    {b.main_files_behind === 1 ? "" : "s"} behind)
                    {i < overview.promotion_held!.root_blockers.length - 1 ? ", " : ""}
                  </span>
                ))}
                . Branch CI is green — this is a dependency-order wait, not a failure.
              </span>
            </div>
          )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <PromotionDrainPanel
              drain={overview.promotion_drain}
              stalledRepos={overview.repos.filter((r) => r.drain_stalled).map((r) => r.repo)}
            />
            <SitRunPanel run={overview.sit_last_run} />
            <StuckPanel stuckPrs={overview.stuck_prs} stuckInSit={overview.stuck_in_sit} />
            <PromotionBlockedPanel blocked={overview.promotion_blocked ?? []} />
            <PromotionHeldPanel held={overview.promotion_held} />
            <SemverHealthPanel health={overview.semver_health} />
          </div>
          {selectedRepo ? (
            <Card>
              <CardContent className="pt-4">
                <RepoDetailPanel repo={selectedRepo} />
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent className="pt-4">
              {/* Legend lives in non-scrolling space so its popover is not clipped by the
                  table's horizontal scroll container below. */}
              <div className="flex items-center justify-between pb-2">
                <SortControl mode={sortMode} onChange={setSortMode} />
                <BranchLegend />
              </div>
              <div className="overflow-x-auto">
                <OverviewTable
                  rows={overview.repos}
                  selected={selectedRepo}
                  onSelect={setSelectedRepo}
                  sortMode={sortMode}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      {!overview && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
