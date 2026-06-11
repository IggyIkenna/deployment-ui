/**
 * Unit tests for capability-helpers.ts aggregation logic.
 * Regression guard for the matrix, gap summary, sources, and orphan/dead-end
 * functions.  Uses a minimal synthetic manifest so tests run without the
 * full 9 KB JSON.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildDeadEndList,
  buildGapSummary,
  buildMatrix,
  buildNodeIndex,
  buildOrphanList,
  buildSourcesTable,
} from "../../src/lib/capability-helpers";
import type { CapabilityEdge, CapabilityManifest, CapabilityNode } from "../../src/data/capability-manifest-loader";

// ---------------------------------------------------------------------------
// Minimal synthetic manifest
// ---------------------------------------------------------------------------

const nodes: CapabilityNode[] = [
  { kind: "archetype", node_id: "ARCH_A", label: "Arch A", metadata: {} },
  { kind: "archetype", node_id: "ARCH_B", label: "Arch B", metadata: {} },
  { kind: "instrument_type", node_id: "instrument_type:perp", label: "Perp", metadata: {} },
  { kind: "instrument_type", node_id: "instrument_type:spot", label: "Spot", metadata: {} },
  { kind: "venue", node_id: "venue:binance", label: "Binance", metadata: { category: "cefi" } },
  { kind: "venue", node_id: "venue:uniswap", label: "Uniswap", metadata: { category: "defi" } },
  { kind: "data_source", node_id: "data_source:barchart", label: "Barchart", metadata: {} },
  { kind: "data_source", node_id: "data_source:tardis", label: "Tardis", metadata: {} },
  { kind: "archetype", node_id: "ARCH_ORPHAN", label: "Orphan Arch", metadata: {} },
];

const edges: CapabilityEdge[] = [
  // ARCH_A trades perp — available
  {
    from_node_id: "ARCH_A",
    to_node_id: "instrument_type:perp",
    relation: "trades_instrument",
    status: "available",
    gap_type: null,
    reason: null,
    readiness: null,
    agent_annotation: null,
  },
  // ARCH_A trades perp — second edge, partial
  {
    from_node_id: "ARCH_A",
    to_node_id: "instrument_type:perp",
    relation: "trades_instrument",
    status: "partial",
    gap_type: null,
    reason: "partial reason",
    readiness: null,
    agent_annotation: null,
  },
  // ARCH_A trades spot — not_available (unbuilt)
  {
    from_node_id: "ARCH_A",
    to_node_id: "instrument_type:spot",
    relation: "trades_instrument",
    status: "not_available",
    gap_type: null,
    reason: "no spot adapter",
    readiness: null,
    agent_annotation: null,
  },
  // ARCH_B trades spot — not_available (logical)
  {
    from_node_id: "ARCH_B",
    to_node_id: "instrument_type:spot",
    relation: "trades_instrument",
    status: "not_available",
    gap_type: "logical_dead_end",
    reason: "logically impossible",
    readiness: null,
    agent_annotation: null,
  },
  // ARCH_A supports binance (cefi venue)
  {
    from_node_id: "ARCH_A",
    to_node_id: "venue:binance",
    relation: "supports",
    status: "available",
    gap_type: null,
    reason: null,
    readiness: null,
    agent_annotation: null,
  },
  // ARCH_B supports uniswap (defi venue)
  {
    from_node_id: "ARCH_B",
    to_node_id: "venue:uniswap",
    relation: "supports",
    status: "available",
    gap_type: null,
    reason: null,
    readiness: null,
    agent_annotation: null,
  },
  // data_source batch/live/replay + transport
  {
    from_node_id: "data_source:barchart",
    to_node_id: "data_source:barchart",
    relation: "supports_mode:batch",
    status: "available",
    gap_type: null,
    reason: null,
    readiness: null,
    agent_annotation: null,
  },
  {
    from_node_id: "data_source:barchart",
    to_node_id: "data_source:barchart",
    relation: "supports_mode:live",
    status: "not_registered",
    gap_type: "missing_registry",
    reason: "no live registry",
    readiness: null,
    agent_annotation: null,
  },
  {
    from_node_id: "data_source:barchart",
    to_node_id: "data_source:barchart",
    relation: "supports_mode:replay",
    status: "not_registered",
    gap_type: "missing_registry",
    reason: "no replay registry",
    readiness: null,
    agent_annotation: null,
  },
  {
    from_node_id: "data_source:barchart",
    to_node_id: "data_source:barchart",
    relation: "over_transport:rest",
    status: "available",
    gap_type: null,
    reason: null,
    readiness: null,
    agent_annotation: null,
  },
];

const MANIFEST: CapabilityManifest = {
  manifest_version: "1",
  generated_from_commit: "test_commit",
  nodes,
  edges,
  gaps: {
    logical_dead_end: 19,
    logical_dead_ends: 16,
    missing_extraction: 1,
    missing_registry: 60,
    needs_code_scan: 3,
    not_registered_total: 63,
    orphan_nodes: 124,
    unbuilt_dead_ends: 25,
  },
};

// ---------------------------------------------------------------------------
// buildNodeIndex
// ---------------------------------------------------------------------------

describe("buildNodeIndex", () => {
  it("indexes all nodes by node_id", () => {
    const idx = buildNodeIndex(nodes);
    expect(idx.size).toBe(nodes.length);
    expect(idx.get("ARCH_A")?.label).toBe("Arch A");
    expect(idx.get("venue:binance")?.kind).toBe("venue");
  });
});

// ---------------------------------------------------------------------------
// buildMatrix
// ---------------------------------------------------------------------------

describe("buildMatrix", () => {
  it("returns cells for all trades_instrument edges", () => {
    const cells = buildMatrix(MANIFEST);
    // ARCH_A×perp, ARCH_A×spot, ARCH_B×spot
    expect(cells).toHaveLength(3);
  });

  it("rolls up multiple edges to best status (available beats partial)", () => {
    const cells = buildMatrix(MANIFEST);
    const perpCell = cells.find((c) => c.archetypeId === "ARCH_A" && c.instrumentTypeId === "instrument_type:perp");
    expect(perpCell).toBeDefined();
    expect(perpCell!.status).toBe("available");
    expect(perpCell!.edges).toHaveLength(2);
  });

  it("includes the reason from contributing edges", () => {
    const cells = buildMatrix(MANIFEST);
    const perpCell = cells.find((c) => c.archetypeId === "ARCH_A" && c.instrumentTypeId === "instrument_type:perp");
    const reasons = perpCell!.edges.map((e) => e.reason).filter(Boolean);
    expect(reasons).toContain("partial reason");
  });

  it("filters by venue category — cefi keeps only ARCH_A (has binance)", () => {
    const cells = buildMatrix(MANIFEST, "cefi");
    expect(cells.every((c) => c.archetypeId === "ARCH_A")).toBe(true);
    // ARCH_B has only defi venue
    expect(cells.some((c) => c.archetypeId === "ARCH_B")).toBe(false);
  });

  it("filters by venue category — defi keeps only ARCH_B", () => {
    const cells = buildMatrix(MANIFEST, "defi");
    expect(cells.every((c) => c.archetypeId === "ARCH_B")).toBe(true);
  });

  it("returns empty when no matching archetype", () => {
    const cells = buildMatrix(MANIFEST, "tradfi");
    expect(cells).toHaveLength(0);
  });

  it("uses the instrument_type label from the node index", () => {
    const cells = buildMatrix(MANIFEST);
    const perpCell = cells.find((c) => c.instrumentTypeId === "instrument_type:perp");
    expect(perpCell?.instrumentTypeLabel).toBe("Perp");
  });

  it("sorts cells by archetype label then instrument_type label", () => {
    const cells = buildMatrix(MANIFEST);
    const labels = cells.map((c) => `${c.archetypeLabel}|||${c.instrumentTypeLabel}`);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// buildGapSummary
// ---------------------------------------------------------------------------

describe("buildGapSummary", () => {
  it("returns exactly 4 rows (one per canonical gap type)", () => {
    const rows = buildGapSummary(MANIFEST);
    expect(rows).toHaveLength(4);
  });

  it("carries counts from manifest.gaps", () => {
    const rows = buildGapSummary(MANIFEST);
    const mr = rows.find((r) => r.gapType === "missing_registry");
    expect(mr?.count).toBe(60);
    const ncs = rows.find((r) => r.gapType === "needs_code_scan");
    expect(ncs?.count).toBe(3);
    const me = rows.find((r) => r.gapType === "missing_extraction");
    expect(me?.count).toBe(1);
    const ld = rows.find((r) => r.gapType === "logical_dead_end");
    expect(ld?.count).toBe(19);
  });

  it("includes non-empty description for each gap type", () => {
    const rows = buildGapSummary(MANIFEST);
    for (const row of rows) {
      expect(row.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSourcesTable
// ---------------------------------------------------------------------------

describe("buildSourcesTable", () => {
  it("returns one row per data_source node", () => {
    const rows = buildSourcesTable(MANIFEST);
    // barchart + tardis
    expect(rows).toHaveLength(2);
  });

  it("maps batch/live/replay status per source", () => {
    const rows = buildSourcesTable(MANIFEST);
    const bc = rows.find((r) => r.sourceId === "data_source:barchart");
    expect(bc).toBeDefined();
    expect(bc!.batchStatus).toBe("available");
    expect(bc!.liveStatus).toBe("not_registered");
    expect(bc!.replayStatus).toBe("not_registered");
  });

  it("falls back to not_registered for missing mode edges", () => {
    const rows = buildSourcesTable(MANIFEST);
    const tardis = rows.find((r) => r.sourceId === "data_source:tardis");
    expect(tardis!.batchStatus).toBe("not_registered");
    expect(tardis!.liveStatus).toBe("not_registered");
    expect(tardis!.transport).toBe("—");
  });

  it("extracts transport label from over_transport edge", () => {
    const rows = buildSourcesTable(MANIFEST);
    const bc = rows.find((r) => r.sourceId === "data_source:barchart");
    expect(bc!.transport).toBe("rest");
  });

  it("sorts rows by source label", () => {
    const rows = buildSourcesTable(MANIFEST);
    const labels = rows.map((r) => r.sourceLabel);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// buildOrphanList
// ---------------------------------------------------------------------------

describe("buildOrphanList", () => {
  it("returns ARCH_ORPHAN which has no edges", () => {
    const orphans = buildOrphanList(MANIFEST);
    const found = orphans.find((o) => o.nodeId === "ARCH_ORPHAN");
    expect(found).toBeDefined();
    expect(found!.label).toBe("Orphan Arch");
  });

  it("does not include nodes that appear in edges", () => {
    const orphans = buildOrphanList(MANIFEST);
    const connectedIds = ["ARCH_A", "ARCH_B", "instrument_type:perp", "venue:binance"];
    for (const id of connectedIds) {
      expect(orphans.find((o) => o.nodeId === id)).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// buildDeadEndList
// ---------------------------------------------------------------------------

describe("buildDeadEndList", () => {
  it("classifies ARCH_A×spot as unbuilt (no logical_dead_end gap_type)", () => {
    const rows = buildDeadEndList(MANIFEST);
    const archA = rows.find((r) => r.archetypeId === "ARCH_A");
    expect(archA).toBeDefined();
    expect(archA!.deadEndType).toBe("unbuilt");
  });

  it("classifies ARCH_B×spot as logical (all edges have logical_dead_end gap_type)", () => {
    const rows = buildDeadEndList(MANIFEST);
    const archB = rows.find((r) => r.archetypeId === "ARCH_B");
    expect(archB).toBeDefined();
    expect(archB!.deadEndType).toBe("logical");
  });

  it("only includes archetypes with at least one not_available edge", () => {
    const rows = buildDeadEndList(MANIFEST);
    // ARCH_A and ARCH_B have not_available edges; no other archetypes do
    expect(rows).toHaveLength(2);
  });
});
