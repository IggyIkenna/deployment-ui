import { useEffect, useState } from "react";
import {
  buildCsvDownloadUrl,
  fetchBucketCounts,
  fetchInstrumentsForShard,
  fetchShardSchema,
  type BucketCountsResponse,
  type InstrumentsForShardResponse,
  type ShardSchemaResponse,
} from "../api/client";

export interface ShardCoordinate {
  service: string;
  category: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
}

/* =========================================================================
 * Schema modal
 * -------------------------------------------------------------------------
 * Fetches the SchemaContract columns for (category, instrument_type,
 * data_type, [venue]) and renders them. Falls back to a "no contract
 * registered" message for unregistered shards.
 * ========================================================================= */

export function SchemaModal({
  coord,
  onClose,
}: {
  coord: Omit<ShardCoordinate, "day">;
  onClose: () => void;
}) {
  const [schema, setSchema] = useState<ShardSchemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchShardSchema({
      service: coord.service,
      category: coord.category,
      instrument_type: coord.instrument_type,
      data_type: coord.data_type,
      venue: coord.venue,
    })
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    coord.service,
    coord.category,
    coord.instrument_type,
    coord.data_type,
    coord.venue,
  ]);

  return (
    <ModalShell title={`Schema: ${coord.instrument_type} / ${coord.data_type}`} onClose={onClose}>
      {error && (
        <div className="text-xs text-[var(--color-accent-red)]">Error: {error}</div>
      )}
      {!schema && !error && <div className="text-xs">Loading…</div>}
      {schema && (
        <div className="space-y-2">
          <div className="text-xs">
            <span className="text-[var(--color-text-muted)]">Source:</span>{" "}
            <span className="font-mono">{schema.source}</span>
            {schema.symbol_column && (
              <>
                {" · "}
                <span className="text-[var(--color-text-muted)]">symbol_column:</span>{" "}
                <span className="font-mono">{schema.symbol_column}</span>
              </>
            )}
          </div>
          {!schema.registered && (
            <div className="text-xs text-[var(--color-accent-yellow)]">
              No contract registered — the UI will project raw parquet columns.
            </div>
          )}
          {schema.columns.length > 0 && (
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-1 pr-2">name</th>
                  <th className="text-left py-1 pr-2">dtype</th>
                  <th className="text-left py-1 pr-2">nullable</th>
                  <th className="text-left py-1">description</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((col) => (
                  <tr key={col.name} className="border-b border-[var(--color-border-subtle)]">
                    <td className="font-mono py-0.5 pr-2">{col.name}</td>
                    <td className="font-mono py-0.5 pr-2">{col.dtype}</td>
                    <td className="py-0.5 pr-2">{col.nullable ? "yes" : "no"}</td>
                    <td className="text-[var(--color-text-muted)] py-0.5">
                      {col.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </ModalShell>
  );
}

/* =========================================================================
 * Instruments modal (per-day, per-shard drill-down)
 * -------------------------------------------------------------------------
 * For a selected (day, venue, instrument_type, data_type) shard, show the
 * instrument_ids that exist on that day with checkboxes + a "Download CSV"
 * button. A "Show schema" link opens the SchemaModal.
 * ========================================================================= */

export function InstrumentsModal({
  coord,
  onClose,
}: {
  coord: ShardCoordinate;
  onClose: () => void;
}) {
  const [listing, setListing] = useState<InstrumentsForShardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [schemaOpen, setSchemaOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchInstrumentsForShard(coord)
      .then((r) => {
        if (!cancelled) setListing(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [
    coord.service,
    coord.category,
    coord.venue,
    coord.day,
    coord.instrument_type,
    coord.data_type,
  ]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    if (!listing) return;
    setSelected(new Set(listing.instruments.map((i) => i.instrument_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  const downloadUrl = listing
    ? buildCsvDownloadUrl({
        service: coord.service,
        category: coord.category,
        venue: coord.venue,
        day: coord.day,
        instrument_type: coord.instrument_type,
        data_type: coord.data_type,
        instrument_ids: Array.from(selected),
      })
    : null;

  const bundlingHint =
    listing?.bundling === "per_underlying"
      ? "Selecting an underlying downloads the whole bundle parquet for that root."
      : listing?.bundling === "per_condition_id"
        ? "All conditionIds live in one bundle parquet. Each checkbox filters the CSV to that conditionId."
        : "One parquet per symbol — each checkbox downloads that one file.";

  return (
    <ModalShell
      title={`${coord.venue} · ${coord.day} · ${coord.instrument_type}/${coord.data_type}`}
      onClose={onClose}
    >
      {error && (
        <div className="text-xs text-[var(--color-accent-red)]">Error: {error}</div>
      )}
      {!listing && !error && <div className="text-xs">Loading…</div>}
      {listing && (
        <div className="space-y-2">
          <div className="text-xs text-[var(--color-text-muted)]">
            Bundling: <span className="font-mono">{listing.bundling}</span> ·{" "}
            {listing.instruments.length} instrument
            {listing.instruments.length === 1 ? "" : "s"}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)]">{bundlingHint}</div>
          <div className="flex gap-2 text-xs">
            <button className="underline" onClick={selectAll}>
              Select all
            </button>
            <button className="underline" onClick={clearAll}>
              Clear
            </button>
            <button className="underline" onClick={() => setSchemaOpen(true)}>
              Show schema
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto border border-[var(--color-border-subtle)] rounded p-1">
            {listing.instruments.length === 0 && (
              <div className="text-xs italic text-[var(--color-text-muted)] p-2">
                No parquet files found for this shard on {coord.day}.
              </div>
            )}
            {listing.instruments.map((i) => (
              <label
                key={i.instrument_id}
                className="flex items-center gap-2 text-[11px] font-mono py-0.5 px-1 hover:bg-[var(--color-bg-hover)]"
              >
                <input
                  type="checkbox"
                  checked={selected.has(i.instrument_id)}
                  onChange={() => toggle(i.instrument_id)}
                />
                <span className="truncate" title={i.instrument_id}>
                  {i.instrument_id}
                </span>
                <span className="ml-auto text-[var(--color-text-muted)]">
                  {(i.size_bytes / 1024).toFixed(1)} KB
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--color-text-muted)]">
              {selected.size} selected
              {selected.size === 0 &&
                listing.instruments.length > 0 &&
                " (empty = full shard)"}
            </span>
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="px-2 py-1 rounded bg-[var(--color-accent-cyan)] text-[var(--color-bg-primary)] font-medium"
              >
                Download CSV
              </a>
            )}
          </div>
        </div>
      )}
      {schemaOpen && listing && (
        <SchemaModal
          coord={{
            service: coord.service,
            category: coord.category,
            venue: coord.venue,
            instrument_type: coord.instrument_type,
            data_type: coord.data_type,
          }}
          onClose={() => setSchemaOpen(false)}
        />
      )}
    </ModalShell>
  );
}

/* =========================================================================
 * BucketCountsBadge — inline annotation for Polymarket-style venue headers.
 * Shows "(N markets + OTHER)" using lazy fetch via /bucket-counts.
 * ========================================================================= */

export function BucketCountsBadge({
  service,
  category,
  venue,
  day,
  data_type,
  autoLoad = true,
}: {
  service: string;
  category: string;
  venue: string;
  day: string;
  data_type: string;
  autoLoad?: boolean;
}) {
  const [counts, setCounts] = useState<BucketCountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoLoad) return;
    let cancelled = false;
    fetchBucketCounts({ service, category, venue, day, data_type })
      .then((r) => {
        if (!cancelled) setCounts(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [autoLoad, service, category, venue, day, data_type]);

  if (error) return null;
  if (!counts) return null;
  if (counts.named_market_count === 0 && counts.other_market_count === 0) return null;

  const label =
    counts.other_market_count > 0
      ? `(${counts.named_market_count} markets + OTHER: ${counts.other_market_count})`
      : `(${counts.named_market_count} markets)`;

  return (
    <span
      className="text-[8px] text-[var(--color-text-muted)] opacity-80 font-mono"
      title="Distinct named instrument_types + conditionIds inside OTHER bundle"
    >
      {label}
    </span>
  );
}

/* =========================================================================
 * Shared modal shell — fixed overlay + centered card. Minimal styling to
 * match the existing data-status tab dark theme.
 * ========================================================================= */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg p-4 max-w-2xl w-[90vw] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
