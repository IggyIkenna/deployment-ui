/* =========================================================================
 * Typed-reason badges — writegate Phase 4.B
 * -------------------------------------------------------------------------
 * Surfaces the per-venue ``empty_reasons`` + ``failure_pillars`` rollups
 * from the data-status payload as colored pills next to the completion bar.
 * Both maps come from deployment-api (writegate Phase 4.A —
 * deployment-api@453836d + @7d57056). The closed-set taxonomies SSOT'd
 * here mirror the deployment-api keys exactly.
 *
 * Empty reasons (``empty_confirmed`` rows bucketed by ``error_reason``):
 *   EXPECTED_HOLIDAY / EXPECTED_WEEKEND / EXPECTED_PAUSED_LEAGUE /
 *   EXPECTED_PRE_SOURCE_COVERAGE_START / EXPECTED_PRE_GENESIS_CHAIN /
 *   EXPECTED_PRE_VENUE_LAUNCH / EXPECTED_INSTRUMENT_NOT_LISTED /
 *   EXPECTED_INSTRUMENT_DELISTED / EXPECTED_PARTIAL_HALF_DAY /
 *   EXPECTED_REFDATA_CADENCE_CHANGE / EXPECTED_DEPRECATED_DATA_TYPE /
 *   SOURCE_RETURNED_ZERO / empty_unclassified (legacy back-fill catch-all).
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
  "EXPECTED_PRE_GENESIS_CHAIN",
  "EXPECTED_PRE_VENUE_LAUNCH",
  "EXPECTED_INSTRUMENT_NOT_LISTED",
  "EXPECTED_INSTRUMENT_DELISTED",
  "EXPECTED_PARTIAL_HALF_DAY",
  "EXPECTED_REFDATA_CADENCE_CHANGE",
  "EXPECTED_DEPRECATED_DATA_TYPE",
  "SOURCE_RETURNED_ZERO",
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
    description:
      "Sports source paused league for this date window (UAC KNOWN_COVERAGE_GAPS)",
    color: "var(--color-accent-purple)",
  },
  EXPECTED_PRE_SOURCE_COVERAGE_START: {
    short: "pre-source-start",
    description:
      "Date predates the source's earliest covered day (UAC SOURCE_COVERAGE_START)",
    color: "var(--color-accent-cyan)",
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
  EXPECTED_PARTIAL_HALF_DAY: {
    short: "half-day",
    description: "Venue partial-session day (early close / late open)",
    color: "var(--color-accent-blue)",
  },
  EXPECTED_REFDATA_CADENCE_CHANGE: {
    short: "refdata-cadence",
    description: "Reference-data cadence change explains the absence",
    color: "var(--color-accent-cyan)",
  },
  EXPECTED_DEPRECATED_DATA_TYPE: {
    short: "deprecated",
    description: "Data type was deprecated for this venue at this date",
    color: "var(--color-accent-cyan)",
  },
  SOURCE_RETURNED_ZERO: {
    short: "source-zero",
    description:
      "Source replied 200 with zero rows — honest absence (live-tradeable but illiquid)",
    color: "var(--color-accent-yellow)",
  },
  empty_unclassified: {
    short: "unclassified",
    description:
      "Legacy null-reason rows pending Tier 3D.1 reconciler back-fill",
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
    description:
      "UpstreamTimestampBiasError — source ticks fell outside requested day after interval_idx filter",
    color: "var(--color-accent-red)",
  },
  failed_malformed: {
    short: "malformed",
    description:
      "MalformedTickFieldError — source returned ticks but downstream calc dropped all rows",
    color: "var(--color-accent-red)",
  },
  failed_cluster: {
    short: "cluster",
    description:
      "ClusterCoverageError / MissingClusterValidationError — bundled shard missing required clusters",
    color: "var(--color-accent-orange)",
  },
  failed_lookahead_bias: {
    short: "lookahead",
    description:
      "LookaheadBiasError — feature compute consumed a row whose available_at violated the horizon",
    color: "var(--color-accent-red)",
  },
  failed_nan_ratio: {
    short: "nan-ratio",
    description:
      "NaN-ratio gate failure (placeholder pillar — class lands in writegate Phase 1A.future)",
    color: "var(--color-accent-orange)",
  },
  failed_schema: {
    short: "schema",
    description:
      "SchemaMismatchError — parquet schema violated UAC contract (placeholder pillar)",
    color: "var(--color-accent-orange)",
  },
  failed_empty_placeholder_backfill: {
    short: "placeholder-backfill",
    description:
      "EmptyPlaceholderBugBackfill — reconciler flagged 1440-NaN historical row for re-attempt",
    color: "var(--color-accent-orange)",
  },
  failed_missing_available_at: {
    short: "missing-available-at",
    description:
      "MissingAvailableAt — write-time guard caught a row missing its available_at column",
    color: "var(--color-accent-red)",
  },
  failed_other: {
    short: "other",
    description:
      "Unrecognised typed-error class — surface to ensure new failure modes don't disappear silently",
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
  onBadgeClick?: (
    kind: "empty_reason" | "failure_pillar",
    key: string,
  ) => void;
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
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid={`${prefix}typed-reason-badges`}
    >
      {pills.map((pill) => {
        const tooltip = `${pill.key}: ${pill.description} (${pill.count} shard${pill.count === 1 ? "" : "s"})`;
        const testId = `${prefix}typed-reason-badge-${pill.key}`;
        const interactive = Boolean(onBadgeClick);
        const className =
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono leading-none whitespace-nowrap " +
          (interactive
            ? "cursor-pointer hover:bg-[var(--color-bg-hover)] "
            : "");
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
