/* =========================================================================
 * Shard-detail modal — unified 4-tab drilldown
 * -------------------------------------------------------------------------
 * Powered by deployment-api `/api/data-status/shard-detail`.  One modal
 * covers CeFi per-symbol shards, grouped bundles (options_chain, dex_swaps),
 * instruments-service reference rows, and sports fixtures.  The category
 * branch is driven by `shard_class` in the response; the UI does not infer.
 * ========================================================================= */

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { fetchShardDetail, type CaptureStatusLiteral, type ShardDetailResponse } from "../api/client";
import { InstrumentsModal, ModalShell } from "./DataStatusDrilldown";
import { ServiceEmissionStateBadge } from "./ServiceEmissionStateBadge";

export interface ShardDetailCoordInput {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue?: string | null;
  underlying?: string | null;
  instrument_id?: string | null;
}

type ShardDetailTab = "schema" | "sample" | "payload" | "download";

function humanBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 60) return `${deltaSec}s ago`;
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)}m ago`;
  if (deltaSec < 86400) return `${Math.round(deltaSec / 3600)}h ago`;
  return `${Math.round(deltaSec / 86400)}d ago`;
}

function captureStatusBadgeColor(status: CaptureStatusLiteral): string {
  switch (status) {
    case "captured":
      return "var(--color-accent-green)";
    case "empty_confirmed":
      return "var(--color-text-muted)";
    case "attempted_failed":
    case "missing":
      return "var(--color-accent-red)";
  }
}

function payloadTabTitle(shardClass: ShardDetailResponse["shard_class"]): string {
  switch (shardClass) {
    case "grouped":
      return "Instruments in this shard";
    case "per_symbol":
      return "Instrument";
    case "reference":
      return "Instrument definitions";
    case "fixtures":
      return "Fixtures";
  }
}

const REFERENCE_ROW_LIMIT = 500;

function renderDictTable(
  rows: Record<string, unknown>[],
  opts: { columns?: string[]; limit?: number } = {},
): ReactElement {
  if (rows.length === 0) {
    return <div className="text-xs italic text-[var(--color-text-muted)] py-2">No rows.</div>;
  }
  const columns =
    opts.columns && opts.columns.length > 0 ? opts.columns : Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const display = opts.limit !== undefined ? rows.slice(0, opts.limit) : rows;
  const truncated = opts.limit !== undefined && rows.length > opts.limit;
  return (
    <div>
      <div className="max-h-96 overflow-auto border border-[var(--color-border-subtle)] rounded">
        <table className="text-[10px] w-full">
          <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
            <tr className="border-b border-[var(--color-border)]">
              {columns.map((c) => (
                <th key={c} className="text-left py-1 px-2 font-mono font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map((row, i) => (
              <tr key={i} className="border-b border-[var(--color-border-subtle)]">
                {columns.map((c) => {
                  const value = row[c];
                  if (value === null || value === undefined) {
                    return (
                      <td key={c} className="py-0.5 px-2 italic text-[var(--color-text-muted)]">
                        NULL
                      </td>
                    );
                  }
                  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
                  return (
                    <td key={c} className="py-0.5 px-2 font-mono whitespace-nowrap" title={text}>
                      {text.length > 80 ? `${text.slice(0, 77)}…` : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && (
        <div className="text-[10px] text-[var(--color-text-muted)] mt-1" data-testid="shard-detail-truncation-note">
          Showing first {opts.limit} of {rows.length} rows.
        </div>
      )}
    </div>
  );
}

export function ShardDetailModal({ coord, onClose }: { coord: ShardDetailCoordInput; onClose: () => void }) {
  const [detail, setDetail] = useState<ShardDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ShardDetailTab>("schema");
  const [csvDownloading, setCsvDownloading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  // Nested nested-modal trigger — reuses InstrumentsModalStandard's search +
  // pagination + multi-select + MVP-toggle CSV flow (DataStatusDrilldown.tsx)
  // for "grouped" shards (many instruments per venue-day-type), which this
  // modal's read-only truncated payload table doesn't offer. Historically
  // this flow was reachable via a now-dead `DataStatusTab` state
  // (`instrumentsModal`) that commit f4a8e4e (2026-04-24) stopped setting
  // when CeFi per-data-type date chips were rerouted to ShardDetailModal —
  // this nested trigger restores reachability. Mirrors the existing
  // schemaOpen nested-modal pattern in DataStatusDrilldown.tsx.
  const [browseInstruments, setBrowseInstruments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchShardDetail({
      service: coord.service,
      asset_group: coord.asset_group,
      instrument_type: coord.instrument_type,
      data_type: coord.data_type,
      day: coord.day,
      venue: coord.venue ?? null,
      underlying: coord.underlying ?? null,
      instrument_id: coord.instrument_id ?? null,
    })
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    coord.service,
    coord.asset_group,
    coord.instrument_type,
    coord.data_type,
    coord.day,
    coord.venue,
    coord.underlying,
    coord.instrument_id,
  ]);

  const title = `${coord.venue ?? coord.instrument_type} · ${coord.data_type} · ${coord.day}`;

  if (error) {
    return (
      <ModalShell title={title} onClose={onClose}>
        <div className="text-xs text-[var(--color-accent-red)]" data-testid="shard-detail-error">
          Error: {error}
        </div>
      </ModalShell>
    );
  }

  if (!detail) {
    return (
      <ModalShell title={title} onClose={onClose}>
        <div className="text-xs" data-testid="shard-detail-loading">
          Loading…
        </div>
      </ModalShell>
    );
  }

  const coreColumns = detail.schema.columns.filter((c) => c.provided_by_venues === null);
  const venueSpecificColumns = detail.schema.columns.filter(
    (c) => c.provided_by_venues !== null && c.provided_by_venues.length > 0,
  );

  const parquetUrl = detail.download_urls.parquet_signed_url;
  const csvUrl = detail.download_urls.csv_projected;
  const missingShard = detail.gcs.capture_status === "missing";

  async function downloadCsv() {
    if (!csvUrl) return;
    setCsvDownloading(true);
    setCsvError(null);
    try {
      const res = await fetch(csvUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = `${coord.data_type}_${coord.day}_${coord.venue ?? "noVenue"}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      a.download = `${safeName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : String(e));
    } finally {
      setCsvDownloading(false);
    }
  }

  function TabButton({ id, label }: { id: ShardDetailTab; label: string }) {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        data-testid={`shard-detail-tab-${id}`}
        className={
          "px-2 py-1 text-xs font-mono border-b-2 " +
          (active
            ? "border-[var(--color-accent-cyan)] text-[var(--color-accent-cyan)]"
            : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]")
        }
      >
        {label}
      </button>
    );
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      {/* GCS details header (always visible) */}
      <div
        className="text-[10px] font-mono text-[var(--color-text-muted)] mb-2 space-y-0.5 border border-[var(--color-border-subtle)] rounded p-2"
        data-testid="shard-detail-gcs"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="px-1.5 py-0.5 rounded border text-[9px]"
            style={{
              borderColor: captureStatusBadgeColor(detail.gcs.capture_status),
              color: captureStatusBadgeColor(detail.gcs.capture_status),
            }}
            data-testid="shard-detail-capture-status"
            data-capture-status={detail.gcs.capture_status}
          >
            {detail.gcs.capture_status}
          </span>
          {/*
           * v8 manifest signals (writegate Phase 4 — surfaced via
           * deployment-api ``ShardGcsMetadata``). Both render as muted
           * placeholders when null/undefined (pre-v8 manifest rows).
           */}
          <ServiceEmissionStateBadge state={detail.gcs.service_emission_state} compact />
          {detail.gcs.pipeline_mode && (
            <span
              className="px-1 py-0 rounded border text-[9px] font-mono text-[var(--color-text-muted)] border-[var(--color-border-subtle)]"
              title={`pipeline_mode=${detail.gcs.pipeline_mode}`}
              data-testid="shard-detail-pipeline-mode"
              data-pipeline-mode={detail.gcs.pipeline_mode}
            >
              {detail.gcs.pipeline_mode}
            </span>
          )}
          <span className="truncate" title={detail.gcs.path ?? ""}>
            {detail.gcs.path ?? "(no path)"}
          </span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <span>size: {humanBytes(detail.gcs.file_size_bytes)}</span>
          <span>rows: {detail.gcs.row_count ?? "—"}</span>
          <span>
            captured:{" "}
            {detail.gcs.captured_at ? `${relativeTime(detail.gcs.captured_at)} (${detail.gcs.captured_at})` : "—"}
          </span>
          <span>shard_class: {detail.shard_class}</span>
        </div>
        {detail.gcs.error_reason && (
          <div
            className="mt-1 p-1 rounded bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)]"
            data-testid="shard-detail-error-reason"
          >
            error: {detail.gcs.error_reason}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--color-border)] mb-2">
        <TabButton id="schema" label="Schema" />
        <TabButton id="sample" label={`Sample rows (${detail.sample_rows.length})`} />
        <TabButton id="payload" label={payloadTabTitle(detail.shard_class)} />
        <TabButton id="download" label="Download" />
      </div>

      {/* Tab content */}
      {tab === "schema" && (
        <div className="space-y-2" data-testid="shard-detail-tab-body-schema">
          {!detail.schema.registered && (
            <div className="text-xs text-[var(--color-accent-yellow)]">
              No contract registered — the UI will project raw parquet columns.
            </div>
          )}
          {detail.schema.message && (
            <div className="text-[10px] text-[var(--color-text-muted)] italic">{detail.schema.message}</div>
          )}
          <div className="text-[10px] text-[var(--color-text-muted)]">
            Source: <span className="font-mono">{detail.schema.source}</span>
            {detail.schema.symbol_column && (
              <>
                {" · "}
                symbol_column: <span className="font-mono">{detail.schema.symbol_column}</span>
              </>
            )}
          </div>

          {/* Core columns */}
          {coreColumns.length > 0 && (
            <div data-testid="shard-detail-core-columns">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                Core columns
              </div>
              <table className="text-[10px] w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-1 pr-2">name</th>
                    <th className="text-left py-1 pr-2">dtype</th>
                    <th className="text-left py-1 pr-2">nullable</th>
                    <th className="text-left py-1 pr-2">required</th>
                    <th className="text-left py-1">description</th>
                  </tr>
                </thead>
                <tbody>
                  {coreColumns.map((col) => (
                    <tr
                      key={col.name}
                      className="border-b border-[var(--color-border-subtle)]"
                      data-testid={`shard-detail-column-${col.name}`}
                    >
                      <td className={"font-mono py-0.5 pr-2 " + (col.required ? "" : "italic")}>{col.name}</td>
                      <td className="font-mono py-0.5 pr-2">{col.dtype}</td>
                      <td className="py-0.5 pr-2">{col.nullable ? "yes" : "no"}</td>
                      <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">
                        {col.required ? "required" : "optional"}
                      </td>
                      <td className="text-[var(--color-text-muted)] py-0.5">{col.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Venue-specific columns */}
          {venueSpecificColumns.length > 0 && (
            <div data-testid="shard-detail-venue-columns">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1 mt-2">
                Venue-specific columns
              </div>
              <table className="text-[10px] w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-1 pr-2">name</th>
                    <th className="text-left py-1 pr-2">dtype</th>
                    <th className="text-left py-1 pr-2">nullable</th>
                    <th className="text-left py-1 pr-2">required</th>
                    <th className="text-left py-1 pr-2">provided by</th>
                    <th className="text-left py-1">description</th>
                  </tr>
                </thead>
                <tbody>
                  {venueSpecificColumns.map((col) => (
                    <tr
                      key={col.name}
                      className="border-b border-[var(--color-border-subtle)]"
                      data-testid={`shard-detail-column-${col.name}`}
                    >
                      <td className={"font-mono py-0.5 pr-2 " + (col.required ? "" : "italic")}>{col.name}</td>
                      <td className="font-mono py-0.5 pr-2">{col.dtype}</td>
                      <td className="py-0.5 pr-2">{col.nullable ? "yes" : "no"}</td>
                      <td className="py-0.5 pr-2 text-[var(--color-text-muted)]">
                        {col.required ? "required" : "optional"}
                      </td>
                      <td className="py-0.5 pr-2">
                        <span
                          className="inline-block text-[9px] font-mono px-1 py-0.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)]"
                          data-testid={`shard-detail-venue-pill-${col.name}`}
                        >
                          {(col.provided_by_venues ?? []).join(", ")}
                        </span>
                      </td>
                      <td className="text-[var(--color-text-muted)] py-0.5">{col.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {coreColumns.length === 0 && venueSpecificColumns.length === 0 && (
            <div className="text-xs italic text-[var(--color-text-muted)]">No columns declared.</div>
          )}
        </div>
      )}

      {tab === "sample" && (
        <div data-testid="shard-detail-tab-body-sample">
          {detail.sample_rows.length === 0 ? (
            <div className="text-xs italic text-[var(--color-text-muted)] py-2">
              No rows — shard is empty or missing.
            </div>
          ) : (
            renderDictTable(detail.sample_rows, {
              columns: detail.schema.columns.map((c) => c.name),
            })
          )}
        </div>
      )}

      {tab === "payload" && (
        <div data-testid="shard-detail-tab-body-payload" className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {payloadTabTitle(detail.shard_class)}
          </div>
          {detail.shard_class === "grouped" &&
            detail.payload_grouped &&
            renderDictTable(detail.payload_grouped.instrument_list)}
          {detail.shard_class === "grouped" && detail.coord.venue && (
            <button
              type="button"
              data-testid="shard-detail-browse-instruments"
              onClick={() => setBrowseInstruments(true)}
              className="text-xs underline text-[var(--color-accent-cyan)] hover:text-[var(--color-text-primary)]"
            >
              Browse &amp; search all instruments →
            </button>
          )}
          {detail.shard_class === "per_symbol" && (
            <div className="text-xs font-mono p-2 rounded border border-[var(--color-border-subtle)]">
              <div>
                instrument_id: <span className="font-mono">{coord.instrument_id ?? "(none)"}</span>
              </div>
              <div>
                instrument_type: <span className="font-mono">{coord.instrument_type}</span>
              </div>
              <div>
                venue: <span className="font-mono">{coord.venue ?? "—"}</span>
              </div>
            </div>
          )}
          {detail.shard_class === "reference" &&
            detail.payload_reference &&
            renderDictTable(detail.payload_reference.instrument_definitions as Record<string, unknown>[], {
              limit: REFERENCE_ROW_LIMIT,
            })}
          {detail.shard_class === "fixtures" &&
            detail.payload_fixtures &&
            renderDictTable(
              (detail.payload_fixtures.fixtures as Record<string, unknown>[]).map((fx) => ({
                ...fx,
                markets: Array.isArray(fx.markets) ? (fx.markets as unknown[]).join(", ") : (fx.markets as unknown),
              })),
              {
                columns: ["home_team", "away_team", "kickoff_ts", "markets"],
              },
            )}
        </div>
      )}

      {tab === "download" && (
        <div data-testid="shard-detail-tab-body-download" className="space-y-3 text-xs">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="shard-detail-download-parquet"
              onClick={() => {
                if (parquetUrl) window.open(parquetUrl, "_blank");
              }}
              disabled={!parquetUrl || missingShard}
              title={
                !parquetUrl || missingShard ? "shard not present — nothing to download" : "Open signed parquet URL"
              }
              className="px-3 py-1.5 text-xs rounded border border-[var(--color-accent-cyan)] text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)] hover:text-[var(--color-bg-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Download parquet
            </button>
            <button
              type="button"
              data-testid="shard-detail-download-csv"
              onClick={downloadCsv}
              disabled={!csvUrl || missingShard || csvDownloading}
              title={!csvUrl || missingShard ? "shard not present — nothing to download" : "Download the projected CSV"}
              className="px-3 py-1.5 text-xs rounded border border-[var(--color-accent-green)] text-[var(--color-accent-green)] hover:bg-[var(--color-accent-green)] hover:text-[var(--color-bg-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {csvDownloading ? "Downloading…" : "Download CSV (projected)"}
            </button>
          </div>
          {csvError && (
            <div className="text-[var(--color-accent-red)]" data-testid="shard-detail-csv-error">
              CSV download failed: {csvError}
            </div>
          )}
          <div className="text-[10px] text-[var(--color-text-muted)] italic">
            CSV contains the columns declared in the schema — venue-specific columns that aren&apos;t present for this
            shard are omitted.
          </div>
        </div>
      )}
      {browseInstruments && detail.coord.venue && (
        <InstrumentsModal
          coord={{
            service: detail.coord.service,
            asset_group: detail.coord.asset_group,
            venue: detail.coord.venue,
            day: detail.coord.day,
            instrument_type: detail.coord.instrument_type,
            data_type: detail.coord.data_type,
          }}
          onClose={() => setBrowseInstruments(false)}
        />
      )}
    </ModalShell>
  );
}
