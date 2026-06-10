/** Unit tests for the Repo-CI presentation helpers (plan: ci_dashboard_deployment_ui_2026_06_10.md). */

import { describe, expect, it } from "vitest";
import type { RepoCiOverviewRow } from "../api/client";
import {
  ciStatusTone,
  deltaLabel,
  formatAge,
  githubBranchUrl,
  githubChecksUrl,
  githubCommitUrl,
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
  it("reports content deltas, calls out squash skew, never lies on commit count", () => {
    expect(deltaLabel(0, 0)).toBe("in sync");
    expect(deltaLabel(0, 5)).toBe("in sync (squash skew)");
    expect(deltaLabel(1, 1)).toBe("1 file ahead");
    expect(deltaLabel(4, 3)).toBe("4 files ahead");
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
