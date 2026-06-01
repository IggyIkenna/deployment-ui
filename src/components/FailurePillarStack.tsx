/* =========================================================================
 * Failure-pillar stacked bar — writegate Phase 4.B.2
 * -------------------------------------------------------------------------
 * Renders the per-venue ``failure_pillars`` rollup (typed-error class
 * counts) as a horizontal stacked bar with each pillar contributing a
 * proportional segment in its registered color. Companion to
 * ``TypedReasonBadges`` (Phase 4.B.1) — the badges show non-zero pills
 * inline on the row, this stack gives the operator a single-glance ratio
 * across all attempted_failed shards on the venue.
 *
 * Same closed taxonomy as ``TypedReasonBadges``: pillars come from
 * deployment-api ``_FAILURE_PILLAR_KEYS``. Zero-count pillars contribute
 * nothing visually but stay structurally so future non-zero rows render
 * deterministically (no layout shifts when a pillar fires for the first
 * time).
 * ========================================================================= */

import type { ReactElement } from "react";
import {
  FAILURE_PILLAR_KEYS,
  failurePillarMeta,
  type FailurePillarKey,
} from "./TypedReasonBadges";

export interface FailurePillarStackProps {
  failurePillars?: Record<string, number>;
  /** Total pixel width of the bar (Tailwind unit class consumed via inline style). */
  widthPx?: number;
  /** Pixel height of the bar. */
  heightPx?: number;
  testIdPrefix?: string;
  /** Optional click — fires (pillar) when a segment is clicked. */
  onSegmentClick?: (pillar: FailurePillarKey) => void;
}

interface Segment {
  key: FailurePillarKey;
  count: number;
  pct: number;
  color: string;
  description: string;
}

function buildSegments(failurePillars: Record<string, number> | undefined): {
  total: number;
  segments: Segment[];
} {
  let total = 0;
  for (const key of FAILURE_PILLAR_KEYS) {
    total += failurePillars?.[key] ?? 0;
  }
  if (total === 0) return { total: 0, segments: [] };
  const segments: Segment[] = [];
  for (const key of FAILURE_PILLAR_KEYS) {
    const count = failurePillars?.[key] ?? 0;
    if (count <= 0) continue;
    const meta = failurePillarMeta(key);
    segments.push({
      key,
      count,
      pct: (count / total) * 100,
      color: meta.color,
      description: meta.description,
    });
  }
  return { total, segments };
}

export function FailurePillarStack({
  failurePillars,
  widthPx = 96,
  heightPx = 6,
  testIdPrefix,
  onSegmentClick,
}: FailurePillarStackProps): ReactElement | null {
  const { total, segments } = buildSegments(failurePillars);
  if (total === 0) return null;
  const prefix = testIdPrefix ? `${testIdPrefix}-` : "";
  const interactive = Boolean(onSegmentClick);

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full border border-[var(--color-border-subtle)]"
      data-testid={`${prefix}failure-pillar-stack`}
      data-failure-total={total}
      style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
      title={`${total} attempted_failed shard${total === 1 ? "" : "s"} — hover segments for details`}
    >
      {segments.map((seg) => {
        const tooltip = `${seg.key}: ${seg.description} (${seg.count} shard${seg.count === 1 ? "" : "s"}, ${seg.pct.toFixed(1)}%)`;
        const className =
          "h-full transition-opacity " +
          (interactive ? "cursor-pointer hover:opacity-80" : "");
        const style = {
          width: `${seg.pct}%`,
          backgroundColor: seg.color,
        };
        if (interactive) {
          return (
            <button
              key={seg.key}
              type="button"
              data-testid={`${prefix}failure-pillar-segment-${seg.key}`}
              data-pillar-key={seg.key}
              data-pillar-count={seg.count}
              title={tooltip}
              aria-label={tooltip}
              className={className}
              style={style}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSegmentClick?.(seg.key);
              }}
            />
          );
        }
        return (
          <span
            key={seg.key}
            data-testid={`${prefix}failure-pillar-segment-${seg.key}`}
            data-pillar-key={seg.key}
            data-pillar-count={seg.count}
            title={tooltip}
            aria-label={tooltip}
            className={className}
            style={style}
          />
        );
      })}
    </div>
  );
}
