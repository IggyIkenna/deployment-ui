/** Unit tests for the Repo-CI presentation helpers (plan: ci_dashboard_deployment_ui_2026_06_10.md). */

import { describe, expect, it } from "vitest";
import type { RepoCiOverviewRow, RepoCiPr } from "../api/client";
import {
  branchTone,
  buildSourceLabel,
  buildTimeLabel,
  ciStatusLabel,
  ciStatusTone,
  classifyStall,
  deltaLabel,
  failingBranches,
  formatAge,
  githubBranchUrl,
  githubChecksUrl,
  githubCommitUrl,
  promotionBlockedLabel,
  promotionBlockedTone,
  prV2State,
  isDrainingClass,
  rowSeverity,
  shortSha,
  sitJobTone,
  stuckClassTone,
} from "./repoCi";

describe("ciStatusTone", () => {
  it("maps the 9-state lifecycle to tones", () => {
    expect(ciStatusTone("MAIN_GREEN")).toBe("green");
    expect(ciStatusTone("SIT_VALIDATED")).toBe("blue");
    expect(ciStatusTone("STAGING_GREEN")).toBe("blue");
    expect(ciStatusTone("STAGING_PENDING")).toBe("yellow");
    expect(ciStatusTone("FAILING")).toBe("red");
    expect(ciStatusTone("NOT_CONFIGURED")).toBe("gray");
    expect(ciStatusTone("UNKNOWN")).toBe("gray");
  });
});

describe("stuckClassTone", () => {
  it("human-actionable walls are red; auto-recoverable are yellow", () => {
    expect(stuckClassTone("conflicting")).toBe("red");
    expect(stuckClassTone("failing_check")).toBe("red");
    expect(stuckClassTone("skip_ci_jammed")).toBe("red");
    expect(stuckClassTone("v2_never_reported")).toBe("yellow");
    expect(stuckClassTone("automerge_stuck")).toBe("yellow");
  });
});

describe("sitJobTone", () => {
  it("in-progress jobs are blue regardless of conclusion", () => {
    expect(sitJobTone({ name: "x", status: "in_progress", conclusion: null })).toBe("blue");
    expect(sitJobTone({ name: "x", status: "queued", conclusion: null })).toBe("blue");
  });
  it("completed jobs map their conclusion", () => {
    expect(sitJobTone({ name: "x", status: "completed", conclusion: "success" })).toBe("green");
    expect(sitJobTone({ name: "x", status: "completed", conclusion: "failure" })).toBe("red");
    expect(sitJobTone({ name: "x", status: "completed", conclusion: "skipped" })).toBe("gray");
  });
});

describe("shortSha", () => {
  it("truncates to 7 and dashes absent branches", () => {
    expect(shortSha("abc1234567890")).toBe("abc1234");
    expect(shortSha(null)).toBe("—");
  });
});

describe("deltaLabel", () => {
  it("reports content deltas + commit count (B3), calls out squash skew, never lies", () => {
    expect(deltaLabel(0, 0)).toBe("in sync");
    expect(deltaLabel(0, 5)).toBe("in sync · 5 commits (squash skew)");
    expect(deltaLabel(0, 1)).toBe("in sync · 1 commit (squash skew)");
    expect(deltaLabel(1, 1)).toBe("1 file ahead · 1 commit");
    expect(deltaLabel(4, 3)).toBe("4 files ahead · 3 commits");
  });
});

describe("promotionBlockedTone / promotionBlockedLabel (G1)", () => {
  it("quarantined is red/CRITICAL; failing-not-quarantined is yellow/WARNING", () => {
    const quar = { repo: "greeks-service", failures: 3, quarantined: true, escalated: true };
    const warn = { repo: "execution-service", failures: 1, quarantined: false };
    expect(promotionBlockedTone(quar)).toBe("red");
    expect(promotionBlockedTone(warn)).toBe("yellow");
    expect(promotionBlockedLabel(quar)).toBe("3 fails · quarantined");
    expect(promotionBlockedLabel(warn)).toBe("1 fail");
  });
});

describe("prV2State (standing-PR v2 explicit)", () => {
  const pr = (over: Partial<RepoCiPr>): RepoCiPr => ({ repo: "r", number: 1, ...over });
  it("a genuinely failed check reads 'v2 failed' (red)", () => {
    expect(prV2State(pr({ failed_check: true, v2_present: true }))).toEqual({ label: "v2 failed", tone: "red" });
  });
  it("v2 absent from the rollup reads 'v2 not reported' (yellow — the deadlock)", () => {
    expect(prV2State(pr({ failed_check: false, v2_present: false }))).toEqual({
      label: "v2 not reported",
      tone: "yellow",
    });
  });
  it("reported + not failed reads 'v2 reported' (green)", () => {
    expect(prV2State(pr({ failed_check: false, v2_present: true }))).toEqual({ label: "v2 reported", tone: "green" });
  });
  it("failed_check wins over a present check (failure is the actionable state)", () => {
    expect(prV2State(pr({ failed_check: true, v2_present: false })).label).toBe("v2 failed");
  });
});

describe("buildTimeLabel (B1)", () => {
  it("renders MM-DD HH:MM from an ISO timestamp, em-dash when absent", () => {
    expect(buildTimeLabel("2026-06-11T07:30:00Z")).toBe("06-11 07:30");
    expect(buildTimeLabel(null)).toBe("—");
    expect(buildTimeLabel(undefined)).toBe("—");
    expect(buildTimeLabel("bad")).toBe("—");
  });
});

describe("buildSourceLabel (B2)", () => {
  it("infers the build system from the console log URL host", () => {
    expect(buildSourceLabel("https://console.cloud.google.com/cloud-build/builds/x")).toBe("Cloud Build");
    expect(buildSourceLabel("https://console.aws.amazon.com/codesuite/codebuild/builds/y")).toBe("CodeBuild");
    expect(buildSourceLabel(null)).toBeNull();
    expect(buildSourceLabel(undefined)).toBeNull();
    expect(buildSourceLabel("https://example.com/unknown")).toBeNull();
  });
});

describe("formatAge", () => {
  it("formats minutes/hours/days", () => {
    expect(formatAge(null)).toBe("—");
    expect(formatAge(18)).toBe("18m");
    expect(formatAge(200)).toBe("3h 20m");
    expect(formatAge(52 * 60)).toBe("2d 4h");
  });
});

function row(overrides: Partial<RepoCiOverviewRow>): RepoCiOverviewRow {
  return {
    repo: "r",
    repo_type: "service",
    ci_status: "MAIN_GREEN",
    branches: [],
    deltas: [],
    open_prs: [],
    sit: {
      in_breaking_pending: false,
      staging_locked: false,
      staging_locked_reason: null,
      last_sit_run_status: null,
      last_sit_run_age_min: null,
      stuck_in_sit: false,
    },
    image: { last_build_status: null, last_build_sha: null, deployed_version: null, image_stale: null },
    ...overrides,
  };
}

describe("failingBranches / ciStatusLabel (branch-aware CI chip)", () => {
  it("pins the red branch from branch_ci, in promotion order", () => {
    const mainRed = row({
      ci_status: "FAILING",
      branch_ci: { "live-defi-rollout": "success", staging: "success", main: "failure" },
    });
    expect(failingBranches(mainRed)).toEqual(["main"]);
    expect(ciStatusLabel(mainRed)).toBe("FAILING (main)");

    const ldrRed = row({
      ci_status: "STAGING_GREEN",
      branch_ci: { "live-defi-rollout": "failure", staging: "success", main: "success" },
    });
    expect(failingBranches(ldrRed)).toEqual(["LDR"]);
    expect(ciStatusLabel(ldrRed)).toBe("STAGING_GREEN (LDR)");
  });

  it("lists multiple red branches LDR→staging→main and treats timed_out/cancelled as red", () => {
    const twoRed = row({
      ci_status: "FAILING",
      branch_ci: { "live-defi-rollout": "timed_out", staging: "success", main: "cancelled" },
    });
    expect(failingBranches(twoRed)).toEqual(["LDR", "main"]);
    expect(ciStatusLabel(twoRed)).toBe("FAILING (LDR, main)");
  });

  it("falls back to bare ci_status when branch_ci is absent or all green", () => {
    expect(ciStatusLabel(row({ ci_status: "MAIN_GREEN" }))).toBe("MAIN_GREEN");
    expect(
      ciStatusLabel(
        row({ ci_status: "MAIN_GREEN", branch_ci: { "live-defi-rollout": "success", staging: null, main: "success" } }),
      ),
    ).toBe("MAIN_GREEN");
  });

  // Slack↔/repos parity (ci_status_repos_promotion_failure_parity_2026_06_25): a MAIN_GREEN repo
  // whose LDR→main promotion PR's required v2 FAILED (paged Slack CRITICAL) must NOT read bare
  // MAIN_GREEN — the headline annotates the failing promotion so Slack + /repos agree.
  it("annotates `· PROMOTION FAILING` when promotion_blocked masks a green ci_status (the PM PR-547 case)", () => {
    expect(ciStatusLabel(row({ ci_status: "MAIN_GREEN", promotion_blocked: true }))).toBe(
      "MAIN_GREEN · PROMOTION FAILING",
    );
    // also composes with the branch-aware suffix when a green-ish status is pinned
    expect(ciStatusLabel(row({ ci_status: "STAGING_GREEN", promotion_blocked: true }))).toBe(
      "STAGING_GREEN · PROMOTION FAILING",
    );
  });

  it("does NOT double-flag when ci_status already reads FAILING", () => {
    const failing = row({
      ci_status: "FAILING",
      promotion_blocked: true,
      branch_ci: { "live-defi-rollout": "failure", staging: "success", main: "success" },
    });
    // the branch-aware "FAILING (LDR)" stands; no redundant "· PROMOTION FAILING" appended
    expect(ciStatusLabel(failing)).toBe("FAILING (LDR)");
  });

  it("leaves the label bare when promotion_blocked is absent/false (no false annotation)", () => {
    expect(ciStatusLabel(row({ ci_status: "MAIN_GREEN", promotion_blocked: false }))).toBe("MAIN_GREEN");
    expect(ciStatusLabel(row({ ci_status: "MAIN_GREEN" }))).toBe("MAIN_GREEN");
  });
});

describe("branchTone (per-branch SHA-cell colour — replaces the CI-status column)", () => {
  it("maps a branch's live conclusion: success→green, failure/timed_out→red, skipped→gray", () => {
    const r = row({
      ci_status: "FAILING",
      branch_ci: { "live-defi-rollout": "success", staging: "skipped", main: "failure" },
    });
    expect(branchTone(r, "live-defi-rollout", "abc1234")).toBe("green");
    expect(branchTone(r, "main", "def5678")).toBe("red");
    expect(branchTone(r, "staging", "aaa1111")).toBe("gray"); // skipped → unknown, not green
    expect(branchTone(row({ ci_status: "FAILING", branch_ci: { main: "timed_out" } }), "main", "x")).toBe("red");
  });

  it("a missing branch (no SHA) is gray regardless of status", () => {
    expect(branchTone(row({ ci_status: "MAIN_GREEN" }), "staging", null)).toBe("gray");
  });

  it("MAIN_GREEN repo with explicit branch_ci (synthetic success from the API) ⟹ green for all branches", () => {
    // After the deployment-api fix, branch_ci is populated for ALL repos: MAIN_GREEN repos receive
    // { "live-defi-rollout": "success", staging: "success", main: "success" } synthetically (no
    // extra API calls). All three branches must resolve to green via the explicit conclusion path.
    const r = row({
      ci_status: "MAIN_GREEN",
      branch_ci: { "live-defi-rollout": "success", staging: "success", main: "success" },
    });
    expect(branchTone(r, "live-defi-rollout", "abc1234")).toBe("green");
    expect(branchTone(r, "staging", "abc1200")).toBe("green");
    expect(branchTone(r, "main", "abc1100")).toBe("green");
  });

  it("non-FAILING repo with no live branch_ci (degraded fetch) ⟹ green fallback", () => {
    // branch_ci is populated for all repos (MAIN_GREEN synthetic, others live); absence here
    // means a fetch failure. Non-FAILING repo defaults to green on the fallback path.
    expect(branchTone(row({ ci_status: "MAIN_GREEN" }), "main", "abc1100")).toBe("green");
    expect(branchTone(row({ ci_status: "STAGING_GREEN" }), "live-defi-rollout", "ldr0001")).toBe("green");
  });

  it("FAILING repo with no branch_ci for a branch ⟹ gray (unknown, not assumed green)", () => {
    expect(branchTone(row({ ci_status: "FAILING" }), "main", "abc1234")).toBe("gray");
  });
});

describe("rowSeverity", () => {
  it("FAILING > stuck > content delta > clean", () => {
    expect(rowSeverity(row({ ci_status: "FAILING" }))).toBe(3);
    expect(rowSeverity(row({ open_prs: [{ repo: "r", number: 1, stuck_class: "conflicting" }] }))).toBe(2);
    expect(
      rowSeverity(
        row({
          sit: {
            in_breaking_pending: true,
            staging_locked: true,
            staging_locked_reason: "x",
            last_sit_run_status: "failure",
            last_sit_run_age_min: 240,
            stuck_in_sit: true,
          },
        }),
      ),
    ).toBe(2);
    expect(
      rowSeverity(
        row({ deltas: [{ base: "main", head: "live-defi-rollout", ahead_by: 1, behind_by: 0, files_changed: 2 }] }),
      ),
    ).toBe(1);
    expect(rowSeverity(row({}))).toBe(0);
  });

  it("a blocked promotion (promotion_blocked) is severity 3 even when ci_status reads MAIN_GREEN (parity)", () => {
    // Slack↔/repos parity: the PM PR-547 case — MAIN_GREEN repo, failing LDR→main PR — must sort to
    // the top of the attention queue, not bury behind a green ci_status (severity would be 0).
    expect(rowSeverity(row({ ci_status: "MAIN_GREEN", promotion_blocked: true }))).toBe(3);
  });

  it("a DRAINING-only stuck PR is in-progress (1), NOT counted as stuck (2) — operator 2026-06-11", () => {
    // auto-merge-armed / v2-re-fire drains self-heal in-band → pending, not parked.
    expect(rowSeverity(row({ open_prs: [{ repo: "r", number: 1, stuck_class: "automerge_stuck" }] }))).toBe(1);
    expect(rowSeverity(row({ open_prs: [{ repo: "r", number: 2, stuck_class: "v2_never_reported" }] }))).toBe(1);
    // a genuine conflict wall on the same row still escalates to stuck (2).
    expect(
      rowSeverity(
        row({
          open_prs: [
            { repo: "r", number: 1, stuck_class: "automerge_stuck" },
            { repo: "r", number: 3, stuck_class: "conflicting" },
          ],
        }),
      ),
    ).toBe(2);
  });
});

describe("isDrainingClass", () => {
  it("auto-recovering classes are draining (pending); intervention classes are not", () => {
    expect(isDrainingClass("automerge_stuck")).toBe(true);
    expect(isDrainingClass("v2_never_reported")).toBe(true);
    expect(isDrainingClass("conflicting")).toBe(false);
    expect(isDrainingClass("failing_check")).toBe(false);
    expect(isDrainingClass("skip_ci_jammed")).toBe(false);
  });
});

describe("github deep-links (operator click-through rule)", () => {
  it("githubCommitUrl builds the commit page, null when no SHA", () => {
    expect(githubCommitUrl("mtds", "abc1234")).toBe("https://github.com/IggyIkenna/mtds/commit/abc1234");
    expect(githubCommitUrl("mtds", null)).toBeNull();
  });
  it("githubChecksUrl points at the SHA's checks, falls back to actions when no SHA", () => {
    expect(githubChecksUrl("mtds", "abc1234")).toBe("https://github.com/IggyIkenna/mtds/commit/abc1234/checks");
    expect(githubChecksUrl("mtds", null)).toBe("https://github.com/IggyIkenna/mtds/actions");
  });
  it("githubBranchUrl builds the tree page", () => {
    expect(githubBranchUrl("mtds", "live-defi-rollout")).toBe(
      "https://github.com/IggyIkenna/mtds/tree/live-defi-rollout",
    );
  });
});

describe("classifyStall (per-repo promotion-stall classifier)", () => {
  const d = (base: string, head: string, files: number, ahead = files) => ({
    base,
    head,
    ahead_by: ahead,
    behind_by: 0,
    files_changed: files,
  });
  it("no real content behind main → none (in sync, or ahead-by-commits-only squash skew)", () => {
    expect(classifyStall(row({ deltas: [d("main", "live-defi-rollout", 0, 3)] })).kind).toBe("none");
  });
  it("staging ahead of main, LDR==staging, no PR, status on-main → staging-to-main + ciStatusStale (the AO class)", () => {
    const r = classifyStall(
      row({
        ci_status: "MAIN_GREEN",
        deltas: [
          d("staging", "live-defi-rollout", 0, 96),
          d("main", "staging", 144, 326),
          d("main", "live-defi-rollout", 71, 420),
        ],
      }),
    );
    expect(r.kind).toBe("staging-to-main");
    expect(r.files).toBe(144);
    expect(r.ciStatusStale).toBe(true);
  });
  it("real content on LDR not yet on staging → ldr-to-staging", () => {
    const r = classifyStall(
      row({
        deltas: [d("staging", "live-defi-rollout", 3), d("main", "staging", 1), d("main", "live-defi-rollout", 4)],
      }),
    );
    expect(r.kind).toBe("ldr-to-staging");
    expect(r.files).toBe(3);
  });
  it("blocked_by non-empty → dep-order carrying the blocker names", () => {
    const r = classifyStall(
      row({
        ci_status: "STAGING_GREEN",
        deltas: [d("main", "live-defi-rollout", 5), d("main", "staging", 5)],
        blocked_by: [{ name: "unified-api-contracts", tier: "0", ci_status: "STAGING_GREEN" }],
      }),
    );
    expect(r.kind).toBe("dep-order");
    expect(r.blockers).toEqual(["unified-api-contracts"]);
  });
  it("a genuinely-jammed PR → pr-stuck (draining classes do NOT count as stuck)", () => {
    const r = classifyStall(
      row({
        deltas: [d("main", "live-defi-rollout", 4), d("main", "staging", 2)],
        open_prs: [{ repo: "r", number: 41, stuck_class: "conflicting" }],
      }),
    );
    expect(r.kind).toBe("pr-stuck");
    expect(r.pr).toBe(41);
  });
  it("a draining (auto-merge armed) PR is not pr-stuck — falls through to the hop classification", () => {
    const r = classifyStall(
      row({
        ci_status: "MAIN_GREEN",
        deltas: [d("staging", "live-defi-rollout", 0), d("main", "staging", 10), d("main", "live-defi-rollout", 10)],
        open_prs: [{ repo: "r", number: 9, stuck_class: "automerge_stuck" }],
      }),
    );
    expect(r.kind).toBe("staging-to-main");
  });

  // WS-L regression: ldr_main repos promote LDR→main directly; staging ahead of main is normal.
  it("ldr_main repo: staging ahead of main, no PR, MAIN_GREEN → none (NOT staging-to-main)", () => {
    const r = classifyStall(
      row({
        ci_status: "MAIN_GREEN",
        promotion_model: "ldr_main",
        deltas: [
          d("staging", "live-defi-rollout", 0, 0),
          d("main", "staging", 5, 10),
          d("main", "live-defi-rollout", 5, 10),
        ],
      }),
    );
    expect(r.kind).toBe("none");
  });

  it("non-ldr_main repo in same state STILL returns staging-to-main (no regression)", () => {
    const r = classifyStall(
      row({
        ci_status: "MAIN_GREEN",
        // no promotion_model field = default staging→main path
        deltas: [
          d("staging", "live-defi-rollout", 0, 0),
          d("main", "staging", 5, 10),
          d("main", "live-defi-rollout", 5, 10),
        ],
      }),
    );
    expect(r.kind).toBe("staging-to-main");
  });
});
