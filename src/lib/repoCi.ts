/**
 * Pure presentation helpers for the Repo-CI dashboard.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2 — unit-tested chip/label logic.
 */

import type {
  RepoCiBranchDelta,
  RepoCiOverviewRow,
  RepoCiPr,
  RepoCiPromotionBlocked,
  RepoCiSitJob,
  StuckClass,
} from "../api/client";

export type ChipTone = "green" | "yellow" | "red" | "gray" | "blue";

/** Tone for the 9-state ci_status lifecycle chip. */
export function ciStatusTone(ciStatus: string): ChipTone {
  switch (ciStatus) {
    case "MAIN_GREEN":
      return "green";
    case "SIT_VALIDATED":
    case "STAGING_GREEN":
      return "blue";
    case "STAGING_PENDING":
    case "FEATURE_GREEN":
    case "LOCAL_PASS":
      return "yellow";
    case "FAILING":
      return "red";
    default:
      return "gray";
  }
}

export const STUCK_CLASS_LABELS: Record<StuckClass, string> = {
  conflicting: "Conflict wall",
  skip_ci_jammed: "[skip ci] jam",
  v2_never_reported: "Draining (re-firing v2)",
  failing_check: "Failing check",
  automerge_stuck: "Draining (auto-merge armed)",
};

/** A "draining" stuck-class is one that recovers WITHOUT a human/worker — the promote bot's
 * stale-check force-dispatches v2 / re-arms auto-merge in-band, so it is PENDING (being handled),
 * not parked. Kept distinct from the genuinely-stuck classes (conflict / failing / [skip ci] jam)
 * that need an agent to intervene. Operator ask 2026-06-11: a self-healing drain must read as
 * "draining/pending", not inflate the "Stuck" attention count. (The full agent-attributed
 * "a worker is on this" signal needs the orchestrator's active-worker assignment — Gap 4 in
 * ci_pipeline_self_healing_gaps_2026_06_11.md.) */
export function isDrainingClass(stuckClass: StuckClass): boolean {
  return stuckClass === "automerge_stuck" || stuckClass === "v2_never_reported";
}

/** Tone for a stuck-PR badge — conflict/failing/[skip ci] jam are red (need a human/worker);
 * the draining classes (auto-merge armed / v2 re-fire) are yellow (auto-recover in-band). */
export function stuckClassTone(stuckClass: StuckClass): ChipTone {
  switch (stuckClass) {
    case "conflicting":
    case "failing_check":
    case "skip_ci_jammed":
      return "red";
    case "v2_never_reported":
    case "automerge_stuck":
      return "yellow";
  }
}

/** Explicit quality-gates-v2 state for a standing promotion PR (LDR→staging / LDR→main).
 * Today the v2 outcome is implicit (you infer it from stuck_class / its absence); this makes it
 * explicit per PR from the rollup the backend already provides:
 *   - failed_check        → the gate genuinely FAILED (red, needs a fix)
 *   - v2_present === false → v2 never reported (yellow — the auto-recoverable deadlock)
 *   - otherwise           → v2 reported, no failure (green — draining / passed)
 * Note: a rollup state, not a precise success/in_progress split (the overview doesn't fetch the
 * exact conclusion for non-blocked PRs to stay within the GitHub-API budget). */
export function prV2State(pr: RepoCiPr): { label: string; tone: ChipTone } {
  if (pr.failed_check) return { label: "v2 failed", tone: "red" };
  if (pr.v2_present === false) return { label: "v2 not reported", tone: "yellow" };
  return { label: "v2 reported", tone: "green" };
}

/** Tone for one SIT job chip (queued/in_progress are blue; completed maps conclusion). */
export function sitJobTone(job: RepoCiSitJob): ChipTone {
  if (job.status !== "completed") return "blue";
  if (job.conclusion === "success") return "green";
  if (job.conclusion === "skipped" || job.conclusion === "neutral") return "gray";
  return "red";
}

/** Short SHA for display (7 chars; em dash when the branch is absent). */
export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "—";
}

/** Human delta label: content-aware files-ahead (the honest signal) + commit count (B3 —
 * operator add 2026-06-11). `files_changed` stays the truth; `ahead_by` is shown alongside so
 * the squash-skew case ("0 files but N commits ahead") is legible rather than a bare "in sync". */
export function deltaLabel(filesChanged: number, aheadBy: number): string {
  const commits = aheadBy > 0 ? ` · ${aheadBy} commit${aheadBy === 1 ? "" : "s"}` : "";
  if (filesChanged === 0) return aheadBy > 0 ? `in sync${commits} (squash skew)` : "in sync";
  return `${filesChanged} file${filesChanged === 1 ? "" : "s"} ahead${commits}`;
}

/** Short branch label for the CI chip annotation: live-defi-rollout → LDR, else the branch name. */
function shortBranch(branch: string): string {
  return branch === "live-defi-rollout" ? "LDR" : branch;
}

/** quality-gates-v2 conclusions that mean a branch is RED (not success / in-progress / skipped). */
const BAD_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);

/** Which branches' quality-gates-v2 is currently red (`failure`/`timed_out`/`cancelled`/`startup_failure`),
 * in promotion order LDR → staging → main. Lets the chip show WHICH branch is failing rather than a bare
 * "FAILING" — distinguishes "main red, LDR recovered (draining)" from "LDR actively broken". */
export function failingBranches(row: RepoCiOverviewRow): string[] {
  const order = ["live-defi-rollout", "staging", "main"];
  if (!row.branch_ci) return [];
  return order.filter((b) => BAD_CONCLUSIONS.has((row.branch_ci?.[b] ?? "").toLowerCase())).map(shortBranch);
}

/** Per-branch CI colour for the LDR/staging/main SHA cells — replaces the standalone CI-status column
 * (operator review 2026-06-19). GREEN when that branch's last quality-gates-v2 concluded success, RED
 * when it failed, GRAY when the branch is absent or the conclusion is unknown/skipped.
 *
 * `branch_ci` is live-fetched only for the FAILING repos (GitHub-API budget bound); a non-FAILING repo's
 * branches all last-passed, so an absent `branch_ci` on a non-FAILING repo ⟹ green. A branch that is
 * merely BEHIND (stale) is still GREEN here — staleness is shown by the last-green + LDR→main-delta/lag
 * columns, not by this pass/fail colour. */
export function branchTone(row: RepoCiOverviewRow, branch: string, sha: string | null): ChipTone {
  if (!sha) return "gray"; // branch does not exist for this repo
  const conclusion = row.branch_ci?.[branch];
  if (conclusion) {
    const c = conclusion.toLowerCase();
    if (c === "success") return "green";
    return BAD_CONCLUSIONS.has(c) ? "red" : "gray";
  }
  // Fallback for degraded-fetch: branch_ci is populated for all repos (MAIN_GREEN synthetic,
  // others live); absence here means a fetch failure, not a green repo. Non-FAILING = green.
  return row.ci_status === "FAILING" ? "gray" : "green";
}

/** "FAILING (main)" / "FAILING (LDR, staging)" when branch_ci pins the red branch(es); else bare ci_status. */
export function ciStatusLabel(row: RepoCiOverviewRow): string {
  const failing = failingBranches(row);
  if (failing.length === 0) return row.ci_status;
  return `${row.ci_status} (${failing.join(", ")})`;
}

/** Worst problem on a repo row — drives the row-level attention badge + sorting. */
export function rowSeverity(row: RepoCiOverviewRow): number {
  if (row.ci_status === "FAILING") return 3;
  // Genuinely-stuck (needs a human/worker) = a non-draining stuck_class, or SIT-stuck → attention (2).
  // A draining-only PR (auto-merge armed / v2 re-fire, self-healing) is in-progress (1), NOT counted
  // as "stuck" — so a self-healing drain does not inflate the operator's attention queue (2026-06-11).
  const hasGenuineStuck = row.open_prs.some((pr) => pr.stuck_class && !isDrainingClass(pr.stuck_class));
  if (hasGenuineStuck || row.sit.stuck_in_sit) return 2;
  if (row.open_prs.some((pr) => pr.stuck_class) || row.deltas.some((d) => d.files_changed > 0)) return 1;
  return 0;
}

/** The promotion hop a repo's lag is stuck on + why — the row-level answer to "8d lag, but WHERE and
 * WHY". Derived purely from the deltas + open PRs + ci_status the overview already returns (no extra
 * fetch). The five classes the dashboard distinguishes:
 *   - `none`            — no real content behind main (in sync, or ahead-by-commits-only squash skew).
 *   - `dep-order`       — STAGE 1.8 holds it: a dependency isn't on main yet (`blocked_by` non-empty).
 *   - `pr-stuck`        — a promotion PR exists but is genuinely jammed (conflict / failing / [skip ci]).
 *   - `ldr-to-staging`  — the Tier-C drain is behind: real content sits on LDR not yet on staging.
 *   - `staging-to-main` — staging is ahead of main with NO promotion PR (the promoter isn't firing).
 *                         `ciStatusStale` flags the dangerous sub-case where ci_status reads on-main
 *                         (MAIN_GREEN / SIT_VALIDATED) yet git says main is N files behind staging —
 *                         the agent-orchestrator class, invisible to every status-based surface and
 *                         caught only by the git-delta lag chip.
 * Single source for the row stall-reason chip + the delta-column `?` taxonomy. */
export type StallKind = "none" | "dep-order" | "pr-stuck" | "ldr-to-staging" | "staging-to-main";

export interface StallReason {
  kind: StallKind;
  /** files on the stuck hop (staging→main for staging-to-main, LDR→staging for ldr-to-staging). */
  files: number;
  /** dep-order: the blocking dependency names (mirror of `blocked_by`). */
  blockers: string[];
  /** pr-stuck: the jammed PR number + its stuck-class. */
  pr?: number;
  stuckClass?: StuckClass;
  /** staging-to-main: ci_status reads on-main but the content isn't — the "status lies" case. */
  ciStatusStale?: boolean;
}

/** ci_status values that read as "on main" — STAGE 1.8's on-main set; a repo here that is nonetheless
 * staging-ahead-of-main is the masked-stall (status-stale) case. */
const ON_MAIN_CI_STATUSES = new Set(["MAIN_GREEN", "SIT_VALIDATED"]);

function findDelta(row: RepoCiOverviewRow, base: string, head: string): RepoCiBranchDelta | undefined {
  return row.deltas.find((d) => d.base === base && d.head === head);
}

export function classifyStall(row: RepoCiOverviewRow): StallReason {
  const ldrMain = findDelta(row, "main", "live-defi-rollout");
  const stagingMain = findDelta(row, "main", "staging");
  const ldrStaging = findDelta(row, "staging", "live-defi-rollout");
  const mainFiles = ldrMain?.files_changed ?? 0;
  const stagingMainFiles = stagingMain?.files_changed ?? 0;
  const ldrStagingFiles = ldrStaging?.files_changed ?? 0;
  // No real content behind main → no stall (in sync, or ahead-by-commits-only squash skew).
  if (mainFiles === 0) return { kind: "none", files: 0, blockers: [] };
  // Dep-order: STAGE 1.8 holds it behind a dependency that isn't on main yet.
  if (row.blocked_by && row.blocked_by.length > 0) {
    return { kind: "dep-order", files: stagingMainFiles, blockers: row.blocked_by.map((d) => d.name) };
  }
  // A promotion PR exists but is genuinely jammed (not a self-healing drain).
  const stuck = row.open_prs.find((pr) => pr.stuck_class && !isDrainingClass(pr.stuck_class));
  if (stuck) {
    return {
      kind: "pr-stuck",
      files: stagingMainFiles,
      blockers: [],
      pr: stuck.number,
      stuckClass: stuck.stuck_class ?? undefined,
    };
  }
  // Real content on LDR not yet on staging → the Tier-C drain is behind.
  if (ldrStagingFiles > 0) {
    return { kind: "ldr-to-staging", files: ldrStagingFiles, blockers: [] };
  }
  // staging == LDR by content, but staging is ahead of main with no PR → the staging→main promoter
  // isn't firing. ciStatusStale ⟺ ci_status reads on-main while git says it isn't (the AO class).
  return {
    kind: "staging-to-main",
    files: stagingMainFiles || mainFiles,
    blockers: [],
    ciStatusStale: ON_MAIN_CI_STATUSES.has(row.ci_status),
  };
}

/** Tone for a promotion-blocked entry — a quarantined repo is parked out of staging→main
 * (CRITICAL page) → red; failing-but-not-yet-quarantined is a WARNING → yellow. */
export function promotionBlockedTone(entry: RepoCiPromotionBlocked): ChipTone {
  return entry.quarantined ? "red" : "yellow";
}

/** Compact "2 fails · quarantined" / "1 fail" label for a promotion-blocked entry. */
export function promotionBlockedLabel(entry: RepoCiPromotionBlocked): string {
  const fails = `${entry.failures} fail${entry.failures === 1 ? "" : "s"}`;
  return entry.quarantined ? `${fails} · quarantined` : fails;
}

/** Short build-time label "MM-DD HH:MM" from an ISO timestamp (B1 — when the image last
 * built). Deterministic (no wall-clock) so it's test-stable; em-dash when absent. */
export function buildTimeLabel(iso: string | null | undefined): string {
  if (!iso || iso.length < 16) return "—";
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}

/** Which build system produced a build, inferred from its console log URL host (B2 — the
 * drill-down build header shows the source). Cloud Build / CodeBuild, or null when unknown. */
export function buildSourceLabel(logUrl: string | null | undefined): string | null {
  if (!logUrl) return null;
  if (logUrl.includes("cloud.google.com") || logUrl.includes("cloud-build")) return "Cloud Build";
  if (logUrl.includes("aws.amazon.com") || logUrl.includes("codebuild")) return "CodeBuild";
  return null;
}

/** Minutes -> "18m" / "3h 20m" / "2d 4h". */
export function formatAge(ageMin: number | null | undefined): string {
  if (ageMin == null) return "—";
  if (ageMin < 60) return `${ageMin}m`;
  const hours = Math.floor(ageMin / 60);
  if (hours < 24) return `${hours}h ${ageMin % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// --- GitHub deep-links (operator add 2026-06-10: every status atom click-throughs
// to the authoritative existing UI — GitHub for GitHub-authoritative atoms). The org
// is the workspace constant; repo names match the GitHub repo slugs 1:1. ----------

export const GITHUB_ORG = "IggyIkenna";

/** Commit page for a SHA — used to deep-link branch-head + history SHAs. */
export function githubCommitUrl(repo: string, sha: string | null): string | null {
  return sha ? `https://github.com/${GITHUB_ORG}/${repo}/commit/${sha}` : null;
}

/** Branch tree page — deep-link a branch-head label. */
export function githubBranchUrl(repo: string, branch: string): string {
  return `https://github.com/${GITHUB_ORG}/${repo}/tree/${branch}`;
}

/** Checks page for a SHA — deep-link a `quality-gates-v2` / "feature green" CI chip
 * to where the check runs live (answers "why is it this colour"). */
export function githubChecksUrl(repo: string, sha: string | null): string {
  return sha
    ? `https://github.com/${GITHUB_ORG}/${repo}/commit/${sha}/checks`
    : `https://github.com/${GITHUB_ORG}/${repo}/actions`;
}
