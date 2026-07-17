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
  // Closed-set guard against drift from deployment-api
  // _FAILURE_PILLAR_KEYS + _EMPTY_REASON_KEYS. If deployment-api adds a
  // new key, this test fails until the UI taxonomy is updated.
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
  const EXPECTED_EMPTY_REASONS: readonly string[] = [
    "EXPECTED_HOLIDAY",
    "EXPECTED_WEEKEND",
    "EXPECTED_PAUSED_LEAGUE",
    "EXPECTED_PRE_SOURCE_COVERAGE_START",
    "EXPECTED_PRE_GENESIS_CHAIN",
    "EXPECTED_PRE_VENUE_LAUNCH",
    "EXPECTED_INSTRUMENT_NOT_LISTED",
    "EXPECTED_INSTRUMENT_DELISTED",
    "EXPECTED_PARTIAL_HALF_DAY",
    "EXPECTED_REFDATA_CADENCE_CHANGE",
    "EXPECTED_DEPRECATED_DATA_TYPE",
    // Bounded evidenced out-of-bounds range (UAC COVERAGE_EXCLUSIONS). OUT OF MODEL
    // (clipped from the coverage denominator) — so it MUST render as its own badge:
    // an out-of-model range that is invisible is indistinguishable from data we lost.
    "EXPECTED_UPSTREAM_OUT_OF_BOUNDS",
    "SOURCE_RETURNED_ZERO",
    "empty_unclassified",
  ];

  it("FAILURE_PILLAR_KEYS matches deployment-api _FAILURE_PILLAR_KEYS", () => {
    expect([...FAILURE_PILLAR_KEYS]).toEqual([...EXPECTED_FAILURE_PILLARS]);
  });

  it("EMPTY_REASON_KEYS matches deployment-api _EMPTY_REASON_KEYS", () => {
    expect([...EMPTY_REASON_KEYS]).toEqual([...EXPECTED_EMPTY_REASONS]);
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
