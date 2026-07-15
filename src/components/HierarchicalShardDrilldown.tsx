/**
 * Hierarchical shard-atom drill-down — drilldown plan Phase 2.
 *
 * Replaces the flat ``venue → instrument_type → day`` data-status panel
 * with a tree shaped per the codex per-asset_group shard-axis matrix.
 * Backed by the ``GET /api/data-status/drilldown/{service}/{asset_group}``
 * endpoint introduced in Phase 1.
 *
 * Lazy-load: each node fetches its children on first expand, with the
 * parent's ``row_key`` passed through as filter query params. The
 * top-level call materialises 2 levels by default; deeper levels lazy-
 * load on click.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type DrilldownNode,
  type DrilldownProvenance,
  type DrilldownResponse,
  buildShardDownloadUrl,
  getHierarchicalDrilldown,
} from "../api/client";
import { DeployMissingButton } from "./DeployMissingButton";
import { type LeafSchemaModalCoord } from "./LeafSchemaModal";

interface HierarchicalShardDrilldownProps {
  service: string;
  assetGroup: string;
  startDate: string;
  endDate: string;
  /** Initial expand depth from the top-level call. Default 1. */
  initialDepth?: number;
  /** Top-level page size — Phase 6 (operator finding 2026-05-07).
   *  Default 200; the API returns ``total_top_axis_children`` so the
   *  UI can render a load-more button when more shards exist. */
  topPageSize?: number;
  /** Open the per-leaf schema view (live parquet columns + stats) for a leaf
   *  shard. Wired by the parent to its shared LeafSchemaModal state so the
   *  drilldown leaf gets the SAME "retrievable schema" surface as the flat
   *  panel's venue badges. Omit to hide the per-leaf schema control. */
  onOpenLeafSchema?: (coord: LeafSchemaModalCoord) => void;
}

function _leafDownloadUrl(service: string, assetGroup: string, rowKey: Record<string, string>): string | null {
  const date = rowKey.day ?? rowKey.date;
  const venue = rowKey.venue;
  if (!date || !venue) {
    return null;
  }
  // Reuse the existing /data-status/download-shard-csv endpoint. The
  // builder accepts the v7 multi-axis fields (chain / league_id /
  // job_id) so leaf row_keys map cleanly. Per-instrument /
  // feature_group / timeframe / canonical_question_group filters are
  // honored at server-side via /data-status/instruments-for-shard +
  // schema; the leaf-level CSV download starts from the (venue, day,
  // data_type, instrument_type) coord and the user picks instruments
  // in the InstrumentsModal flow today.
  return buildShardDownloadUrl({
    service,
    asset_group: assetGroup,
    venue,
    date,
    instrument_type: rowKey.instrument_type ?? "",
    data_type: rowKey.data_type ?? "",
    chain: rowKey.chain,
    league_id: rowKey.league_id,
  });
}

// ``data_type`` is not a drilldown axis for services whose leaf shard is a
// single per-(venue, day) bundle: instruments-service emits ONE ``instruments``
// catalog parquet per venue-day for EVERY asset_group, so its leaf row_key is
// only {venue, date}. Services whose drilldown axes DO include data_type (MTDS,
// market-data-processing, features-*) already carry it in the row_key, so this
// fallback is only consulted when the row_key omits it.
const _DEFAULT_LEAF_DATA_TYPE: Record<string, string> = {
  "instruments-service": "instruments",
};

/**
 * Build the per-leaf schema-view coord (``/leaf-stats`` via LeafSchemaModal) from
 * a drilldown leaf's row_key. Mirrors the flat panel's coord (DataStatusTab
 * `setLeafSchemaCoord`): ``instrument_type: "AUTO"`` lets deployment-api resolve
 * the parquet path via ``_gcs_path_for_shard``, so a coarse (venue, day,
 * data_type) leaf still resolves. Returns null when the row_key can't identify a
 * shard (so the "schema" control renders only where it will actually work).
 */
function _leafSchemaCoord(
  service: string,
  assetGroup: string,
  rowKey: Record<string, string>,
): LeafSchemaModalCoord | null {
  const day = rowKey.day ?? rowKey.date;
  const venue = rowKey.venue;
  const dataType = rowKey.data_type ?? _DEFAULT_LEAF_DATA_TYPE[service];
  if (!day || !venue || !dataType) {
    return null;
  }
  return {
    service,
    asset_group: assetGroup,
    instrument_type: rowKey.instrument_type ?? "AUTO",
    data_type: dataType,
    day,
    venue,
    instrument_id: rowKey.instrument_id ?? null,
    underlying: rowKey.underlying ?? null,
  };
}

/** Human-readable label for the M8 cadence axis (UAC ``Cadence`` StrEnum). The
 * raw enum value is the manifest column; the UI shows the operator-friendly
 * form. Unknown / blank cadence → null (render nothing — blank-safe, exactly
 * like the transport badge handles absence). */
function _cadenceLabel(cadence: string | undefined): string | null {
  switch (cadence) {
    case "one_off_backfill":
      return "One-off backfill";
    case "t1_daily":
      return "T+1 daily";
    case "scheduled_recurring":
      return "Scheduled";
    case "continuous_live":
      return "Continuous (live)";
    case "recovery_replay":
      return "Recovery replay";
    default:
      return null;
  }
}

/** Collapse a per-(pipeline_mode, source) breakdown row to its single honest
 * capture_status, by the M5 union precedence (captured > empty_confirmed >
 * attempted_failed > expected_unattempted). Drives the per-mode badge colour. */
function _provenanceStatus(p: DrilldownProvenance): string {
  if (p.captured > 0) return "captured";
  if (p.empty_confirmed > 0) return "empty_confirmed";
  if (p.attempted_failed > 0) return "attempted_failed";
  if (p.expected_unattempted > 0) return "expected_unattempted";
  return "missing";
}

export function HierarchicalShardDrilldown({
  service,
  assetGroup,
  startDate,
  endDate,
  initialDepth = 1,
  topPageSize = 200,
  onOpenLeafSchema,
}: HierarchicalShardDrilldownProps) {
  const [topLevel, setTopLevel] = useState<DrilldownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getHierarchicalDrilldown({
      service,
      asset_group: assetGroup,
      start_date: startDate,
      end_date: endDate,
      expand_to_depth: initialDepth,
      child_offset: 0,
      child_limit: topPageSize,
      signal: controller.signal,
    })
      .then((res) => {
        setTopLevel(res);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          setError(String(e));
        }
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [service, assetGroup, startDate, endDate, initialDepth, topPageSize]);

  const handleLoadMore = useCallback(() => {
    if (!topLevel || loadingMore) {
      return;
    }
    const controller = new AbortController();
    setLoadingMore(true);
    setError(null);
    getHierarchicalDrilldown({
      service,
      asset_group: assetGroup,
      start_date: startDate,
      end_date: endDate,
      expand_to_depth: initialDepth,
      child_offset: topLevel.tree.length,
      child_limit: topPageSize,
      signal: controller.signal,
    })
      .then((res) => {
        setTopLevel((prev) =>
          prev
            ? {
                ...prev,
                tree: [...prev.tree, ...res.tree],
                total_top_axis_children: res.total_top_axis_children,
                child_offset: res.child_offset,
                child_limit: res.child_limit,
              }
            : res,
        );
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          setError(String(e));
        }
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [topLevel, loadingMore, service, assetGroup, startDate, endDate, initialDepth, topPageSize]);

  if (loading && !topLevel) {
    return <div className="drilldown-loading">Loading {assetGroup} drill-down...</div>;
  }
  if (error) {
    return (
      <div className="drilldown-error" role="alert">
        Failed to load drill-down: {error}
      </div>
    );
  }
  if (!topLevel || topLevel.tree.length === 0) {
    return <div className="drilldown-empty">No data for {assetGroup}.</div>;
  }

  return (
    <div className="hierarchical-shard-drilldown" data-asset-group={assetGroup}>
      <div className="drilldown-axes">Axes: {topLevel.axes.join(" → ")}</div>
      <div className="drilldown-totals">
        <span className="captured">{topLevel.totals.captured.toLocaleString()}</span>
        <span className="separator"> / </span>
        <span className="total">{topLevel.totals.total.toLocaleString()}</span>
        <span className="pct"> ({topLevel.totals.completion_pct.toFixed(1)}%)</span>
        {topLevel.totals.empty_confirmed > 0 && (
          <span className="empty-pill" title="Honest empty (source returned 0 rows)">
            {topLevel.totals.empty_confirmed.toLocaleString()} empty
          </span>
        )}
        {topLevel.totals.attempted_failed > 0 && (
          <span className="failed-pill" title="Adapter raised; needs retry">
            {topLevel.totals.attempted_failed.toLocaleString()} failed
          </span>
        )}
        {topLevel.totals.expected_unattempted > 0 && (
          <span
            className="pending-pill"
            title="Expected but not yet attempted — instrument is IS-listed + post-launch but the backfill has not run yet (the could-exist universe; counts in the denominator, diluting completion %)"
          >
            {topLevel.totals.expected_unattempted.toLocaleString()} pending
          </span>
        )}
      </div>
      <div className="drilldown-legend" aria-label="capture-status legend">
        <span className="legend-item captured">captured</span>
        <span className="legend-item empty">empty (e)</span>
        <span className="legend-item failed">failed (f)</span>
        <span className="legend-item pending">pending / expected-unattempted (u)</span>
      </div>
      <ul className="drilldown-tree" role="tree">
        {topLevel.tree.map((node) => (
          <DrilldownNodeRow
            key={`${node.axis}:${node.value}`}
            node={node}
            service={service}
            assetGroup={assetGroup}
            startDate={startDate}
            endDate={endDate}
            depth={0}
            onOpenLeafSchema={onOpenLeafSchema}
          />
        ))}
      </ul>
      {(() => {
        // Phase 6 (2026-05-07 operator finding): when the API has more
        // top-level children than we've fetched, render load-more so
        // operators can scroll through every per-instrument shard
        // (BINANCE-FUTURES PERPETUAL, DERIBIT options chains, ...).
        const total = topLevel.total_top_axis_children;
        const shown = topLevel.tree.length;
        if (total == null || shown >= total) {
          return null;
        }
        const remaining = total - shown;
        return (
          <div className="drilldown-load-more">
            <span className="drilldown-load-more-summary">
              Showing {shown.toLocaleString()} of {total.toLocaleString()} {topLevel.axes[0] ?? "items"}
            </span>
            <button
              className="drilldown-load-more-button"
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-label={`Load next ${Math.min(topPageSize, remaining)} of ${remaining} remaining`}
            >
              {loadingMore ? "Loading…" : `Show more (${remaining.toLocaleString()} remaining)`}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

interface DrilldownNodeRowProps {
  node: DrilldownNode;
  service: string;
  assetGroup: string;
  startDate: string;
  endDate: string;
  depth: number;
  onOpenLeafSchema?: (coord: LeafSchemaModalCoord) => void;
}

function DrilldownNodeRow({
  node,
  service,
  assetGroup,
  startDate,
  endDate,
  depth,
  onOpenLeafSchema,
}: DrilldownNodeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DrilldownNode[] | null>(node.children.length > 0 ? node.children : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLeaf = node.is_leaf || node.axis === "date" || node.axis === "day";

  const handleToggle = useCallback(() => {
    if (isLeaf) {
      return;
    }
    setExpanded((prev) => !prev);
  }, [isLeaf]);

  // Lazy-load children on first expand if the server didn't materialise them.
  useEffect(() => {
    if (!expanded || children !== null || isLeaf) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getHierarchicalDrilldown({
      service,
      asset_group: assetGroup,
      start_date: startDate,
      end_date: endDate,
      filters: node.row_key,
      expand_to_depth: 1,
      signal: controller.signal,
    })
      .then((res) => {
        // The server's response is rooted at the level matching our
        // filter depth; its ``tree`` IS our children.
        setChildren(res.tree);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          setError(String(e));
        }
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, children, isLeaf, service, assetGroup, startDate, endDate, node.row_key]);

  const ariaLabel = useMemo(
    () => `${node.axis}=${node.value}: ${node.captured} captured of ${node.total} total`,
    [node.axis, node.value, node.captured, node.total],
  );

  return (
    <li className="drilldown-row" role="treeitem" aria-expanded={isLeaf ? undefined : expanded}>
      <div className="drilldown-row-content" style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          className="drilldown-toggle"
          type="button"
          onClick={handleToggle}
          disabled={isLeaf}
          aria-label={ariaLabel}
        >
          <span className="chevron">{isLeaf ? " " : expanded ? "▾" : "▸"}</span>
          <span className="axis-label">{node.axis}=</span>
          <span className="value">{node.value}</span>
          <span className="counts">
            {node.captured.toLocaleString()} / {node.total.toLocaleString()}
          </span>
          <span className="pct">{node.completion_pct.toFixed(1)}%</span>
          {node.empty_confirmed > 0 && (
            <span className="empty-badge" title="Honest empty">
              {node.empty_confirmed}e
            </span>
          )}
          {node.attempted_failed > 0 && (
            <span className="failed-badge" title="Failed; retry">
              {node.attempted_failed}f
            </span>
          )}
          {node.expected_unattempted > 0 && (
            <span className="pending-badge" title="Expected, not yet attempted (could-exist universe)">
              {node.expected_unattempted}u
            </span>
          )}
        </button>
        {isLeaf &&
          (() => {
            // Leaf-row controls: per-leaf CSV download + Deploy-Missing
            // surgical-recovery button. Only render when the row_key has
            // enough fields to produce a meaningful action.
            //
            // Deploy-Missing requires the FULL shard-atom (venue +
            // data_type + day at minimum). Intermediate "leaves" at
            // ``expand_to_depth=1`` may have ``is_leaf=true`` for the
            // tree-rendering shape but only carry the partial row_key
            // matching their depth (e.g. just {venue}). Calling the
            // /deploy-missing-preview endpoint with such a row_key
            // returns 400 from the backend's required-field validation.
            // Render the button only when the row_key composes a
            // workable shard.
            const downloadUrl = _leafDownloadUrl(service, assetGroup, node.row_key);
            const rk = node.row_key;
            const hasFullShardKey = !!rk.venue && !!rk.data_type && (!!rk.day || !!rk.date);
            const isMissingShard = node.captured === 0;
            // Per-leaf schema view (live parquet columns + stats) — the SAME
            // "retrievable schema" surface the flat panel's venue badges open,
            // now placed on the per-day leaf so a shard's CSV download and its
            // schema live side by side. Null when the row_key can't resolve a
            // shard, so the control never renders where it would 4xx.
            const schemaCoord = onOpenLeafSchema ? _leafSchemaCoord(service, assetGroup, node.row_key) : null;
            return (
              <span className="drilldown-leaf-controls">
                {downloadUrl && (
                  <a
                    className="drilldown-download"
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download this shard's parquet as CSV"
                  >
                    ↓ csv
                  </a>
                )}
                {onOpenLeafSchema && schemaCoord && (
                  <button
                    type="button"
                    className="drilldown-schema"
                    title="View this shard's retrievable schema — live parquet columns, row/null counts, available_at envelope"
                    onClick={() => onOpenLeafSchema(schemaCoord)}
                  >
                    ⛃ schema
                  </button>
                )}
                {isMissingShard && hasFullShardKey && (
                  <DeployMissingButton
                    service={service}
                    assetGroup={assetGroup}
                    rowKey={node.row_key}
                    label="↻ deploy"
                  />
                )}
              </span>
            );
          })()}
      </div>
      {isLeaf && node.provenance != null && node.provenance.length > 0 && (
        // G3/M5 per-cell provenance: how each pipeline_mode x source answered
        // this shard-atom (e.g. captured via batch + replay, missing in live).
        // The leaf count above is the honest UNION across these rows.
        <ul
          className="drilldown-provenance"
          role="group"
          aria-label="Per-pipeline_mode/source breakdown"
          style={{ paddingLeft: `${(depth + 1) * 16}px` }}
        >
          {node.provenance.map((p) => {
            const status = _provenanceStatus(p);
            const cadenceLabel = _cadenceLabel(p.cadence);
            return (
              <li
                key={`${p.pipeline_mode}:${p.source}:${p.transport}:${p.cadence ?? ""}`}
                className={`drilldown-provenance-row provenance-${status}`}
                title={`${p.pipeline_mode || "—"} / ${p.source || "—"}${
                  p.transport ? ` / ${p.transport}` : ""
                }${cadenceLabel ? ` / ${cadenceLabel}` : ""}: ${status}`}
              >
                <span className="provenance-mode">{p.pipeline_mode || "—"}</span>
                <span className="provenance-source">{p.source || "—"}</span>
                {p.transport && <span className="provenance-transport">{p.transport}</span>}
                {cadenceLabel && (
                  <span className="provenance-cadence" data-cadence={p.cadence}>
                    {cadenceLabel}
                  </span>
                )}
                <span className={`provenance-status status-${status}`}>{status}</span>
              </li>
            );
          })}
        </ul>
      )}
      {expanded && !isLeaf && (
        <ul className="drilldown-tree-nested" role="group">
          {loading && <li className="drilldown-loading">Loading...</li>}
          {error && (
            <li className="drilldown-error" role="alert">
              {error}
            </li>
          )}
          {children?.map((child) => (
            <DrilldownNodeRow
              key={`${child.axis}:${child.value}`}
              node={child}
              service={service}
              assetGroup={assetGroup}
              startDate={startDate}
              endDate={endDate}
              depth={depth + 1}
              onOpenLeafSchema={onOpenLeafSchema}
            />
          ))}
          {children?.length === 0 && !loading && <li className="drilldown-empty">(no data)</li>}
        </ul>
      )}
    </li>
  );
}

export default HierarchicalShardDrilldown;
