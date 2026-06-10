/**
 * Pure presentation helpers for the Repo-CI dashboard.
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2 — unit-tested chip/label logic.
 */

import type { RepoCiOverviewRow, RepoCiSitJob, StuckClass } from "../api/client";

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
  v2_never_reported: "v2 never reported",
  failing_check: "Failing check",
  automerge_stuck: "Auto-merge stuck",
};

/** Tone for a stuck-PR badge — conflict/failing are red (need a human/worker);
 * v2-never-reported is yellow (auto-recovers in-band). */
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

/** Human delta label: "+3 files" content-aware, "in sync" when no content delta. */
export function deltaLabel(filesChanged: number, aheadBy: number): string {
  if (filesChanged === 0) return aheadBy > 0 ? "in sync (squash skew)" : "in sync";
  return `${filesChanged} file${filesChanged === 1 ? "" : "s"} ahead`;
}

/** Worst problem on a repo row — drives the row-level attention badge + sorting. */
export function rowSeverity(row: RepoCiOverviewRow): number {
  if (row.ci_status === "FAILING") return 3;
  if (row.open_prs.some((pr) => pr.stuck_class) || row.sit.stuck_in_sit) return 2;
  if (row.deltas.some((d) => d.files_changed > 0)) return 1;
  return 0;
}

/** Minutes -> "18m" / "3h 20m" / "2d 4h". */
export function formatAge(ageMin: number | null | undefined): string {
  if (ageMin == null) return "—";
  if (ageMin < 60) return `${ageMin}m`;
  const hours = Math.floor(ageMin / 60);
  if (hours < 24) return `${hours}h ${ageMin % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
