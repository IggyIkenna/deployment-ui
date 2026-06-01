/**
 * Live data-status tab — Phase 11.3 design-only scaffold.
 *
 * Plan: `live_pipeline_mtds_mdps_features_2026_05_08.md` Phase 11.3.
 *
 * Renders the live-pipeline view of the availability manifest, pivoted by
 * `pipeline_mode=live_websocket`, with per-shard staleness + degraded
 * columns. Mirrors the shape of {@link DataStatusTab} but reads from the
 * Phase 11.1 `GET /api/data-status/live` endpoint instead of the batch
 * manifest sweep.
 *
 * Implementation status — DESIGN-ONLY SCAFFOLD:
 *
 * 1. The endpoint stub returns an empty list (deployment-api@7d95dc9)
 *    until Phase 5/6 wires the per-asset-group live producers (gated on
 *    `features_repo_consolidation_2026_05_08` Phase 7).
 * 2. This component renders the **empty-state** correctly so the tab can
 *    be wired into the existing tabs surface (per
 *    `deployment_ui_lifecycle_tabs_2026_05_08`) ahead of live data.
 * 3. Full features (heatmap, drill-down to per-shard parquet, "live vs
 *    batch" pivot toggle, Deploy-Missing button per Phase 11.4) land
 *    once the endpoint produces real rows.
 *
 * Reuses existing card / badge primitives — no new design system surface
 * needed for the scaffold. The full tab will additionally re-use:
 *
 * - `TypedReasonBadges` (writegate Phase 4) — per-shard `capture_status`
 *   reason badges.
 * - `FailurePillarStack` (writegate Phase 4) — degraded / stale / missing
 *   pillar breakdown.
 * - `LeafSchemaModal` (writegate Phase 4) — drill-down to leaf parquet
 *   schema view.
 */

import type { ComponentProps, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DeployLiveClusterButton } from "./DeployLiveClusterButton";
import { FailurePillarStack } from "./FailurePillarStack";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

// ---------------------------------------------------------------------------
// Phase 11.1 endpoint contract types — mirror the
// `deployment_api/routes/data_status.py` LiveStatusRow + LiveStatusResponse
// Pydantic models exactly. When Phase 5/6 lands the real producer, lift
// the type to UAC and re-export via the shared `../api/client` surface;
// keeping the inline declaration here as a Phase 11.3 stub avoids
// blocking UI smoke-build on an unmerged UAC contract change.
// ---------------------------------------------------------------------------

export type LiveCaptureStatus =
  | "captured"
  | "empty_confirmed"
  | "attempted_failed"
  | "expected_unattempted";

export interface LiveStatusRow {
  asset_group: string;
  venue: string;
  chain: string | null;
  data_type: string;
  instrument_type: string | null;
  instrument_id: string | null;
  league_id: string | null;
  timeframe: string;
  feature_group: string | null;
  capture_status: LiveCaptureStatus;
  staleness_seconds: number;
  degraded_ratio_60s: number;
  cluster_pct_skipped_60s: number;
  last_candle_emitted_at: string | null;
}

export interface LiveStatusResponse {
  status: "ok";
  rows: LiveStatusRow[];
  asset_groups: string[];
  refreshed_at: string;
}

// ---------------------------------------------------------------------------
// Capture-status badge variant mapping. Reuses the existing UI badge
// surface so the live tab visually parities with DataStatusTab + the
// writegate Phase 4 widgets.
// ---------------------------------------------------------------------------

function captureStatusBadgeVariant(
  status: LiveCaptureStatus,
): ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "captured":
      return "success";
    case "empty_confirmed":
      return "info";
    case "attempted_failed":
      return "error";
    case "expected_unattempted":
      return "warning";
  }
}

const STALENESS_WARN_SECONDS = 30; // alerting tier-1 threshold per codex.
const STALENESS_CRIT_SECONDS = 60; // alerting tier-2 threshold per codex.

function stalenessBadgeVariant(
  seconds: number,
): ComponentProps<typeof Badge>["variant"] {
  if (!Number.isFinite(seconds)) return "error";
  if (seconds >= STALENESS_CRIT_SECONDS) return "error";
  if (seconds >= STALENESS_WARN_SECONDS) return "warning";
  return "success";
}

function formatStaleness(seconds: number): string {
  if (!Number.isFinite(seconds)) return "n/a";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = seconds / 60;
  if (mins < 60) return `${mins.toFixed(1)}m`;
  return `${(mins / 60).toFixed(1)}h`;
}

// ---------------------------------------------------------------------------
// API fetcher (Phase 11.3 stub). Uses the existing `/api` base; full
// surface adopts the cloud-provider toggle once the Phase 5/6 producer
// ships and the response has real rows to paginate / drill into.
// ---------------------------------------------------------------------------

export async function fetchLiveDataStatus(
  assetGroups?: readonly string[],
): Promise<LiveStatusResponse> {
  const params = new URLSearchParams();
  for (const assetGroup of assetGroups ?? []) {
    params.append("asset_group", assetGroup);
  }
  const query = params.toString();
  const url = `/api/data-status/live${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load live data status: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as LiveStatusResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LiveDataStatusTabProps {
  /** Optional asset-group filter; default = all. */
  assetGroups?: readonly string[];
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; response: LiveStatusResponse }
  | { kind: "error"; message: string };

export function LiveDataStatusTab({
  assetGroups,
}: LiveDataStatusTabProps): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetchLiveDataStatus(assetGroups);
      setState({ kind: "loaded", response });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [assetGroups]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Live data status</CardTitle>
            <CardDescription>
              Per-shard live-pipeline status pivoted by{" "}
              <code>pipeline_mode=live_websocket</code>. Sourced from{" "}
              <code>/api/data-status/live</code> (Phase 11.1) joined with the
              per-service Health-API endpoints (Phase 8).
            </CardDescription>
          </div>
          <DeployLiveClusterButton />
        </div>
      </CardHeader>
      <CardContent>
        {state.kind === "idle" || state.kind === "loading" ? (
          <p
            data-testid="live-status-loading"
            className="text-sm text-muted-foreground"
          >
            Loading live-pipeline status…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div
            data-testid="live-status-error"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm"
          >
            <p className="font-medium">Failed to load live data status</p>
            <p className="mt-1 text-muted-foreground">{state.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {state.kind === "loaded" && state.response.rows.length === 0 ? (
          <div
            data-testid="live-status-empty"
            className="rounded-md border border-dashed p-6 text-center"
          >
            <p className="text-sm font-medium">No live shards reporting yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The live pipeline (MTDS → MDPS → features-service) is design-only
              until Phase 4/5/6 implementation lands per
              <code className="mx-1">
                live_pipeline_mtds_mdps_features_2026_05_08
              </code>
              (gated on features-consolidation Phase 7).
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Last refreshed:{" "}
              <time dateTime={state.response.refreshed_at}>
                {state.response.refreshed_at}
              </time>
            </p>
          </div>
        ) : null}

        {state.kind === "loaded" && state.response.rows.length > 0 ? (
          <LiveStatusPopulated response={state.response} />
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Populated-state sub-component — summary panel + per-row table.
// Reuses existing UI badge variants + FailurePillarStack from writegate
// Phase 4 widgets for visual parity with DataStatusTab.
// ---------------------------------------------------------------------------

interface LiveStatusPopulatedProps {
  response: LiveStatusResponse;
}

function LiveStatusPopulated({
  response,
}: LiveStatusPopulatedProps): ReactElement {
  const rows = response.rows;

  // Aggregate counts per capture_status — drives the summary FailurePillarStack
  // (re-using the writegate Phase 4 widget for visual parity).
  const captureBreakdown = useMemo(() => {
    const counts: Record<LiveCaptureStatus, number> = {
      captured: 0,
      empty_confirmed: 0,
      attempted_failed: 0,
      expected_unattempted: 0,
    };
    for (const row of rows) {
      counts[row.capture_status] = (counts[row.capture_status] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  // Map LiveCaptureStatus → FailurePillarKey shape that the stack widget
  // understands. The pillar widget uses its own colour palette; we only
  // supply the counts dict. Per-row pillar attribution requires the
  // per-shard error_reason axis from the manifest (DEFERRED follow-up —
  // surface manifest's `error_reason` column on `LiveStatusRow`); until
  // then attempted_failed rolls up into `failed_other`.
  const failurePillars = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (captureBreakdown.attempted_failed > 0) {
      map.failed_other = captureBreakdown.attempted_failed;
    }
    return map;
  }, [captureBreakdown]);

  const totalRows = rows.length;
  const degradedRows = useMemo(
    () => rows.filter((row) => row.degraded_ratio_60s >= 0.05).length,
    [rows],
  );
  const staleRows = useMemo(
    () =>
      rows.filter((row) => row.staleness_seconds >= STALENESS_WARN_SECONDS)
        .length,
    [rows],
  );

  return (
    <div data-testid="live-status-populated" className="space-y-4">
      <div
        data-testid="live-status-summary"
        className="grid grid-cols-2 gap-4 rounded-md border p-3 text-xs sm:grid-cols-4"
      >
        <div>
          <div className="text-muted-foreground">Total shards</div>
          <div className="text-lg font-semibold">{totalRows}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Captured</div>
          <div className="text-lg font-semibold text-emerald-600">
            {captureBreakdown.captured}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Stale (≥30s)</div>
          <div className="text-lg font-semibold text-amber-600">
            {staleRows}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Degraded (≥5% last 60s)</div>
          <div className="text-lg font-semibold text-orange-600">
            {degradedRows}
          </div>
        </div>
        {captureBreakdown.attempted_failed > 0 ? (
          <div className="col-span-2 sm:col-span-4 flex items-center gap-2">
            <span className="text-muted-foreground">Failure breakdown:</span>
            <FailurePillarStack
              failurePillars={failurePillars}
              testIdPrefix="live-status"
              widthPx={160}
              heightPx={6}
            />
          </div>
        ) : null}
      </div>

      <div
        data-testid="live-status-asset-groups"
        className="flex flex-wrap gap-2"
      >
        {response.asset_groups.map((group) => (
          <Badge key={group} variant="info">
            {group}
          </Badge>
        ))}
      </div>

      <ul
        data-testid="live-status-table"
        className="divide-y rounded-md border"
      >
        {rows.map((row, idx) => (
          <li
            key={`${row.asset_group}-${row.venue}-${row.data_type}-${row.instrument_id ?? row.league_id ?? "shard"}-${row.timeframe}-${idx}`}
            className="flex items-center justify-between gap-4 p-3 text-sm"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {row.asset_group} / {row.venue}
              {row.chain ? ` / ${row.chain}` : ""} / {row.data_type} /{" "}
              {row.instrument_id ?? row.league_id ?? "—"} / {row.timeframe}
            </span>
            <div className="flex items-center gap-2">
              <Badge
                variant={stalenessBadgeVariant(row.staleness_seconds)}
                data-testid={`live-status-staleness-${idx}`}
              >
                {formatStaleness(row.staleness_seconds)}
              </Badge>
              <Badge
                variant={captureStatusBadgeVariant(row.capture_status)}
                data-testid={`live-status-capture-status-${idx}`}
              >
                {row.capture_status}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
