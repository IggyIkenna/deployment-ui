// FeatureFamilyBreakdown — Phase 8B of features_repo_consolidation_2026_05_08.plan
// (deployment-ui half).
//
// Renders feature_family as a first-class drilldown axis ABOVE feature_group
// in the data-status tab. For features-service shards (feature_family
// populated on manifest rows per UAC `FEATURE_GROUP_TO_FAMILY`), groups the
// feature_groups under their owning family. Non-features rows render `n/a`
// in the feature_family slot — this component simply doesn't mount for them
// (parent guards on `feature_families` map presence OR derives the grouping
// client-side via `groupFeatureGroupsByFamily`).
//
// The 8 feature_family values mirror the closed-set UAC `FeatureFamily`
// enum:
//   calendar / commodity / cross_instrument / delta_one /
//   multi_timeframe / onchain / sports / volatility
//
// Companion: `feature_family` filter param on getDataStatusManifest /
// fetchShardSchema / fetchLeafParquetStats so the UI can slice by family.

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import {
  type FeatureFamily,
  FEATURE_FAMILIES,
  type TurboFeatureFamilyStatus,
  type TurboFeatureGroupStatus,
  isFeatureFamily,
} from "../api/client";

// Color helper mirrors the cells used elsewhere in DataStatusTab — kept
// inline so the component is self-contained for tests.
function getCompletionColor(pct: number): string {
  if (pct >= 99) return "var(--color-accent-green)";
  if (pct >= 80) return "var(--color-accent-yellow)";
  if (pct >= 50) return "var(--color-accent-amber)";
  return "var(--color-accent-red)";
}

// Group a flat feature_groups map by feature_family using the embedded
// `feature_group.feature_family` axis. Falls back to an `__unknown__`
// bucket when a row has no feature_family set (pre-Phase-8B manifest
// rows OR non-features rows that somehow land here). Stable iteration
// order: UAC-declared FEATURE_FAMILIES first, then `__unknown__`.
//
// Used by parents that have `feature_groups` but not the rolled-up
// `feature_families` map from deployment-api — Phase 8B-api may omit
// the rollup on legacy code paths; this keeps the UI rendering the
// new axis even before the API rolls it up server-side.
export function groupFeatureGroupsByFamily(
  feature_groups: Record<string, TurboFeatureGroupStatus>,
): Record<FeatureFamily | "__unknown__", TurboFeatureFamilyStatus> {
  const result: Partial<Record<FeatureFamily | "__unknown__", TurboFeatureFamilyStatus>> = {};

  // Initialise empty rollups for every UAC family + the unknown bucket;
  // empty entries get filtered out at render time.
  for (const family of FEATURE_FAMILIES) {
    result[family] = {
      dates_found: 0,
      dates_expected: 0,
      completion_pct: 0,
      feature_groups: {},
    };
  }
  result.__unknown__ = {
    dates_found: 0,
    dates_expected: 0,
    completion_pct: 0,
    feature_groups: {},
  };

  for (const [fgName, fgData] of Object.entries(feature_groups)) {
    const family =
      fgData.feature_family && isFeatureFamily(fgData.feature_family)
        ? fgData.feature_family
        : "__unknown__";
    const bucket = result[family];
    if (!bucket) continue; // unreachable; satisfies TS narrowing
    bucket.feature_groups[fgName] = fgData;
    bucket.dates_found += fgData.dates_found;
    bucket.dates_expected += fgData.dates_expected;
  }

  // Recompute completion_pct per bucket from rolled-up sums.
  for (const family of [...FEATURE_FAMILIES, "__unknown__" as const]) {
    const bucket = result[family];
    if (!bucket) continue;
    bucket.completion_pct =
      bucket.dates_expected > 0
        ? (bucket.dates_found / bucket.dates_expected) * 100
        : 0;
  }

  // Strip empty buckets so the parent doesn't render blank rows.
  const filtered: Record<FeatureFamily | "__unknown__", TurboFeatureFamilyStatus> =
    {} as Record<FeatureFamily | "__unknown__", TurboFeatureFamilyStatus>;
  for (const family of [...FEATURE_FAMILIES, "__unknown__" as const]) {
    const bucket = result[family];
    if (bucket && Object.keys(bucket.feature_groups).length > 0) {
      filtered[family] = bucket;
    }
  }
  return filtered;
}

export interface FeatureFamilyBreakdownProps {
  feature_families: Record<string, TurboFeatureFamilyStatus>;
  /**
   * Optional click handler invoked when an operator clicks a feature_family
   * header — parent typically uses this to set a filter for downstream
   * fetches (manifest / leaf-stats / schema) by feature_family. Omit to
   * render as a read-only drill-down with no parent-state interaction.
   */
  onFamilyClick?: (family: string) => void;
  /**
   * Optional click handler invoked when an operator clicks a leaf
   * feature_group inside a family. Mirrors the existing feature_group
   * click surface so parents can wire LeafSchemaModal mounting.
   */
  onFeatureGroupClick?: (family: string, feature_group: string) => void;
}

export function FeatureFamilyBreakdown({
  feature_families,
  onFamilyClick,
  onFeatureGroupClick,
}: FeatureFamilyBreakdownProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const familyEntries = Object.entries(feature_families).sort((a, b) => {
    // Stable sort: UAC families first in declared order, unknown last.
    const aIdx = FEATURE_FAMILIES.indexOf(a[0] as FeatureFamily);
    const bIdx = FEATURE_FAMILIES.indexOf(b[0] as FeatureFamily);
    if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  if (familyEntries.length === 0) {
    return (
      <div
        data-testid="feature-family-empty"
        className="text-xs text-[var(--color-text-muted)] px-3 py-2"
      >
        No feature_family data — rows lack populated feature_family axis.
      </div>
    );
  }

  return (
    <div
      className="bg-[var(--color-bg-secondary)] px-4 py-3 border-t border-[var(--color-border-subtle)]"
      data-testid="feature-family-breakdown"
    >
      <div className="text-xs text-[var(--color-text-muted)] mb-2 font-semibold uppercase tracking-wide">
        Feature Families
      </div>
      <div className="grid gap-2">
        {familyEntries.map(([familyName, familyData]) => {
          const isExpanded = expanded.has(familyName);
          const familyComplete = familyData.completion_pct >= 99;
          const featureGroups = familyData.feature_groups || {};
          const hasNestedGroups = Object.keys(featureGroups).length > 0;

          return (
            <div
              key={familyName}
              data-testid={`feature-family-row-${familyName}`}
              className="bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-subtle)]"
            >
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-bg-hover)] cursor-pointer"
                onClick={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(familyName)) {
                      next.delete(familyName);
                    } else {
                      next.add(familyName);
                    }
                    return next;
                  });
                  onFamilyClick?.(familyName);
                }}
                data-testid={`feature-family-toggle-${familyName}`}
              >
                <div className="flex items-center gap-2">
                  {hasNestedGroups ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                    )
                  ) : (
                    <span className="w-4 h-4" />
                  )}
                  {familyComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
                  ) : (
                    <XCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                  )}
                  <span className="font-mono text-sm font-semibold">
                    {familyName}
                  </span>
                  {familyName === "__unknown__" && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] font-mono">
                      legacy / unstamped
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-medium"
                    style={{ color: getCompletionColor(familyData.completion_pct) }}
                  >
                    {familyData.completion_pct.toFixed(0)}%
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] font-mono">
                    {familyData.dates_found}/{familyData.dates_expected}
                  </span>
                </div>
              </button>

              {isExpanded && hasNestedGroups && (
                <div
                  className="px-3 py-2 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]"
                  data-testid={`feature-family-children-${familyName}`}
                >
                  <div className="grid gap-1.5">
                    {Object.entries(featureGroups).map(([fgName, fgData]) => {
                      const fgComplete = fgData.completion_pct >= 99;
                      return (
                        <button
                          type="button"
                          key={fgName}
                          className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-bg-primary)] rounded border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-hover)] text-left"
                          onClick={() => onFeatureGroupClick?.(familyName, fgName)}
                          data-testid={`feature-group-row-${familyName}-${fgName}`}
                        >
                          <div className="flex items-center gap-2">
                            {fgComplete ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent-green)]" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-[var(--color-accent-red)]" />
                            )}
                            <span className="font-mono text-xs">{fgName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: getCompletionColor(fgData.completion_pct),
                              }}
                            >
                              {fgData.completion_pct.toFixed(0)}%
                            </span>
                            <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                              {fgData.dates_found}/{fgData.dates_expected}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FeatureFamilyBreakdown;
