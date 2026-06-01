/* =========================================================================
 * Leaf-parquet schema-view modal — writegate Phase 4.B.3
 * -------------------------------------------------------------------------
 * Calls the new GET /api/data-status/leaf-stats endpoint
 * (deployment-api@3b0477a, writegate Phase 4.A.3) to render LIVE per-leaf-
 * parquet stats: row count, per-column non_null + NaN ratio, the
 * available_at envelope, and file size. Distinct from ShardDetailModal's
 * schema tab which renders the DECLARED SchemaContract from UAC.
 *
 * Renders three blocks:
 *   1. Header — gs:// URI + row count + column count + file size +
 *      truncated/oversize hint when applicable.
 *   2. available_at envelope — present/missing badge + min/max + null
 *      count. Missing envelope is the writegate Phase 1A.future
 *      MissingAvailableAt failure mode (every shard's parquet is
 *      contractually required to carry available_at per CLAUDE.md).
 *   3. Per-column table — name, dtype, non_null_count, null_count,
 *      NaN ratio (color-coded amber > 0.10, red > 0.50).
 *
 * Errors render as a single red diagnostic line — `available=false` is
 * the contract for missing-path / corrupt-parquet / read-error cases so
 * the modal never blanks on a 5xx. For path_unresolved the row stays
 * empty + the error_reason is the only content.
 * ========================================================================= */

import { useEffect, useState } from "react";
import {
  fetchLeafParquetStats,
  type LeafParquetStatsResponse,
} from "../api/client";
import { ModalShell } from "./DataStatusDrilldown";

export interface LeafSchemaModalCoord {
  service: string;
  asset_group: string;
  instrument_type: string;
  data_type: string;
  day: string;
  venue?: string | null;
  underlying?: string | null;
  instrument_id?: string | null;
}

function humanBytes(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

// Pure helper exposed for tests — keeps the threshold logic + color
// mapping decoupled from the rendering JSX.
export function nanRatioColor(ratio: number): string {
  if (ratio >= 0.5) return "var(--color-accent-red)";
  if (ratio >= 0.1) return "var(--color-accent-amber)";
  if (ratio > 0) return "var(--color-accent-yellow)";
  return "var(--color-text-muted)";
}

/** Writegate slice (b) Phase 5.5 — completeness colour mapping (inverted from
 * nanRatioColor since higher fraction = better, vs higher NaN ratio = worse).
 * Green ≥ 1.0; yellow 0.99-1.0; amber 0.95-0.99; red < 0.95 (per writegate
 * plan body Phase 5.5 colour spec). */
export function completenessColor(fraction: number | null): string {
  if (fraction === null) return "var(--color-text-muted)";
  if (fraction >= 1.0) return "var(--color-accent-green)";
  if (fraction >= 0.99) return "var(--color-accent-yellow)";
  if (fraction >= 0.95) return "var(--color-accent-amber)";
  return "var(--color-accent-red)";
}

export function formatNanRatio(ratio: number): string {
  if (ratio === 0) return "0%";
  if (ratio < 0.0001) return "<0.01%";
  return `${(ratio * 100).toFixed(2)}%`;
}

export function LeafSchemaModal({
  coord,
  onClose,
}: {
  coord: LeafSchemaModalCoord;
  onClose: () => void;
}) {
  const [data, setData] = useState<LeafParquetStatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchLeafParquetStats({
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
        if (!cancelled) setData(d);
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

  const title = `Leaf parquet · ${coord.venue ?? coord.instrument_type} · ${coord.data_type} · ${coord.day}`;

  if (error) {
    return (
      <ModalShell title={title} onClose={onClose}>
        <div
          className="text-xs text-[var(--color-accent-red)]"
          data-testid="leaf-schema-error"
        >
          Error fetching leaf-stats: {error}
        </div>
      </ModalShell>
    );
  }

  if (!data) {
    return (
      <ModalShell title={title} onClose={onClose}>
        <div className="text-xs" data-testid="leaf-schema-loading">
          Loading parquet stats…
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3" data-testid="leaf-schema-body">
        {/* 1. Header — path + size + row/col counts */}
        <div
          className="text-[10px] font-mono text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] rounded p-2 space-y-0.5"
          data-testid="leaf-schema-header"
        >
          <div className="truncate" title={data.gs_uri ?? "(no path)"}>
            {data.gs_uri ?? "(no path resolved)"}
          </div>
          {!data.available ? (
            <div
              className="text-[var(--color-accent-red)] mt-1"
              data-testid="leaf-schema-unavailable"
            >
              unavailable: {data.error_reason ?? "unknown"}
            </div>
          ) : (
            <div className="flex gap-3 flex-wrap">
              <span data-testid="leaf-schema-row-count">
                rows: {data.row_count.toLocaleString()}
              </span>
              <span data-testid="leaf-schema-col-count">
                cols: {data.column_count}
              </span>
              <span>size: {humanBytes(data.file_size_bytes)}</span>
              {data.truncated && (
                <span
                  className="text-[var(--color-accent-amber)]"
                  data-testid="leaf-schema-truncated"
                  title={`Stats computed from first ${data.truncated_at_rows} rows`}
                >
                  truncated@{data.truncated_at_rows?.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 2. available_at envelope — writegate contract surface */}
        <div data-testid="leaf-schema-available-at-block">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
            available_at envelope
          </div>
          {data.available_at.present ? (
            <div
              className="text-[10px] font-mono space-y-0.5"
              data-testid="leaf-schema-available-at-present"
            >
              <div className="flex gap-3 flex-wrap">
                <span>
                  min:{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {data.available_at.min_iso ?? "—"}
                  </span>
                </span>
                <span>
                  max:{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {data.available_at.max_iso ?? "—"}
                  </span>
                </span>
                <span
                  style={{
                    color: nanRatioColor(
                      data.available_at.null_count > 0 && data.row_count > 0
                        ? data.available_at.null_count / data.row_count
                        : 0,
                    ),
                  }}
                >
                  null_count: {data.available_at.null_count}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="text-[10px] text-[var(--color-accent-red)] font-mono"
              data-testid="leaf-schema-available-at-missing"
              title="Writegate Phase 1A.future MissingAvailableAt failure mode — every shard's parquet must carry available_at per CLAUDE.md."
            >
              MISSING — writegate contract violation (every shard's parquet must
              carry available_at)
            </div>
          )}
        </div>

        {/* 2.b completeness envelope — writegate slice (b) Phase 5.5 surface */}
        <div data-testid="leaf-schema-completeness-block">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
            completeness envelope
          </div>
          {data.completeness.present ? (
            <div
              className="text-[10px] font-mono space-y-0.5"
              data-testid="leaf-schema-completeness-present"
            >
              <div className="flex gap-3 flex-wrap">
                <span>
                  min:{" "}
                  <span
                    style={{
                      color: completenessColor(data.completeness.min_fraction),
                    }}
                  >
                    {data.completeness.min_fraction !== null
                      ? data.completeness.min_fraction.toFixed(3)
                      : "—"}
                  </span>
                </span>
                <span>
                  max:{" "}
                  <span
                    style={{
                      color: completenessColor(data.completeness.max_fraction),
                    }}
                  >
                    {data.completeness.max_fraction !== null
                      ? data.completeness.max_fraction.toFixed(3)
                      : "—"}
                  </span>
                </span>
                <span>
                  mean:{" "}
                  <span
                    style={{
                      color: completenessColor(data.completeness.mean_fraction),
                    }}
                  >
                    {data.completeness.mean_fraction !== null
                      ? data.completeness.mean_fraction.toFixed(3)
                      : "—"}
                  </span>
                </span>
                <span
                  style={{
                    color: nanRatioColor(
                      data.completeness.null_count > 0 && data.row_count > 0
                        ? data.completeness.null_count / data.row_count
                        : 0,
                    ),
                  }}
                >
                  null_count: {data.completeness.null_count}
                </span>
                <span
                  style={{
                    color:
                      data.completeness.incomplete_window_present_count > 0
                        ? "var(--color-accent-amber)"
                        : "var(--color-text-muted)",
                  }}
                  title="Number of rows where the incomplete_window column is non-empty / non-null (i.e. the upstream window had gaps at write-time)."
                >
                  incomplete_window:{" "}
                  {data.completeness.incomplete_window_present_count}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="text-[10px] text-[var(--color-text-muted)] font-mono"
              data-testid="leaf-schema-completeness-absent"
              title="Parquet predates the writegate slice (c) per-service emission-policy rollout (Phase 6.1-6.9). Auto-surfaces once MDPS / features-* / ml-* / strategy / execution start writing `completeness_fraction` + `incomplete_window` columns via publish_with_policy()."
            >
              not yet populated (parquet predates slice (c) per-service
              emission-policy rollout)
            </div>
          )}
        </div>

        {/* 3. Per-column stats table */}
        {data.available && data.columns.length > 0 && (
          <div data-testid="leaf-schema-columns">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
              Per-column live stats
            </div>
            <div className="max-h-96 overflow-auto border border-[var(--color-border-subtle)] rounded">
              <table className="text-[10px] w-full">
                <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="text-left py-1 px-2 font-mono font-medium">
                      name
                    </th>
                    <th className="text-left py-1 px-2 font-mono font-medium">
                      dtype
                    </th>
                    <th className="text-right py-1 px-2 font-mono font-medium">
                      non_null
                    </th>
                    <th className="text-right py-1 px-2 font-mono font-medium">
                      null
                    </th>
                    <th className="text-right py-1 px-2 font-mono font-medium">
                      NaN ratio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.columns.map((col) => (
                    <tr
                      key={col.name}
                      className="border-b border-[var(--color-border-subtle)]"
                      data-testid={`leaf-schema-column-${col.name}`}
                    >
                      <td className="py-0.5 px-2 font-mono whitespace-nowrap">
                        {col.name}
                      </td>
                      <td className="py-0.5 px-2 font-mono text-[var(--color-text-muted)]">
                        {col.dtype}
                      </td>
                      <td className="py-0.5 px-2 font-mono text-right">
                        {col.non_null_count.toLocaleString()}
                      </td>
                      <td className="py-0.5 px-2 font-mono text-right text-[var(--color-text-muted)]">
                        {col.null_count.toLocaleString()}
                      </td>
                      <td
                        className="py-0.5 px-2 font-mono text-right"
                        style={{ color: nanRatioColor(col.nan_ratio) }}
                        data-testid={`leaf-schema-nan-ratio-${col.name}`}
                      >
                        {formatNanRatio(col.nan_ratio)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.available && data.columns.length === 0 && (
          <div className="text-xs italic text-[var(--color-text-muted)]">
            Parquet has zero columns — likely an empty placeholder.
          </div>
        )}
      </div>
    </ModalShell>
  );
}
