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
  type DrilldownResponse,
  getHierarchicalDrilldown,
} from "../api/client";

interface HierarchicalShardDrilldownProps {
  service: string;
  assetGroup: string;
  startDate: string;
  endDate: string;
  /** Initial expand depth from the top-level call. Default 1. */
  initialDepth?: number;
}

export function HierarchicalShardDrilldown({
  service,
  assetGroup,
  startDate,
  endDate,
  initialDepth = 1,
}: HierarchicalShardDrilldownProps) {
  const [topLevel, setTopLevel] = useState<DrilldownResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
  }, [service, assetGroup, startDate, endDate, initialDepth]);

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
      <div className="drilldown-axes">
        Axes: {topLevel.axes.join(" → ")}
      </div>
      <div className="drilldown-totals">
        <span className="captured">{topLevel.totals.captured.toLocaleString()}</span>
        <span className="separator"> / </span>
        <span className="total">{topLevel.totals.total.toLocaleString()}</span>
        <span className="pct">
          {" "}
          ({topLevel.totals.completion_pct.toFixed(1)}%)
        </span>
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
          />
        ))}
      </ul>
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
}

function DrilldownNodeRow({
  node,
  service,
  assetGroup,
  startDate,
  endDate,
  depth,
}: DrilldownNodeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DrilldownNode[] | null>(
    node.children.length > 0 ? node.children : null,
  );
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
    () =>
      `${node.axis}=${node.value}: ${node.captured} captured of ${node.total} total`,
    [node.axis, node.value, node.captured, node.total],
  );

  return (
    <li className="drilldown-row" role="treeitem" aria-expanded={isLeaf ? undefined : expanded}>
      <button
        className="drilldown-toggle"
        type="button"
        onClick={handleToggle}
        disabled={isLeaf}
        aria-label={ariaLabel}
        style={{ paddingLeft: `${depth * 16}px` }}
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
      </button>
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
            />
          ))}
          {children?.length === 0 && !loading && (
            <li className="drilldown-empty">(no data)</li>
          )}
        </ul>
      )}
    </li>
  );
}

export default HierarchicalShardDrilldown;
