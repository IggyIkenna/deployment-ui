/**
 * CapabilityTab — static capability matrix + gaps/orphans + sources + verdicts views.
 *
 * Sits next to the Data Status tab in the per-service view.  Reads from the
 * static capability-manifest.json (committed under src/data/) — no network
 * calls, no runtime data availability.
 *
 * Four views (sub-tabs):
 *   1. Matrix   — archetype × instrument_type grid, coloured by edge status;
 *                 filterable by venue category; cell click → detail panel.
 *   2. Gaps     — gap summary by type + unbuilt/logical dead-end lists +
 *                 orphan node count; dead-end/orphan rows cross-link to Data Status.
 *   3. Sources  — data_source × mode (batch/live/replay) × transport table;
 *                 cross-links to the existing Data Status tab for that service.
 *   4. Verdicts — verdict-matrix summary (total/available/blocked/not_registered)
 *                 + per-archetype drill-down listing blocked paths with reasons.
 *                 Lazy-loaded from capability-verdict-matrix.json (~2.2 MB).
 *
 * Plan: capability_wizard_and_manifest_2026_06_11.md Phase 4 + Phase 6C P2.
 */

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Grid3x3,
  Info,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { capabilityManifest } from "../data/capability-manifest-loader";
import type { CapabilityEdge, EdgeStatus } from "../data/capability-manifest-loader";
import { loadVerdictMatrix } from "../data/capability-verdict-matrix-loader";
import type { CapabilityVerdictMatrix } from "../data/capability-verdict-matrix-loader";
import {
  buildDeadEndList,
  buildGapSummary,
  buildMatrix,
  buildOrphanList,
  buildSourcesTable,
  buildVerdictArchetypeList,
  buildVerdictSummary,
} from "../lib/capability-helpers";
import type { MatrixCell, VerdictArchetypeSummary } from "../lib/capability-helpers";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(status: EdgeStatus): string {
  switch (status) {
    case "available":
      return "bg-[var(--color-accent-green)]/20 text-[var(--color-accent-green)] border border-[var(--color-accent-green)]/30";
    case "partial":
      return "bg-[var(--color-accent-yellow)]/20 text-[var(--color-accent-yellow)] border border-[var(--color-accent-yellow)]/30";
    case "not_available":
      return "bg-[var(--color-accent-red)]/20 text-[var(--color-accent-red)] border border-[var(--color-accent-red)]/30";
    case "not_registered":
      return "bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border-primary)]";
  }
}

function statusLabel(status: EdgeStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "partial":
      return "Partial";
    case "not_available":
      return "Not Available";
    case "not_registered":
      return "Not Registered";
  }
}

// ---------------------------------------------------------------------------
// Cell detail panel
// ---------------------------------------------------------------------------

interface CellDetailPanelProps {
  cell: MatrixCell | null;
  onClose: () => void;
}

function CellDetailPanel({ cell, onClose }: CellDetailPanelProps) {
  return (
    <Dialog open={!!cell} onClose={onClose}>
      {cell && (
        <>
          <DialogHeader onClose={onClose}>
            <DialogTitle>
              <span className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColor(cell.status))}>
                  {statusLabel(cell.status)}
                </span>
                <span className="text-[var(--color-text-primary)]">{cell.archetypeLabel}</span>
                <span className="text-[var(--color-text-secondary)] font-normal">× {cell.instrumentTypeLabel}</span>
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogContent>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              {cell.edges.length} contributing edge{cell.edges.length !== 1 ? "s" : ""} for this (archetype,
              instrument_type) pair.
            </p>
            <div className="space-y-3">
              {cell.edges.map((edge, idx) => (
                <EdgeRow key={idx} edge={edge} />
              ))}
            </div>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

function EdgeRow({ edge }: { edge: CapabilityEdge }) {
  return (
    <div className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("px-1.5 py-0.5 rounded text-xs font-medium", statusColor(edge.status))}>
          {statusLabel(edge.status)}
        </span>
        <code className="text-xs text-[var(--color-text-secondary)] font-mono">{edge.relation}</code>
        {edge.gap_type && (
          <Badge variant="outline" className="text-xs text-[var(--color-accent-yellow)]">
            {edge.gap_type}
          </Badge>
        )}
      </div>
      {edge.reason && (
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed pl-0.5">{edge.reason}</p>
      )}
      {edge.agent_annotation && (
        <p className="text-xs text-[var(--color-accent-blue)] leading-relaxed pl-0.5">
          Agent note: {edge.agent_annotation}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix view
// ---------------------------------------------------------------------------

const VENUE_CATEGORIES = [
  { value: "all", label: "All venues" },
  { value: "cefi", label: "CeFi" },
  { value: "defi", label: "DeFi" },
  { value: "tradfi", label: "TradFi" },
  { value: "sports", label: "Sports" },
  { value: "prediction", label: "Prediction" },
];

function MatrixView({ onLinkToDataStatus }: { onLinkToDataStatus: (service: string) => void }) {
  const [venueCategory, setVenueCategory] = useState("all");
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  const cells = useMemo(
    () => buildMatrix(capabilityManifest, venueCategory === "all" ? undefined : venueCategory),
    [venueCategory],
  );

  // Distinct instrument types across the filtered cells (sorted)
  const instrTypes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: { id: string; label: string }[] = [];
    for (const c of cells) {
      if (!seen.has(c.instrumentTypeId)) {
        seen.add(c.instrumentTypeId);
        ordered.push({ id: c.instrumentTypeId, label: c.instrumentTypeLabel });
      }
    }
    ordered.sort((a, b) => a.label.localeCompare(b.label));
    return ordered;
  }, [cells]);

  // Distinct archetypes (sorted)
  const archetypes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: { id: string; label: string }[] = [];
    for (const c of cells) {
      if (!seen.has(c.archetypeId)) {
        seen.add(c.archetypeId);
        ordered.push({ id: c.archetypeId, label: c.archetypeLabel });
      }
    }
    ordered.sort((a, b) => a.label.localeCompare(b.label));
    return ordered;
  }, [cells]);

  // O(1) cell lookup map
  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    for (const c of cells) {
      const key = `${c.archetypeId}|||${c.instrumentTypeId}`;
      if (!m.has(key)) m.set(key, c);
    }
    return m;
  }, [cells]);

  const handleCellClick = useCallback((cell: MatrixCell) => {
    setSelectedCell(cell);
  }, []);

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-secondary)]">
        <Info className="h-5 w-5 mr-2" />
        No capability edges found for the selected venue category.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">Venue category:</label>
        <Select value={venueCategory} onValueChange={setVenueCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VENUE_CATEGORIES.map((vc) => (
              <SelectItem key={vc.value} value={vc.value}>
                {vc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-[var(--color-text-secondary)]">
          {archetypes.length} archetypes × {instrTypes.length} instrument types — {cells.length} unique combinations
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {(["available", "partial", "not_available", "not_registered"] as EdgeStatus[]).map((s) => (
          <span key={s} className={cn("px-2 py-0.5 rounded font-medium", statusColor(s))}>
            {statusLabel(s)}
          </span>
        ))}
        <span className="text-[var(--color-text-secondary)] ml-2">— click a cell for details</span>
      </div>

      {/* Grid scroll wrapper */}
      <div className="overflow-x-auto rounded-md border border-[var(--color-border-primary)]">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-[var(--color-bg-secondary)]">
              <th className="sticky left-0 z-10 bg-[var(--color-bg-secondary)] px-3 py-2 text-left font-medium text-[var(--color-text-secondary)] border-b border-r border-[var(--color-border-primary)] min-w-[200px]">
                Archetype
              </th>
              {instrTypes.map((it) => (
                <th
                  key={it.id}
                  className="px-2 py-2 text-center font-medium text-[var(--color-text-secondary)] border-b border-r border-[var(--color-border-primary)] whitespace-nowrap"
                >
                  {it.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {archetypes.map((arch, rowIdx) => (
              <tr
                key={arch.id}
                className={rowIdx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]"}
              >
                <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-medium text-[var(--color-text-primary)] border-r border-b border-[var(--color-border-primary)] truncate max-w-[280px]">
                  {arch.label}
                </td>
                {instrTypes.map((it) => {
                  const cell = cellMap.get(`${arch.id}|||${it.id}`);
                  if (!cell) {
                    return (
                      <td
                        key={it.id}
                        className="px-1 py-1.5 text-center border-r border-b border-[var(--color-border-primary)]"
                      >
                        <span className="text-[var(--color-text-secondary)]">—</span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={it.id}
                      className="px-1 py-1.5 text-center border-r border-b border-[var(--color-border-primary)]"
                    >
                      <button
                        onClick={() => handleCellClick(cell)}
                        title={`${cell.archetypeLabel} × ${cell.instrumentTypeLabel}: ${statusLabel(cell.status)}\n${cell.edges.length} edge(s)`}
                        className={cn(
                          "inline-block w-full px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-blue)]",
                          statusColor(cell.status),
                        )}
                      >
                        {cell.status === "available"
                          ? "✓"
                          : cell.status === "partial"
                            ? "~"
                            : cell.status === "not_available"
                              ? "✗"
                              : "?"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Data Status cross-link note */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] mt-2">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          Capability says &quot;code supports it&quot;. To check runtime data availability,{" "}
          <button
            onClick={() => onLinkToDataStatus("market-tick-data-service")}
            className="underline text-[var(--color-accent-blue)] hover:opacity-80"
          >
            see Data Status for market-tick-data-service
          </button>
          .
        </span>
      </div>

      {/* Detail panel */}
      <CellDetailPanel cell={selectedCell} onClose={() => setSelectedCell(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gaps & orphans view
// ---------------------------------------------------------------------------

interface GapsViewProps {
  /** Called when the user clicks a Data Status cross-link for a dead-end or orphan row. */
  onLinkToDataStatus: (service: string) => void;
}

function GapsView({ onLinkToDataStatus }: GapsViewProps) {
  const gapSummary = useMemo(() => buildGapSummary(capabilityManifest), []);
  const deadEnds = useMemo(() => buildDeadEndList(capabilityManifest), []);
  const orphans = useMemo(() => buildOrphanList(capabilityManifest), []);
  const { gaps } = capabilityManifest;

  const unbuilt = deadEnds.filter((d) => d.deadEndType === "unbuilt");
  const logical = deadEnds.filter((d) => d.deadEndType === "logical");

  return (
    <div className="space-y-6" data-testid="capability-gaps-panel">
      {/* Gap summary by type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-accent-yellow)]" />
            Gap Summary by Type
          </CardTitle>
          <CardDescription>
            Edges emitted as typed gaps — tells you what kind of work would close each one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {gapSummary.map((row) => (
              <div
                key={row.gapType}
                className="flex items-center justify-between rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-2"
                data-testid={`gap-row-${row.gapType}`}
              >
                <div className="flex items-center gap-3">
                  <code className="text-xs font-mono text-[var(--color-accent-yellow)]">{row.gapType}</code>
                  <span className="text-xs text-[var(--color-text-secondary)]">{row.description}</span>
                </div>
                <span
                  className="text-sm font-semibold text-[var(--color-text-primary)] ml-4"
                  data-testid={`gap-count-${row.gapType}`}
                >
                  {row.count}
                </span>
              </div>
            ))}
          </div>

          {/* Headline stats */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Orphan nodes" value={gaps.orphan_nodes} />
            <StatCard label="Unbuilt dead-ends" value={gaps.unbuilt_dead_ends} />
            <StatCard label="Logical dead-ends" value={gaps.logical_dead_ends} />
            <StatCard label="Not registered total" value={gaps.not_registered_total} />
          </div>
        </CardContent>
      </Card>

      {/* Unbuilt dead-ends */}
      {unbuilt.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-[var(--color-accent-red)]" />
              Unbuilt Dead-Ends ({unbuilt.length})
            </CardTitle>
            <CardDescription>
              Archetypes with not_available edges that are NOT classified as logical — missing adapter, registry, or
              code. Click &quot;Data Status&quot; to check whether the underlying data is present.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--color-bg-secondary)]">
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Archetype
                    </th>
                    <th className="text-right px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Dead-end edges
                    </th>
                    <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Data Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {unbuilt.map((row, idx) => (
                    <tr
                      key={row.archetypeId}
                      className={idx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]"}
                    >
                      <td className="px-3 py-1.5 text-[var(--color-text-primary)]">{row.archetypeLabel}</td>
                      <td className="px-3 py-1.5 text-right text-[var(--color-text-secondary)]">{row.edges.length}</td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => onLinkToDataStatus("market-tick-data-service")}
                          title="Check data availability in Data Status"
                          className="inline-flex items-center gap-1 text-[var(--color-accent-blue)] hover:opacity-80 text-xs"
                          data-testid="gaps-data-status-link"
                        >
                          <ExternalLink className="h-3 w-3" />
                          MTDS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logical dead-ends */}
      {logical.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-[var(--color-text-secondary)]" />
              Logical Dead-Ends ({logical.length})
            </CardTitle>
            <CardDescription>
              Archetypes with not_available edges classified as logical — e.g. options on sports venues. No action
              required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--color-bg-secondary)]">
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Archetype
                    </th>
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logical.map((row, idx) => (
                    <tr
                      key={row.archetypeId}
                      className={idx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]"}
                    >
                      <td className="px-3 py-1.5 text-[var(--color-text-primary)]">{row.archetypeLabel}</td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{row.edges[0]?.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orphan nodes */}
      {orphans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orphan Nodes ({orphans.length})</CardTitle>
            <CardDescription>
              Nodes that appear in no edge — registered in the manifest but not wired into any capability path. Click
              &quot;Data Status&quot; to check data presence for the underlying service.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-[var(--color-bg-secondary)]">
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Node ID
                    </th>
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Label
                    </th>
                    <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Kind
                    </th>
                    <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                      Data Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.map((node, idx) => (
                    <tr
                      key={node.nodeId}
                      className={idx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]"}
                    >
                      <td className="px-3 py-1.5 font-mono text-[var(--color-text-secondary)] truncate max-w-[200px]">
                        {node.nodeId}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--color-text-primary)]">{node.label}</td>
                      <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">{node.kind}</td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          onClick={() => onLinkToDataStatus("market-tick-data-service")}
                          title="Check data availability in Data Status"
                          className="inline-flex items-center gap-1 text-[var(--color-accent-blue)] hover:opacity-80 text-xs"
                          data-testid="gaps-data-status-link"
                        >
                          <ExternalLink className="h-3 w-3" />
                          MTDS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center">
      <div className="text-lg font-semibold text-[var(--color-text-primary)]">{value}</div>
      <div className="text-xs text-[var(--color-text-secondary)]">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources view
// ---------------------------------------------------------------------------

function SourcesView({ onLinkToDataStatus }: { onLinkToDataStatus: (service: string) => void }) {
  const rows = useMemo(() => buildSourcesTable(capabilityManifest), []);

  return (
    <div className="space-y-4" data-testid="capability-sources-table">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--color-accent-blue)]" />
            Data Sources × Mode × Transport
          </CardTitle>
          <CardDescription>
            Static capability: does the code support this source in this mode? Link to Data Status to check whether data
            is actually present at runtime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-[var(--color-bg-secondary)]">
                  <th className="text-left px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Source
                  </th>
                  <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Batch
                  </th>
                  <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Live
                  </th>
                  <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Replay
                  </th>
                  <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Transport
                  </th>
                  <th className="text-center px-3 py-2 border-b border-[var(--color-border-primary)] font-medium text-[var(--color-text-secondary)]">
                    Data Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.sourceId}
                    className={idx % 2 === 0 ? "bg-[var(--color-bg-primary)]" : "bg-[var(--color-bg-secondary)]"}
                  >
                    <td className="px-3 py-1.5 font-medium text-[var(--color-text-primary)]">{row.sourceLabel}</td>
                    <StatusPill status={row.batchStatus} />
                    <StatusPill status={row.liveStatus} />
                    <StatusPill status={row.replayStatus} />
                    <td className="px-3 py-1.5 text-center text-[var(--color-text-secondary)] font-mono">
                      {row.transport}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => onLinkToDataStatus("market-tick-data-service")}
                        title="Open Data Status for market-tick-data-service"
                        className="inline-flex items-center gap-1 text-[var(--color-accent-blue)] hover:opacity-80 text-xs"
                      >
                        <ExternalLink className="h-3 w-3" />
                        MTDS
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>
          <code className="font-mono text-[var(--color-accent-yellow)]">not_registered</code> = live/replay mode
          registry not yet codified in UAC (60 missing_registry gaps in this manifest version). Registry backfill
          tracked in Phase 2 of the capability manifest plan.
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: EdgeStatus }) {
  return (
    <td className="px-1 py-1.5 text-center">
      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium", statusColor(status))}>
        {statusLabel(status)}
      </span>
    </td>
  );
}

// ---------------------------------------------------------------------------
// Verdicts view
// ---------------------------------------------------------------------------

function ArchetypeVerdictRow({ entry }: { entry: VerdictArchetypeSummary }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.not_registered) {
    return (
      <div className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="shrink-0 text-xs text-[var(--color-text-secondary)]">
              not_registered
            </Badge>
            <code className="text-xs font-mono text-[var(--color-text-secondary)] truncate">{entry.archetype}</code>
          </div>
          {entry.not_registered_reason && (
            <span className="text-xs text-[var(--color-text-secondary)] ml-4 truncate max-w-[320px]">
              {entry.not_registered_reason}
            </span>
          )}
        </div>
      </div>
    );
  }

  const hasBlocked = entry.blocked_count > 0;

  return (
    <div className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      <button
        onClick={() => hasBlocked && setExpanded((e) => !e)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-4 py-2 text-left",
          hasBlocked ? "cursor-pointer hover:bg-[var(--color-bg-tertiary)]" : "cursor-default",
        )}
        aria-expanded={hasBlocked ? expanded : undefined}
        data-testid={`verdict-archetype-row-${entry.archetype}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasBlocked ? (
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-red)]" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-green)]" />
          )}
          <code className="text-xs font-mono text-[var(--color-text-primary)] truncate">{entry.archetype}</code>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs">
          <span className="text-[var(--color-accent-green)]">{entry.available_count} avail</span>
          {hasBlocked && <span className="text-[var(--color-accent-red)]">{entry.blocked_count} blocked</span>}
          <span className="text-[var(--color-text-secondary)]">{entry.cell_count} cells</span>
          {hasBlocked && <span className="text-[var(--color-accent-blue)] ml-1">{expanded ? "▲" : "▼"}</span>}
        </div>
      </button>

      {expanded && hasBlocked && (
        <div
          className="border-t border-[var(--color-border-primary)] px-4 py-2 space-y-2"
          data-testid={`verdict-archetype-blocked-${entry.archetype}`}
        >
          {entry.blocked_cells.map((cell, cellIdx) => (
            <div key={cellIdx} className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <code className="font-mono">{cell.venue}</code>
                <span>·</span>
                <code className="font-mono">{cell.instrument_type}</code>
                <span>·</span>
                <code className="font-mono">{cell.instruction_action}</code>
                {cell.leg_id && (
                  <>
                    <span>·</span>
                    <code className="font-mono text-[var(--color-accent-yellow)]">{cell.leg_id}</code>
                  </>
                )}
              </div>
              <div className="pl-2 space-y-0.5">
                {cell.blocked_algos.map((ba, baIdx) => (
                  <div key={baIdx} className="text-xs text-[var(--color-accent-red)]">
                    <code className="font-mono font-medium">{ba.algo}</code>
                    <span className="text-[var(--color-text-secondary)] ml-2">{ba.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerdictsView() {
  const [matrix, setMatrix] = useState<CapabilityVerdictMatrix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    loadVerdictMatrix()
      .then((m) => {
        setMatrix(m);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load verdict matrix");
        setLoading(false);
      });
  }, []);

  const archetypeList = useMemo(() => (matrix ? buildVerdictArchetypeList(matrix) : []), [matrix]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return archetypeList;
    return archetypeList.filter((e) => e.archetype.toLowerCase().includes(q));
  }, [archetypeList, search]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-16 text-[var(--color-text-secondary)]"
        data-testid="verdicts-loading"
      >
        <Info className="h-5 w-5 mr-2 animate-spin" />
        Loading verdict matrix…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-accent-red)]">
        <AlertTriangle className="h-5 w-5 mr-2" />
        {error}
      </div>
    );
  }

  if (!matrix) return null;

  const summary = buildVerdictSummary(matrix);

  return (
    <div className="space-y-6" data-testid="capability-verdicts-view">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center"
          data-testid="verdict-summary-total"
        >
          <div className="text-lg font-semibold text-[var(--color-text-primary)]">
            {summary.total_cells.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">Total cells</div>
        </div>
        <div
          className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center"
          data-testid="verdict-summary-available"
        >
          <div className="text-lg font-semibold text-[var(--color-accent-green)]">
            {summary.available.toLocaleString()}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">Available</div>
        </div>
        <div
          className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center"
          data-testid="verdict-summary-blocked"
        >
          <div className="text-lg font-semibold text-[var(--color-accent-red)]">{summary.blocked.toLocaleString()}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">Blocked</div>
        </div>
        <div
          className="rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-2 text-center"
          data-testid="verdict-summary-not-registered"
        >
          <div className="text-lg font-semibold text-[var(--color-text-secondary)]">{summary.not_registered}</div>
          <div className="text-xs text-[var(--color-text-secondary)]">Not registered</div>
        </div>
      </div>

      {/* Per-archetype drill-down */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[var(--color-accent-red)]" />
            Per-Archetype Verdict Drill-Down
          </CardTitle>
          <CardDescription>
            Each row shows available / blocked counts. Expand a blocked archetype to see which venue × instrument_type ×
            algo combinations are blocked and why.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Filter archetypes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-xs rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-blue)]"
              data-testid="verdict-archetype-filter"
            />
          </div>
          <div className="space-y-1.5">
            {filtered.map((entry) => (
              <ArchetypeVerdictRow key={entry.archetype} entry={entry} />
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-[var(--color-text-secondary)] py-4 text-center">No archetypes match filter.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapabilityTab (top-level export)
// ---------------------------------------------------------------------------

interface CapabilityTabProps {
  /** Called when the user clicks a Data Status cross-link for a specific service. */
  onSelectDataStatus?: (service: string) => void;
}

export function CapabilityTab({ onSelectDataStatus }: CapabilityTabProps) {
  const handleLinkToDataStatus = useCallback(
    (service: string) => {
      onSelectDataStatus?.(service);
    },
    [onSelectDataStatus],
  );

  return (
    <div className="space-y-4" data-testid="capability-tab">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-[var(--color-accent-blue)]" />
            Capability Matrix
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            Static capability SSOT — generated from registries + code. Does not reflect runtime data availability (see
            Data Status for that).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <span>
            {capabilityManifest.nodes.length} nodes / {capabilityManifest.edges.length} edges
          </span>
          <code
            className="font-mono text-[10px] text-[var(--color-text-secondary)] truncate max-w-[120px]"
            title={capabilityManifest.generated_from_commit}
          >
            @{capabilityManifest.generated_from_commit.slice(0, 8)}
          </code>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="matrix" className="w-full">
        <TabsList variant="pill" className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="matrix" className="gap-2" data-testid="capability-matrix-tab-trigger">
            <Grid3x3 className="h-4 w-4" />
            Matrix
          </TabsTrigger>
          <TabsTrigger value="gaps" className="gap-2" data-testid="capability-gaps-tab-trigger">
            <AlertTriangle className="h-4 w-4" />
            Gaps & Orphans
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-2" data-testid="capability-sources-tab-trigger">
            <Database className="h-4 w-4" />
            Sources
          </TabsTrigger>
          <TabsTrigger value="verdicts" className="gap-2" data-testid="capability-verdicts-tab-trigger">
            <ShieldAlert className="h-4 w-4" />
            Verdicts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" data-testid="capability-matrix-view">
          <MatrixView onLinkToDataStatus={handleLinkToDataStatus} />
        </TabsContent>

        <TabsContent value="gaps" data-testid="capability-gaps-view">
          <GapsView onLinkToDataStatus={handleLinkToDataStatus} />
        </TabsContent>

        <TabsContent value="sources" data-testid="capability-sources-view">
          <SourcesView onLinkToDataStatus={handleLinkToDataStatus} />
        </TabsContent>

        <TabsContent value="verdicts" data-testid="capability-verdicts-content">
          <VerdictsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
