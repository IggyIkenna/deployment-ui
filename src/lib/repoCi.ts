/**
 * Pure presentation helpers for the Repo-CI dashboard.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2 — unit-tested chip/label logic.
 */

import type { RepoCiOverviewRow, RepoCiPromotionBlocked, RepoCiSitJob, StuckClass } from "../api/client";

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

/** Which branches' quality-gates-v2 is currently red (`failure`/`timed_out`/`cancelled`/`startup_failure`),
 * in promotion order LDR → staging → main. Lets the chip show WHICH branch is failing rather than a bare
 * "FAILING" — distinguishes "main red, LDR recovered (draining)" from "LDR actively broken". */
export function failingBranches(row: RepoCiOverviewRow): string[] {
  const order = ["live-defi-rollout", "staging", "main"];
  const bad = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);
  if (!row.branch_ci) return [];
  return order.filter((b) => bad.has((row.branch_ci?.[b] ?? "").toLowerCase())).map(shortBranch);
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
