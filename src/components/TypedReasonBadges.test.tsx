import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TypedReasonBadges,
  EMPTY_REASON_KEYS,
  FAILURE_PILLAR_KEYS,
  emptyReasonMeta,
  failurePillarMeta,
  isEmptyReasonKey,
  isFailurePillarKey,
} from "./TypedReasonBadges";

describe("TypedReasonBadges", () => {
  it("returns null when both maps are absent", () => {
    const { container } = render(<TypedReasonBadges />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when every count is zero", () => {
    const { container } = render(
      <TypedReasonBadges
        emptyReasons={{ EXPECTED_HOLIDAY: 0, SOURCE_RETURNED_ZERO: 0 }}
        failurePillars={{ failed_cluster: 0, failed_other: 0 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders only non-zero pills", () => {
    render(
      <TypedReasonBadges
        emptyReasons={{
          EXPECTED_HOLIDAY: 3,
          EXPECTED_WEEKEND: 0,
          SOURCE_RETURNED_ZERO: 1,
        }}
        failurePillars={{
          failed_cluster: 2,
          failed_other: 0,
        }}
      />,
    );
    expect(screen.getByTestId("typed-reason-badge-EXPECTED_HOLIDAY")).toBeTruthy();
    expect(screen.getByTestId("typed-reason-badge-SOURCE_RETURNED_ZERO")).toBeTruthy();
    expect(screen.getByTestId("typed-reason-badge-failed_cluster")).toBeTruthy();
    expect(screen.queryByTestId("typed-reason-badge-EXPECTED_WEEKEND")).toBeNull();
    expect(screen.queryByTestId("typed-reason-badge-failed_other")).toBeNull();
  });

  it("orders failure pillars before empty reasons", () => {
    render(
      <TypedReasonBadges
        emptyReasons={{ EXPECTED_HOLIDAY: 5 }}
        failurePillars={{ failed_cluster: 1 }}
        testIdPrefix="my-row"
      />,
    );
    const root = screen.getByTestId("my-row-typed-reason-badges");
    const badges = root.querySelectorAll("[data-testid^='my-row-typed-reason-badge-']");
    expect(badges.length).toBe(2);
    expect(badges[0].getAttribute("data-badge-kind")).toBe("failure_pillar");
    expect(badges[1].getAttribute("data-badge-kind")).toBe("empty_reason");
  });

  it("emits the count on each pill", () => {
    render(
      <TypedReasonBadges emptyReasons={{ SOURCE_RETURNED_ZERO: 17 }} failurePillars={{ failed_timestamp_bias: 4 }} />,
    );
    expect(screen.getByTestId("typed-reason-badge-SOURCE_RETURNED_ZERO").getAttribute("data-badge-count")).toBe("17");
    expect(screen.getByTestId("typed-reason-badge-failed_timestamp_bias").getAttribute("data-badge-count")).toBe("4");
  });

  it("renders interactive buttons when onBadgeClick is supplied", () => {
    const onClick = vi.fn();
    render(
      <TypedReasonBadges
        emptyReasons={{ EXPECTED_HOLIDAY: 1 }}
        failurePillars={{ failed_cluster: 1 }}
        onBadgeClick={onClick}
      />,
    );
    const empty = screen.getByTestId("typed-reason-badge-EXPECTED_HOLIDAY");
    const failure = screen.getByTestId("typed-reason-badge-failed_cluster");
    expect(empty.tagName).toBe("BUTTON");
    expect(failure.tagName).toBe("BUTTON");
    fireEvent.click(empty);
    fireEvent.click(failure);
    expect(onClick).toHaveBeenCalledWith("empty_reason", "EXPECTED_HOLIDAY");
    expect(onClick).toHaveBeenCalledWith("failure_pillar", "failed_cluster");
  });

  it("renders non-interactive spans when onBadgeClick is omitted", () => {
    render(<TypedReasonBadges emptyReasons={{ EXPECTED_HOLIDAY: 1 }} />);
    const empty = screen.getByTestId("typed-reason-badge-EXPECTED_HOLIDAY");
    expect(empty.tagName).toBe("SPAN");
  });

  it("renders an aria-label tooltip with key + description + count", () => {
    render(<TypedReasonBadges failurePillars={{ failed_lookahead_bias: 9 }} />);
    const pill = screen.getByTestId("typed-reason-badge-failed_lookahead_bias");
    const aria = pill.getAttribute("aria-label") ?? "";
    expect(aria).toContain("failed_lookahead_bias");
    expect(aria).toContain("LookaheadBiasError");
    expect(aria).toContain("9 shards");
  });

  it("singularises the shard count in tooltip when count is 1", () => {
    render(<TypedReasonBadges emptyReasons={{ EXPECTED_HOLIDAY: 1 }} />);
    const pill = screen.getByTestId("typed-reason-badge-EXPECTED_HOLIDAY");
    expect(pill.getAttribute("aria-label")).toContain("1 shard)");
  });

  it("ignores unrecognised keys (typed taxonomy is closed-set)", () => {
    render(
      <TypedReasonBadges
        emptyReasons={
          {
            EXPECTED_HOLIDAY: 1,
            NEWLY_INVENTED_REASON: 5,
          } as Record<string, number>
        }
        failurePillars={
          {
            failed_cluster: 2,
            failed_invented: 9,
          } as Record<string, number>
        }
      />,
    );
    expect(screen.getByTestId("typed-reason-badge-EXPECTED_HOLIDAY")).toBeTruthy();
    expect(screen.getByTestId("typed-reason-badge-failed_cluster")).toBeTruthy();
    expect(screen.queryByTestId("typed-reason-badge-NEWLY_INVENTED_REASON")).toBeNull();
    expect(screen.queryByTestId("typed-reason-badge-failed_invented")).toBeNull();
  });
});

describe("Typed-reason taxonomy SSOT (deployment-api parity)", () => {
  // IMPORTANT — what this describe block actually guards, and what it does NOT:
  //
  // Both fixtures below are a MANUALLY-SYNCED SNAPSHOT of deployment-api's
  // `_FAILURE_PILLAR_KEYS` / `EMPTY_REASON_KEYS`
  // (`services/data_status/coverage_metrics.py`), hand-copied here. This is NOT
  // a cross-repo check — deployment-ui's CI checks out this repo alone, so a
  // test here cannot read deployment-api's source file. A prior version of this
  // test named itself "matches deployment-api" while comparing the UI const
  // only to a second hardcoded copy in THIS SAME FILE — both copies drifted
  // together for months (~28 backend reasons went silently unrendered) and the
  // test stayed green throughout, because it was structurally incapable of
  // catching real backend drift. Fixed 2026-07-17 (coverage-exclusions
  // denominator study) by backfilling every missing key + meta entry to match
  // the CURRENT backend list, and re-labeling the guard honestly below.
  //
  // What this test DOES catch: a future PR that edits `EMPTY_REASON_KEYS` /
  // `FAILURE_PILLAR_KEYS` in `TypedReasonBadges.tsx` without updating this
  // fixture (or vice versa) — i.e. accidental same-repo drift. What it does
  // NOT catch: deployment-api adding/renaming a reason without a matching UI
  // PR. Real automated cross-repo parity requires a test with BOTH repos
  // checked out — that belongs in system-integration-tests, not here. Filed as
  // a follow-up: see the plan todo in
  // sports_manifest_canonicalisation_2026_06_01.md.
  const EXPECTED_FAILURE_PILLARS: readonly string[] = [
    "failed_timestamp_bias",
    "failed_malformed",
    "failed_cluster",
    "failed_lookahead_bias",
    "failed_nan_ratio",
    "failed_schema",
    "failed_empty_placeholder_backfill",
    "failed_missing_available_at",
    "failed_other",
  ];
  // Snapshot of deployment-api's EMPTY_REASON_KEYS (coverage_metrics.py:206-252)
  // as of unified-api-contracts' EmptyConfirmedReason enum, 2026-07-17. Order
  // does not matter (compared as a set below) — MEMBERSHIP is the invariant.
  const EXPECTED_EMPTY_REASONS: readonly string[] = [
    "EXPECTED_HOLIDAY",
    "EXPECTED_WEEKEND",
    "EXPECTED_PAUSED_LEAGUE",
    "EXPECTED_PRE_SOURCE_COVERAGE_START",
    "EXPECTED_PRE_GENESIS_CHAIN",
    "EXPECTED_CHAIN_AGGREGATE",
    "EXPECTED_PRE_VENUE_LAUNCH",
    "EXPECTED_INSTRUMENT_NOT_LISTED",
    "EXPECTED_INSTRUMENT_DELISTED",
    "EXPECTED_PARTIAL_HALF_DAY",
    "EXPECTED_OUTSIDE_TRADING_HOURS",
    "EXPECTED_OUTSIDE_TRANSFER_WINDOW",
    "EXPECTED_PRE_SEASON",
    "EXPECTED_POST_SEASON",
    "EXPECTED_SOURCE_DOES_NOT_COVER_LEAGUE",
    "EXPECTED_SOURCE_DOES_NOT_OFFER_DATA_TYPE",
    "EXPECTED_REFDATA_CADENCE_CHANGE",
    "EXPECTED_DEPRECATED_DATA_TYPE",
    "EXPECTED_KNOWN_SOURCE_GAP",
    // Bounded evidenced out-of-bounds range (UAC COVERAGE_EXCLUSIONS). OUT OF MODEL
    // (clipped from the coverage denominator) — so it MUST render as its own badge:
    // an out-of-model range that is invisible is indistinguishable from data we lost.
    "EXPECTED_UPSTREAM_OUT_OF_BOUNDS",
    "EXPECTED_UPSTREAM_EMPTY",
    "EXPECTED_OUT_OF_COVERAGE_WINDOW",
    "EXPECTED_FIXTURE_CANCELLED",
    "EXPECTED_FIXTURE_POSTPONED",
    "EXPECTED_NO_FIXTURE",
    "EXPECTED_NO_MAPPING",
    "EXPECTED_OUTSIDE_PROCESSING_SCOPE",
    "EXPECTED_LEGACY_MIGRATION_MISSING_EXPIRY",
    "EXPECTED_NO_FUNDING_RATE_TICKS",
    "EXPECTED_NO_PNL_STREAM",
    "EXPECTED_PROTOCOL_PAUSED",
    "EXPECTED_PAST_SOURCE_COVERAGE_END",
    "EXPECTED_SOURCE_DELIVERY_LAG",
    "EXPECTED_BOOKMAKER_NO_LEAGUE_COVERAGE",
    "EXPECTED_NO_PROVIDER_COVERAGE",
    "EXPECTED_NOT_ENOUGH_TVL",
    "EXPECTED_WRITE_GATE_NAN_THRESHOLD_EXCEEDED",
    "SOURCE_RETURNED_ZERO",
    "NO_INPUT_AVAILABLE",
    "LEG_ABSENT_LEFT",
    "LEG_ABSENT_RIGHT",
    "empty_unclassified",
  ];

  it("FAILURE_PILLAR_KEYS matches the pinned deployment-api snapshot", () => {
    expect([...FAILURE_PILLAR_KEYS].sort()).toEqual([...EXPECTED_FAILURE_PILLARS].sort());
  });

  it("EMPTY_REASON_KEYS matches the pinned deployment-api snapshot (manual sync, not cross-repo)", () => {
    expect([...EMPTY_REASON_KEYS].sort()).toEqual([...EXPECTED_EMPTY_REASONS].sort());
  });

  it("every failure pillar has a meta entry", () => {
    for (const k of FAILURE_PILLAR_KEYS) {
      const meta = failurePillarMeta(k);
      expect(meta.short.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.color).toContain("var(--color-");
    }
  });

  it("every empty reason has a meta entry", () => {
    for (const k of EMPTY_REASON_KEYS) {
      const meta = emptyReasonMeta(k);
      expect(meta.short.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.color).toContain("var(--color-");
    }
  });

  it("type guards reject unknown keys", () => {
    expect(isEmptyReasonKey("EXPECTED_HOLIDAY")).toBe(true);
    expect(isEmptyReasonKey("NOT_A_REAL_KEY")).toBe(false);
    expect(isFailurePillarKey("failed_cluster")).toBe(true);
    expect(isFailurePillarKey("failed_invented")).toBe(false);
  });
});
