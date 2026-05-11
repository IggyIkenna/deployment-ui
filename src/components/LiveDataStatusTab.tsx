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

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

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
        <CardTitle>Live data status</CardTitle>
        <CardDescription>
          Per-shard live-pipeline status pivoted by{" "}
          <code>pipeline_mode=live_websocket</code>. Sourced from{" "}
          <code>/api/data-status/live</code> (Phase 11.1) joined with the
          per-service Health-API endpoints (Phase 8).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "idle" || state.kind === "loading" ? (
          <p data-testid="live-status-loading" className="text-sm text-muted-foreground">
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
            <p className="text-sm font-medium">
              No live shards reporting yet.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The live pipeline (MTDS → MDPS → features-service) is design-only
              until Phase 4/5/6 implementation lands per
              <code className="mx-1">live_pipeline_mtds_mdps_features_2026_05_08</code>
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
          <div data-testid="live-status-table" className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {state.response.asset_groups.map((group) => (
                <Badge key={group} variant="info">
                  {group}
                </Badge>
              ))}
            </div>
            {/*
              Full row table lands when Phase 5/6 producers publish real shards.
              The Phase 11.3 scaffold renders the asset-group chip row above so
              the empty-state and populated-state share a stable shell.
            */}
            <ul className="divide-y rounded-md border">
              {state.response.rows.map((row, idx) => (
                <li
                  key={`${row.asset_group}-${row.venue}-${row.data_type}-${row.instrument_id ?? row.league_id ?? "shard"}-${row.timeframe}-${idx}`}
                  className="flex items-center justify-between gap-4 p-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.asset_group} / {row.venue} / {row.data_type} /{" "}
                    {row.timeframe}
                  </span>
                  <Badge>{row.capture_status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
