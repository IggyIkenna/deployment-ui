/**
 * Data model + API adapters for the redesigned Data Status tab.
 *
 * The redesign (see `design/data-status-redesign/`) was prototyped against a
 * synthetic `ds` shape. This module is the real wiring: it normalises the
 * manifest 4-state `capture_status` vocabulary into the cell model the visuals
 * consume, and wraps the existing deployment-api client functions.
 *
 * Status remap (prototype name -> backend `capture_status`):
 *   captured       -> captured
 *   known-empty    -> empty_confirmed   (honest, typed-reason empty)
 *   failed         -> attempted_failed
 *   unattempted    -> expected_unattempted
 *   partial        -> derived (0 < coverage < 1 across a cell's sub-shards)
 *   future         -> derived (date > today)
 */

import {
  getHierarchicalDrilldown,
  getShardAxisMatrix,
  type DrilldownNode,
  type DrilldownResponse,
  type ShardAxisMatrixResponse,
} from "../../api/client";

/** Normalised cell status — the union the visuals render against. */
export type CellStatus =
  | "captured"
  | "empty_confirmed"
  | "attempted_failed"
  | "expected_unattempted"
  | "partial"
  | "future"
  | "none";

/** Rolled-up coverage counts for one cell (a node, or a (primary,date) cell). */
export interface CellStats {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  /** captured + empty_confirmed + attempted_failed */
  total: number;
  /** captured / total, in [0,1]; 0 when total is 0. */
  coverage: number;
  /** Worst-of status for a single-shard cell; rollups use `coverage`. */
  status: CellStatus;
}

const _EMPTY_CELL: CellStats = {
  captured: 0,
  empty_confirmed: 0,
  attempted_failed: 0,
  total: 0,
  coverage: 0,
  status: "none",
};

/** Build a {@link CellStats} from raw 4-state counts. */
export function cellStatsFromCounts(
  captured: number,
  emptyConfirmed: number,
  attemptedFailed: number,
): CellStats {
  const total = captured + emptyConfirmed + attemptedFailed;
  if (total === 0) {
    return { ..._EMPTY_CELL };
  }
  const coverage = captured / total;
  let status: CellStatus;
  if (attemptedFailed > 0 && captured === 0 && emptyConfirmed === 0) {
    status = "attempted_failed";
  } else if (coverage >= 1) {
    status = "captured";
  } else if (captured === 0 && emptyConfirmed > 0) {
    status = "empty_confirmed";
  } else {
    status = "partial";
  }
  return {
    captured,
    empty_confirmed: emptyConfirmed,
    attempted_failed: attemptedFailed,
    total,
    coverage,
    status,
  };
}

/** A drilldown node augmented with a normalised {@link CellStats}. */
export interface AxisValueCell {
  axis: string;
  value: string;
  stats: CellStats;
  isLeaf: boolean;
  /** Filter dict that selects this node (parent filters + this axis=value). */
  rowKey: Record<string, string>;
}

/** Convert a backend {@link DrilldownNode} to an {@link AxisValueCell}. */
export function nodeToCell(node: DrilldownNode): AxisValueCell {
  return {
    axis: node.axis,
    value: node.value,
    stats: cellStatsFromCounts(
      node.captured,
      node.empty_confirmed,
      node.attempted_failed,
    ),
    isLeaf: node.is_leaf,
    rowKey: node.row_key,
  };
}

/** The shard axes (in drilldown order) for one (service, asset_group). */
export function shardAxesFor(
  matrix: ShardAxisMatrixResponse,
  service: string,
  assetGroup: string,
): string[] {
  return matrix.shard_axes?.[service]?.[assetGroup] ?? [];
}

/** The single primary axis for one (service, asset_group). */
export function primaryAxisFor(
  matrix: ShardAxisMatrixResponse,
  service: string,
  assetGroup: string,
): string | undefined {
  return matrix.primary_axis?.[service]?.[assetGroup];
}

/** Asset groups a service covers, per the shard-axis matrix. */
export function assetGroupsFor(
  matrix: ShardAxisMatrixResponse,
  service: string,
): string[] {
  return Object.keys(matrix.shard_axes?.[service] ?? {});
}

/** Fetch the shard-axis matrix (scoped to one service). */
export async function fetchAxisMatrix(
  service: string,
  signal?: AbortSignal,
): Promise<ShardAxisMatrixResponse> {
  return getShardAxisMatrix(service, signal);
}

/**
 * Fetch one drilldown level: the children of the deepest pinned axis, given
 * the current `filters` (pinned axis=value selections). Returns the top-level
 * nodes as {@link AxisValueCell}s plus the response totals as a {@link CellStats}.
 */
export async function fetchDrilldownLevel(params: {
  service: string;
  assetGroup: string;
  start: string;
  end: string;
  filters: Record<string, string>;
  expandToDepth?: number;
  signal?: AbortSignal;
}): Promise<{
  axes: string[];
  cells: AxisValueCell[];
  totals: CellStats;
  raw: DrilldownResponse;
}> {
  const raw = await getHierarchicalDrilldown({
    service: params.service,
    asset_group: params.assetGroup,
    start_date: params.start,
    end_date: params.end,
    filters: params.filters,
    expand_to_depth: params.expandToDepth ?? 1,
    signal: params.signal,
  });
  return {
    axes: raw.axes,
    cells: raw.tree.map(nodeToCell),
    totals: cellStatsFromCounts(
      raw.totals.captured,
      raw.totals.empty_confirmed,
      raw.totals.attempted_failed,
    ),
    raw,
  };
}
