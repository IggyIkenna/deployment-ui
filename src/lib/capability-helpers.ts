/**
 * Aggregation helpers for the Capability tab.
 *
 * All functions operate on the static CapabilityManifest loaded from
 * src/data/capability-manifest-loader.ts.  They are pure (no side effects)
 * so they can be unit-tested in isolation.
 */
import type {
  CapabilityEdge,
  CapabilityManifest,
  CapabilityNode,
  EdgeStatus,
} from "../data/capability-manifest-loader";

// ---------------------------------------------------------------------------
// Node index helpers
// ---------------------------------------------------------------------------

/** Build a map from node_id → node for O(1) lookups. */
export function buildNodeIndex(nodes: CapabilityNode[]): Map<string, CapabilityNode> {
  return new Map(nodes.map((n) => [n.node_id, n]));
}

// ---------------------------------------------------------------------------
// Matrix aggregation
// ---------------------------------------------------------------------------

/** A single cell in the archetype × instrument_type matrix. */
export interface MatrixCell {
  archetypeId: string;
  archetypeLabel: string;
  instrumentTypeId: string;
  instrumentTypeLabel: string;
  /** Best status across all edges for this (archetype, instrument_type) pair. */
  status: EdgeStatus;
  /** All contributing edges — shown in the detail panel on cell click. */
  edges: CapabilityEdge[];
}

/** Status priority for "best status" roll-up (higher = better). */
const STATUS_PRIORITY: Record<EdgeStatus, number> = {
  available: 4,
  partial: 3,
  not_available: 2,
  not_registered: 1,
};

function bestStatus(statuses: EdgeStatus[]): EdgeStatus {
  if (statuses.length === 0) return "not_registered";
  return statuses.reduce<EdgeStatus>(
    (best, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best),
    "not_registered",
  );
}

/**
 * Build the archetype × instrument_type matrix from `trades_instrument` edges.
 *
 * Multiple edges for the same (archetype, instrument_type) pair are aggregated
 * to their "best" status and kept in the `.edges` array for the detail panel.
 *
 * Optional `venueCategory` filter (e.g. "defi" | "cefi" | "tradfi") narrows
 * the archetype set to those that have at least one `supports` edge to a venue
 * whose metadata.category matches.
 */
export function buildMatrix(manifest: CapabilityManifest, venueCategory?: string): MatrixCell[] {
  const nodeIndex = buildNodeIndex(manifest.nodes);

  // If a venue-category filter is requested, collect the archetype IDs that
  // have at least one `supports` edge to a matching venue.
  let filteredArchetypeIds: Set<string> | null = null;
  if (venueCategory) {
    filteredArchetypeIds = new Set<string>();
    for (const edge of manifest.edges) {
      if (edge.relation !== "supports") continue;
      const toNode = nodeIndex.get(edge.to_node_id);
      if (toNode?.kind === "venue" && toNode.metadata.category === venueCategory) {
        filteredArchetypeIds.add(edge.from_node_id);
      }
    }
  }

  // Group `trades_instrument` edges by (from_node_id, to_node_id)
  const key = (e: CapabilityEdge) => `${e.from_node_id}|||${e.to_node_id}`;
  const groups = new Map<string, CapabilityEdge[]>();
  for (const edge of manifest.edges) {
    if (edge.relation !== "trades_instrument") continue;
    if (filteredArchetypeIds && !filteredArchetypeIds.has(edge.from_node_id)) continue;
    const k = key(edge);
    const arr = groups.get(k);
    if (arr) {
      arr.push(edge);
    } else {
      groups.set(k, [edge]);
    }
  }

  // Build cells
  const cells: MatrixCell[] = [];
  for (const [k, edges] of groups) {
    const [archetypeId, instrumentTypeId] = k.split("|||");
    const archetypeNode = nodeIndex.get(archetypeId);
    const instrNode = nodeIndex.get(instrumentTypeId);
    cells.push({
      archetypeId,
      archetypeLabel: archetypeNode?.label ?? archetypeId,
      instrumentTypeId,
      instrumentTypeLabel: instrNode?.label ?? instrumentTypeId.replace("instrument_type:", ""),
      status: bestStatus(edges.map((e) => e.status)),
      edges,
    });
  }

  // Sort: archetype label asc, then instrument_type label asc
  cells.sort((a, b) => {
    const ac = a.archetypeLabel.localeCompare(b.archetypeLabel);
    if (ac !== 0) return ac;
    return a.instrumentTypeLabel.localeCompare(b.instrumentTypeLabel);
  });

  return cells;
}

// ---------------------------------------------------------------------------
// Gap summary aggregation
// ---------------------------------------------------------------------------

export interface GapSummaryRow {
  gapType: string;
  count: number;
  description: string;
}

const GAP_DESCRIPTIONS: Record<string, string> = {
  missing_registry: "No UAC registry for this capability dimension",
  needs_code_scan: "Requires agent code-scan to determine availability",
  missing_extraction: "Registry exists but exporter cannot extract the value",
  logical_dead_end: "Technically or logically impossible combination",
};

/**
 * Build the gap summary rows from the manifest's gaps object.
 * Only shows gap types with count > 0 (except we always show the four canonical types).
 */
export function buildGapSummary(manifest: CapabilityManifest): GapSummaryRow[] {
  const g = manifest.gaps;
  const rows: GapSummaryRow[] = [
    {
      gapType: "missing_registry",
      count: g.missing_registry,
      description: GAP_DESCRIPTIONS.missing_registry,
    },
    {
      gapType: "needs_code_scan",
      count: g.needs_code_scan,
      description: GAP_DESCRIPTIONS.needs_code_scan,
    },
    {
      gapType: "missing_extraction",
      count: g.missing_extraction,
      description: GAP_DESCRIPTIONS.missing_extraction,
    },
    {
      gapType: "logical_dead_end",
      count: g.logical_dead_end,
      description: GAP_DESCRIPTIONS.logical_dead_end,
    },
  ];
  return rows;
}

// ---------------------------------------------------------------------------
// Sources view aggregation
// ---------------------------------------------------------------------------

export interface SourceRow {
  sourceId: string;
  sourceLabel: string;
  batchStatus: EdgeStatus;
  liveStatus: EdgeStatus;
  replayStatus: EdgeStatus;
  transport: string;
}

/**
 * Build the data_source × mode (batch/live/replay) × transport table.
 *
 * Uses `supports_mode:*` and `over_transport:*` edges whose from_node_id is a
 * data_source node.
 */
export function buildSourcesTable(manifest: CapabilityManifest): SourceRow[] {
  const nodeIndex = buildNodeIndex(manifest.nodes);

  // Collect all data_source node IDs
  const sourceIds = new Set<string>(manifest.nodes.filter((n) => n.kind === "data_source").map((n) => n.node_id));

  const batchMap = new Map<string, EdgeStatus>();
  const liveMap = new Map<string, EdgeStatus>();
  const replayMap = new Map<string, EdgeStatus>();
  const transportMap = new Map<string, string>();

  for (const edge of manifest.edges) {
    if (!sourceIds.has(edge.from_node_id)) continue;
    if (edge.relation === "supports_mode:batch") {
      batchMap.set(edge.from_node_id, edge.status);
    } else if (edge.relation === "supports_mode:live") {
      liveMap.set(edge.from_node_id, edge.status);
    } else if (edge.relation === "supports_mode:replay") {
      replayMap.set(edge.from_node_id, edge.status);
    } else if (
      edge.relation === "over_transport:rest" ||
      edge.relation === "over_transport:flat_file" ||
      edge.relation === "over_transport:websocket"
    ) {
      transportMap.set(edge.from_node_id, edge.relation.replace("over_transport:", ""));
    }
  }

  const rows: SourceRow[] = [];
  for (const sourceId of sourceIds) {
    const node = nodeIndex.get(sourceId);
    rows.push({
      sourceId,
      sourceLabel: node?.label ?? sourceId.replace("data_source:", ""),
      batchStatus: batchMap.get(sourceId) ?? "not_registered",
      liveStatus: liveMap.get(sourceId) ?? "not_registered",
      replayStatus: replayMap.get(sourceId) ?? "not_registered",
      transport: transportMap.get(sourceId) ?? "—",
    });
  }

  // Sort by source label
  rows.sort((a, b) => a.sourceLabel.localeCompare(b.sourceLabel));
  return rows;
}

// ---------------------------------------------------------------------------
// Orphan / dead-end list
// ---------------------------------------------------------------------------

export interface OrphanRow {
  nodeId: string;
  label: string;
  kind: string;
}

/**
 * Return nodes that have NO edges at all (orphans by graph connectivity).
 * The manifest's `gaps.orphan_nodes` count is the canonical count; this
 * returns the actual nodes for display.
 */
export function buildOrphanList(manifest: CapabilityManifest): OrphanRow[] {
  const connectedIds = new Set<string>();
  for (const edge of manifest.edges) {
    connectedIds.add(edge.from_node_id);
    connectedIds.add(edge.to_node_id);
  }
  return manifest.nodes
    .filter((n) => !connectedIds.has(n.node_id))
    .map((n) => ({ nodeId: n.node_id, label: n.label, kind: n.kind }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Return archetype nodes that have only `not_available` trades_instrument edges
 * (unbuilt dead-ends vs logical dead-ends).
 */
export interface DeadEndRow {
  archetypeId: string;
  archetypeLabel: string;
  deadEndType: "unbuilt" | "logical";
  edges: CapabilityEdge[];
}

export function buildDeadEndList(manifest: CapabilityManifest): DeadEndRow[] {
  const nodeIndex = buildNodeIndex(manifest.nodes);

  // Group not_available trades_instrument edges by archetype
  const byArchetype = new Map<string, CapabilityEdge[]>();
  for (const edge of manifest.edges) {
    if (edge.relation !== "trades_instrument" || edge.status !== "not_available") continue;
    const arr = byArchetype.get(edge.from_node_id);
    if (arr) {
      arr.push(edge);
    } else {
      byArchetype.set(edge.from_node_id, [edge]);
    }
  }

  const rows: DeadEndRow[] = [];
  for (const [archetypeId, edges] of byArchetype) {
    const node = nodeIndex.get(archetypeId);
    const isLogical = edges.every((e) => e.gap_type === "logical_dead_end");
    rows.push({
      archetypeId,
      archetypeLabel: node?.label ?? archetypeId,
      deadEndType: isLogical ? "logical" : "unbuilt",
      edges,
    });
  }

  rows.sort((a, b) => a.archetypeLabel.localeCompare(b.archetypeLabel));
  return rows;
}
