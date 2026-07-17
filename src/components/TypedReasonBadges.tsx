/* =========================================================================
 * Typed-reason badges — writegate Phase 4.B
 * -------------------------------------------------------------------------
 * Surfaces the per-venue ``empty_reasons`` + ``failure_pillars`` rollups
 * from the data-status payload as colored pills next to the completion bar.
 * Both maps come from deployment-api (writegate Phase 4.A —
 * deployment-api@453836d + @7d57056). The closed-set taxonomies SSOT'd
 * here mirror the deployment-api keys exactly.
 *
 * Empty reasons (``empty_confirmed`` rows bucketed by ``error_reason``): the full
 * closed-set list is the ``EMPTY_REASON_KEYS`` array below (kept 1:1 with
 * deployment-api's ``EMPTY_REASON_KEYS`` in ``services/data_status/coverage_metrics.py``
 * — a "matches deployment-api" parity test lives in ``TypedReasonBadges.test.tsx``, but
 * it's a MANUALLY-SYNCED pinned snapshot, not a cross-repo check; see that file's
 * comment for why real automated parity belongs in system-integration-tests).
 * empty_unclassified is the legacy back-fill catch-all, not a UAC-declared reason.
 *
 * Failure pillars (``attempted_failed`` rows bucketed by typed-error class):
 *   failed_timestamp_bias / failed_malformed / failed_cluster /
 *   failed_lookahead_bias / failed_nan_ratio / failed_schema /
 *   failed_empty_placeholder_backfill / failed_missing_available_at /
 *   failed_other.
 *
 * Visual rule: each registered key gets a stable color + short label.
 * Any non-zero count renders a pill; zero-count keys are suppressed so the
 * badge row stays scannable. Pills are intentionally compact — the full
 * grid lives in the drill-down (FailurePillarStack + per-empty-reason
 * accordion, Phase 4.B.2). ``failed_other`` and ``empty_unclassified``
 * use neutral grey to keep the pure typed reasons visually dominant.
 * ========================================================================= */

import type { ReactElement } from "react";

// ---- Closed taxonomy: empty_reasons (UAC EMPTY_CONFIRMED_REASONS + catch-all) ----

export const EMPTY_REASON_KEYS = [
  "EXPECTED_HOLIDAY",
  "EXPECTED_WEEKEND",
  "EXPECTED_PAUSED_LEAGUE",
  "EXPECTED_PRE_SOURCE_COVERAGE_START",
  "EXPECTED_PAST_SOURCE_COVERAGE_END",
  "EXPECTED_SOURCE_DELIVERY_LAG",
  "EXPECTED_PRE_GENESIS_CHAIN",
  "EXPECTED_PRE_VENUE_LAUNCH",
  "EXPECTED_INSTRUMENT_NOT_LISTED",
  "EXPECTED_INSTRUMENT_DELISTED",
  "EXPECTED_NOT_ENOUGH_TVL",
  "EXPECTED_PARTIAL_HALF_DAY",
  "EXPECTED_OUTSIDE_TRADING_HOURS",
  "EXPECTED_OUTSIDE_TRANSFER_WINDOW",
  "EXPECTED_PRE_SEASON",
  "EXPECTED_POST_SEASON",
  "EXPECTED_SOURCE_DOES_NOT_COVER_LEAGUE",
  "EXPECTED_SOURCE_DOES_NOT_OFFER_DATA_TYPE",
  "EXPECTED_CHAIN_AGGREGATE",
  "EXPECTED_BOOKMAKER_NO_LEAGUE_COVERAGE",
  "EXPECTED_NO_PROVIDER_COVERAGE",
  "EXPECTED_OUT_OF_COVERAGE_WINDOW",
  "EXPECTED_DEPRECATED_DATA_TYPE",
  "EXPECTED_REFDATA_CADENCE_CHANGE",
  "EXPECTED_KNOWN_SOURCE_GAP",
  "EXPECTED_PROTOCOL_PAUSED",
  "EXPECTED_UPSTREAM_OUT_OF_BOUNDS",
  "EXPECTED_OUTSIDE_PROCESSING_SCOPE",
  "EXPECTED_UPSTREAM_EMPTY",
  "EXPECTED_FIXTURE_POSTPONED",
  "EXPECTED_FIXTURE_CANCELLED",
  "EXPECTED_NO_FIXTURE",
  "EXPECTED_NO_MAPPING",
  "EXPECTED_LEGACY_MIGRATION_MISSING_EXPIRY",
  "EXPECTED_NO_FUNDING_RATE_TICKS",
  "EXPECTED_NO_PNL_STREAM",
  "EXPECTED_WRITE_GATE_NAN_THRESHOLD_EXCEEDED",
  "SOURCE_RETURNED_ZERO",
  "NO_INPUT_AVAILABLE",
  "LEG_ABSENT_LEFT",
  "LEG_ABSENT_RIGHT",
  "empty_unclassified",
] as const;

export type EmptyReasonKey = (typeof EMPTY_REASON_KEYS)[number];

interface EmptyReasonMeta {
  short: string;
  description: string;
  color: string; // CSS variable token consumed by the color attribute
}

const EMPTY_REASON_META: Record<EmptyReasonKey, EmptyReasonMeta> = {
  EXPECTED_HOLIDAY: {
    short: "holiday",
    description: "Calendar pre-skip — venue closed for an exchange holiday",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_WEEKEND: {
    short: "weekend",
    description: "Calendar pre-skip — venue does not trade on weekends",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_PAUSED_LEAGUE: {
    short: "paused-league",
    description: "Sports source paused league for this date window (UAC KNOWN_COVERAGE_GAPS)",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_UPSTREAM_OUT_OF_BOUNDS: {
    short: "out-of-bounds",
    description:
      "Evidenced bounded range that was never capturable — OUT OF MODEL (excluded from the coverage denominator, not a gap). UAC COVERAGE_EXCLUSIONS; every range carries a probe + is continuously falsified",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_PRE_SOURCE_COVERAGE_START: {
    short: "pre-source-start",
    description: "Date predates the source's earliest covered day (UAC SOURCE_COVERAGE_START)",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_PAST_SOURCE_COVERAGE_END: {
    short: "past-source-end",
    description: "Date is after the archive's documented coverage end (sister of pre-source-start)",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_SOURCE_DELIVERY_LAG: {
    short: "delivery-lag",
    description:
      "TradFi source returned 0 rows for an in-window day near the live edge — temporary ingest lag, expected to backfill",
    color: "var(--color-accent-amber)",
  },
  EXPECTED_PRE_GENESIS_CHAIN: {
    short: "pre-genesis",
    description: "Date predates the chain's genesis block",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_PRE_VENUE_LAUNCH: {
    short: "pre-launch",
    description: "Date predates the venue's launch date (UAC *_LAUNCH_DATES)",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_INSTRUMENT_NOT_LISTED: {
    short: "not-listed",
    description: "Instrument was not yet listed on the venue at this date",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_INSTRUMENT_DELISTED: {
    short: "delisted",
    description: "Instrument was already delisted at this date",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_NOT_ENOUGH_TVL: {
    short: "sub-tvl",
    description: "DeFi pool/market exists on-chain but its TVL is below the MVP capture threshold",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_PARTIAL_HALF_DAY: {
    short: "half-day",
    description: "Venue partial-session day (early close / late open)",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_OUTSIDE_TRADING_HOURS: {
    short: "outside-hours",
    description: "Intra-day shard falls outside the venue's published trading-session hours",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_OUTSIDE_TRANSFER_WINDOW: {
    short: "outside-transfer",
    description: "Sports transfer-records date is outside the country's published transfer registration window",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_PRE_SEASON: {
    short: "pre-season",
    description: "Sports shard date precedes the league season's published kick-off date",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_POST_SEASON: {
    short: "post-season",
    description: "Sports shard date is after the season's documented final fixture (pair of pre-season)",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_SOURCE_DOES_NOT_COVER_LEAGUE: {
    short: "no-league-coverage",
    description: "The source legitimately doesn't cover this league/season pair (e.g. Understat's fixed whitelist)",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_SOURCE_DOES_NOT_OFFER_DATA_TYPE: {
    short: "no-data-type",
    description: "The venue's batch source structurally has no historical endpoint for this data type, ever",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_CHAIN_AGGREGATE: {
    short: "chain-aggregate",
    description: "TradFi chain-level aggregate catalogue row (blank instrument_id) — no downloadable bar data exists",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_BOOKMAKER_NO_LEAGUE_COVERAGE: {
    short: "no-bookmaker-coverage",
    description: "An Odds-API bookmaker's observed corpus shows it has never priced this league",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_NO_PROVIDER_COVERAGE: {
    short: "no-provider-coverage",
    description: "API-Football's observed corpus shows this (league, enrichment entity) pair has never produced a row",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_OUT_OF_COVERAGE_WINDOW: {
    short: "out-of-scope-window",
    description: "Data type still valid + restorable, but currently out of the operator-acked MVP coverage scope",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_DEPRECATED_DATA_TYPE: {
    short: "deprecated",
    description: "Data type was deprecated for this venue at this date",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_REFDATA_CADENCE_CHANGE: {
    short: "refdata-cadence",
    description: "Reference-data cadence change explains the absence",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_KNOWN_SOURCE_GAP: {
    short: "known-gap",
    description: "Documented mid-history source gap that doesn't fit the launch/coverage-start/genesis primitives",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_PROTOCOL_PAUSED: {
    short: "protocol-paused",
    description: "DeFi protocol pause window (migration, wind-down, chain-level outage) with a known resume date",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_OUTSIDE_PROCESSING_SCOPE: {
    short: "outside-scope",
    description: "Instrument exists in the catalog but isn't in the downstream service's MVP subscription list",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_UPSTREAM_EMPTY: {
    short: "upstream-empty",
    description: "Downstream service skipped this shard because the upstream manifest was already empty/unattempted",
    color: "var(--color-accent-amber)",
  },
  EXPECTED_FIXTURE_POSTPONED: {
    short: "postponed",
    description: "Sports fixture postponed before kickoff with no rescheduled date in the current pipeline window",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_FIXTURE_CANCELLED: {
    short: "cancelled",
    description: "Sports fixture was cancelled outright (no reschedule)",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_NO_FIXTURE: {
    short: "no-fixture",
    description: "No fixture scheduled for this (league, day) per the canonical fixtures manifest",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_NO_MAPPING: {
    short: "no-mapping",
    description: "Canonical entity exists but the source-specific provider mapping to fetch it is absent",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_LEGACY_MIGRATION_MISSING_EXPIRY: {
    short: "missing-expiry",
    description: "Pre-2026-05-13 tradfi futures/options row lacks expiration and couldn't be back-filled at migration",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_NO_FUNDING_RATE_TICKS: {
    short: "no-funding-ticks",
    description: "Perp funding-rate parquet exists for this (venue, symbol, day) but every funding_rate row is null",
    color: "var(--color-accent-amber)",
  },
  EXPECTED_NO_PNL_STREAM: {
    short: "no-pnl-stream",
    description: "No upstream strategy PnL stream event for this date + archetype (strategy not yet running)",
    color: "var(--color-accent-amber)",
  },
  EXPECTED_WRITE_GATE_NAN_THRESHOLD_EXCEEDED: {
    short: "nan-threshold",
    description: "Feature computation ran but the result exceeded the write-gate's NaN threshold — write rejected",
    color: "var(--color-accent-amber)",
  },
  SOURCE_RETURNED_ZERO: {
    short: "source-zero",
    description: "Source replied 200 with zero rows — honest absence (live-tradeable but illiquid)",
    color: "var(--color-accent-yellow)",
  },
  NO_INPUT_AVAILABLE: {
    short: "no-input",
    description: "Downstream compute skipped because an upstream input had attempted_failed status, not honest-empty",
    color: "var(--color-accent-red)",
  },
  LEG_ABSENT_LEFT: {
    short: "leg-absent-left",
    description: "Cross-instrument paired calc: the LEFT leg was empty_confirmed for this date",
    color: "var(--color-accent-amber)",
  },
  LEG_ABSENT_RIGHT: {
    short: "leg-absent-right",
    description:
      "Cross-instrument paired calc: the RIGHT leg was empty_confirmed for this date (pair of leg-absent-left)",
    color: "var(--color-accent-amber)",
  },
  empty_unclassified: {
    short: "unclassified",
    description: "Legacy null-reason rows pending Tier 3D.1 reconciler back-fill",
    color: "var(--color-text-muted)",
  },
};

// ---- Closed taxonomy: failure_pillars (typed-error class prefixes) ----

export const FAILURE_PILLAR_KEYS = [
  "failed_timestamp_bias",
  "failed_malformed",
  "failed_cluster",
  "failed_lookahead_bias",
  "failed_nan_ratio",
  "failed_schema",
  "failed_empty_placeholder_backfill",
  "failed_missing_available_at",
  "failed_other",
] as const;

export type FailurePillarKey = (typeof FAILURE_PILLAR_KEYS)[number];

interface FailurePillarMeta {
  short: string;
  description: string;
  color: string;
}

const FAILURE_PILLAR_META: Record<FailurePillarKey, FailurePillarMeta> = {
  failed_timestamp_bias: {
    short: "timestamp-bias",
    description: "UpstreamTimestampBiasError — source ticks fell outside requested day after interval_idx filter",
    color: "var(--color-accent-red)",
  },
  failed_malformed: {
    short: "malformed",
    description: "MalformedTickFieldError — source returned ticks but downstream calc dropped all rows",
    color: "var(--color-accent-red)",
  },
  failed_cluster: {
    short: "cluster",
    description: "ClusterCoverageError / MissingClusterValidationError — bundled shard missing required clusters",
    color: "var(--color-accent-orange)",
  },
  failed_lookahead_bias: {
    short: "lookahead",
    description: "LookaheadBiasError — feature compute consumed a row whose available_at violated the horizon",
    color: "var(--color-accent-red)",
  },
  failed_nan_ratio: {
    short: "nan-ratio",
    description: "NaN-ratio gate failure (placeholder pillar — class lands in writegate Phase 1A.future)",
    color: "var(--color-accent-orange)",
  },
  failed_schema: {
    short: "schema",
    description: "SchemaMismatchError — parquet schema violated UAC contract (placeholder pillar)",
    color: "var(--color-accent-orange)",
  },
  failed_empty_placeholder_backfill: {
    short: "placeholder-backfill",
    description: "EmptyPlaceholderBugBackfill — reconciler flagged 1440-NaN historical row for re-attempt",
    color: "var(--color-accent-orange)",
  },
  failed_missing_available_at: {
    short: "missing-available-at",
    description: "MissingAvailableAt — write-time guard caught a row missing its available_at column",
    color: "var(--color-accent-red)",
  },
  failed_other: {
    short: "other",
    description: "Unrecognised typed-error class — surface to ensure new failure modes don't disappear silently",
    color: "var(--color-text-muted)",
  },
};

// ---- Helpers exposed for tests + per-pillar consumers ----

export function emptyReasonMeta(key: EmptyReasonKey): EmptyReasonMeta {
  return EMPTY_REASON_META[key];
}

export function failurePillarMeta(key: FailurePillarKey): FailurePillarMeta {
  return FAILURE_PILLAR_META[key];
}

export function isEmptyReasonKey(value: string): value is EmptyReasonKey {
  return (EMPTY_REASON_KEYS as readonly string[]).includes(value);
}

export function isFailurePillarKey(value: string): value is FailurePillarKey {
  return (FAILURE_PILLAR_KEYS as readonly string[]).includes(value);
}

// ---- Component ----

export interface TypedReasonBadgesProps {
  emptyReasons?: Record<string, number>;
  failurePillars?: Record<string, number>;
  /** Optional click-through — fires (kind, key) when a badge is clicked. */
  onBadgeClick?: (kind: "empty_reason" | "failure_pillar", key: string) => void;
  /** Test scope — disambiguates multiple instances on the same row. */
  testIdPrefix?: string;
}

interface BadgePill {
  kind: "empty_reason" | "failure_pillar";
  key: string;
  label: string;
  count: number;
  color: string;
  description: string;
}

function collectPills(
  emptyReasons: Record<string, number> | undefined,
  failurePillars: Record<string, number> | undefined,
): BadgePill[] {
  const pills: BadgePill[] = [];
  // Failure pillars first — typed errors are higher-priority signal than
  // honest-empty reasons; rendering them leftmost mirrors that priority.
  for (const key of FAILURE_PILLAR_KEYS) {
    const count = failurePillars?.[key] ?? 0;
    if (count <= 0) continue;
    const meta = FAILURE_PILLAR_META[key];
    pills.push({
      kind: "failure_pillar",
      key,
      label: meta.short,
      count,
      color: meta.color,
      description: meta.description,
    });
  }
  for (const key of EMPTY_REASON_KEYS) {
    const count = emptyReasons?.[key] ?? 0;
    if (count <= 0) continue;
    const meta = EMPTY_REASON_META[key];
    pills.push({
      kind: "empty_reason",
      key,
      label: meta.short,
      count,
      color: meta.color,
      description: meta.description,
    });
  }
  return pills;
}

export function TypedReasonBadges({
  emptyReasons,
  failurePillars,
  onBadgeClick,
  testIdPrefix,
}: TypedReasonBadgesProps): ReactElement | null {
  const pills = collectPills(emptyReasons, failurePillars);
  if (pills.length === 0) return null;

  const prefix = testIdPrefix ? `${testIdPrefix}-` : "";

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={`${prefix}typed-reason-badges`}>
      {pills.map((pill) => {
        const tooltip = `${pill.key}: ${pill.description} (${pill.count} shard${pill.count === 1 ? "" : "s"})`;
        const testId = `${prefix}typed-reason-badge-${pill.key}`;
        const interactive = Boolean(onBadgeClick);
        const className =
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono leading-none whitespace-nowrap " +
          (interactive ? "cursor-pointer hover:bg-[var(--color-bg-hover)] " : "");
        const style = {
          borderColor: pill.color,
          color: pill.color,
        };
        if (interactive) {
          return (
            <button
              key={`${pill.kind}:${pill.key}`}
              type="button"
              data-testid={testId}
              data-badge-kind={pill.kind}
              data-badge-key={pill.key}
              data-badge-count={pill.count}
              title={tooltip}
              aria-label={tooltip}
              className={className}
              style={style}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBadgeClick?.(pill.kind, pill.key);
              }}
            >
              <span>{pill.label}</span>
              <span className="opacity-80">{pill.count}</span>
            </button>
          );
        }
        return (
          <span
            key={`${pill.kind}:${pill.key}`}
            data-testid={testId}
            data-badge-kind={pill.kind}
            data-badge-key={pill.key}
            data-badge-count={pill.count}
            title={tooltip}
            aria-label={tooltip}
            className={className}
            style={style}
          >
            <span>{pill.label}</span>
            <span className="opacity-80">{pill.count}</span>
          </span>
        );
      })}
    </div>
  );
}
