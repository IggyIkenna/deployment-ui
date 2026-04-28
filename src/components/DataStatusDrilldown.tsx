import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCsvDownloadUrl,
  fetchBucketCounts,
  fetchBundlePreview,
  fetchInstrumentsForShard,
  fetchShardInfo,
  fetchShardSchema,
  retryFailedShard,
  type BucketCountsResponse,
  type BundlePreviewResponse,
  type InstrumentsForShardResponse,
  type ShardInfoResponse,
  type ShardInstrumentEntry,
  type ShardSchemaResponse,
} from "../api/client";

// Phase C: visual badge + retry affordance for capture_status rows.
type CaptureStatusValue = "captured" | "empty_confirmed" | "attempted_failed";

function captureStatusColor(status: CaptureStatusValue | undefined): string {
  switch (status) {
    case "empty_confirmed":
      return "var(--color-text-muted)";
    case "attempted_failed":
      return "var(--color-accent-red)";
    case "captured":
    default:
      return "var(--color-accent-green)";
  }
}

function captureStatusLabel(status: CaptureStatusValue | undefined): string {
  switch (status) {
    case "empty_confirmed":
      return "empty";
    case "attempted_failed":
      return "failed";
    case "captured":
    default:
      return "captured";
  }
}

function CaptureStatusBadge({
  status,
  errorReason,
  attemptedAt,
}: {
  status: CaptureStatusValue | undefined;
  errorReason?: string;
  attemptedAt?: string;
}) {
  const tooltip = [
    `capture_status: ${status ?? "captured"}`,
    errorReason ? `error: ${errorReason}` : null,
    attemptedAt ? `attempted_at: ${attemptedAt}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
      style={{
        borderColor: captureStatusColor(status),
        color: captureStatusColor(status),
      }}
      title={tooltip}
      data-testid={`capture-status-badge-${status ?? "captured"}`}
      data-capture-status={status ?? "captured"}
    >
      {captureStatusLabel(status)}
    </span>
  );
}

export interface ShardCoordinate {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_type: string;
  data_type: string;
}

// Page size for the InstrumentsModal — matches the backend DEFAULT_INSTRUMENT_LIMIT.
const PAGE_SIZE = 50;

// Lightweight client-side sanity check mirroring
// deployment_api.services.data_status_drilldown._is_valid_instrument_id.
// We only reject obviously malformed blobs so the server can still own the
// authoritative validation.
function isPlausibleInstrumentId(candidate: string): boolean {
  const s = candidate.trim();
  if (s.length === 0) return false;
  if (/\s/.test(s)) return false;
  if (s.includes(",")) return false;
  return true;
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
      asset_group: coord.asset_group,
      instrument_type: coord.instrument_type,
      data_type: coord.data_type,
      venue: coord.venue,
    })
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === "string"
                ? e
                : (() => {
                    try {
                      return JSON.stringify(e);
                    } catch {
                      return String(e);
                    }
                  })();
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    coord.service,
    coord.asset_group,
    coord.instrument_type,
    coord.data_type,
    coord.venue,
  ]);

  return (
    <ModalShell
      title={`Schema: ${[coord.instrument_type, coord.data_type].filter(Boolean).join(" / ") || coord.data_type || "(unknown)"}`}
      onClose={onClose}
    >
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
 * ShardDetailModal has moved to `./ShardDetailModal.tsx` so it can be
 * unit-tested in isolation (coverage thresholds exclude this drilldown
 * file by policy — see vitest.config.ts).
 * ========================================================================= */


/* =========================================================================
 * Instruments modal (per-day, per-shard drill-down)
 * -------------------------------------------------------------------------
 * For a selected (day, venue, instrument_type, data_type) shard, show the
 * instrument_ids that exist on that day with checkboxes + a "Download CSV"
 * button. A "Show schema" link opens the SchemaModal.
 * ========================================================================= */

function InstrumentsModalStandard({
  coord,
  onClose,
}: {
  coord: ShardCoordinate;
  onClose: () => void;
}) {
  // Paginated / searchable state for the normal flow.
  const [listing, setListing] = useState<InstrumentsForShardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [schemaOpen, setSchemaOpen] = useState(false);

  // Search + pagination.
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  // Accumulated instruments across "Load more" clicks when search is empty.
  const [loadedInstruments, setLoadedInstruments] = useState<ShardInstrumentEntry[]>([]);

  // Paste-instrument-id input (skips list flow entirely).
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Instrument-type disambiguation. DataStatusTab guesses from data_type,
  // which misses CeFi venues that partition by instrument_type (perpetual
  // vs options_chain). We fetch /shard-info once per venue+day and let the
  // user pick when multiple types exist.
  const [shardInfo, setShardInfo] = useState<ShardInfoResponse | null>(null);
  const [activeInstrumentType, setActiveInstrumentType] = useState<string>(
    coord.instrument_type,
  );

  // Debounce the search input — only fire when >= 2 chars.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const s = searchInput.trim();
    if (s.length === 0) {
      debounceRef.current = setTimeout(() => setDebouncedSearch(""), 100);
      return;
    }
    if (s.length < 2) return; // hold off until the user types enough
    debounceRef.current = setTimeout(() => setDebouncedSearch(s), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset pagination whenever the search term changes.
  useEffect(() => {
    setOffset(0);
    setLoadedInstruments([]);
  }, [debouncedSearch]);

  // Reset everything when the coordinate changes (modal re-open).
  useEffect(() => {
    setSelected(new Set());
    setOffset(0);
    setLoadedInstruments([]);
    setSearchInput("");
    setDebouncedSearch("");
    setPasteInput("");
    setPasteError(null);
    setActiveInstrumentType(coord.instrument_type);
    setShardInfo(null);
  }, [
    coord.service,
    coord.asset_group,
    coord.venue,
    coord.day,
    coord.instrument_type,
    coord.data_type,
  ]);

  // Resolve the actual instrument_types present on this venue+day. If the
  // caller passed a type that doesn't exist on disk (common: guess fell
  // back to data_type), switch to the recommended one.
  useEffect(() => {
    let cancelled = false;
    fetchShardInfo({
      service: coord.service,
      asset_group: coord.asset_group,
      venue: coord.venue,
      day: coord.day,
      data_type: coord.data_type,
    })
      .then((info) => {
        if (cancelled) return;
        setShardInfo(info);
        const known = info.instrument_types.map((t) => t.name);
        if (!known.includes(activeInstrumentType) && info.recommended_instrument_type) {
          setActiveInstrumentType(info.recommended_instrument_type);
        }
      })
      .catch(() => {
        // Non-fatal — we fall back to the caller's guess.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    coord.service,
    coord.asset_group,
    coord.venue,
    coord.day,
    coord.data_type,
  ]);

  // Fetch the current page.
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchInstrumentsForShard({
      service: coord.service,
      asset_group: coord.asset_group,
      venue: coord.venue,
      day: coord.day,
      instrument_type: activeInstrumentType,
      data_type: coord.data_type,
      limit: PAGE_SIZE,
      offset,
      search: debouncedSearch || undefined,
    })
      .then((r) => {
        if (cancelled) return;
        setListing(r);
        // Append for "Load more" — replace for search or offset=0.
        if (offset === 0 || debouncedSearch) {
          setLoadedInstruments(r.instruments);
        } else {
          setLoadedInstruments((prev) => {
            const seen = new Set(prev.map((p) => p.instrument_id));
            const merged = [...prev];
            for (const i of r.instruments) {
              if (!seen.has(i.instrument_id)) merged.push(i);
            }
            return merged;
          });
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === "string"
                ? e
                : (() => {
                    try {
                      return JSON.stringify(e);
                    } catch {
                      return String(e);
                    }
                  })();
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    coord.service,
    coord.asset_group,
    coord.venue,
    coord.day,
    coord.instrument_type,
    coord.data_type,
    offset,
    debouncedSearch,
  ]);

  const isBundled = listing?.bundling === "per_underlying";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(loadedInstruments.map((i) => i.instrument_id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function loadMore() {
    setOffset((prev) => prev + PAGE_SIZE);
  }

  function submitPaste() {
    const candidate = pasteInput.trim();
    if (!isPlausibleInstrumentId(candidate)) {
      setPasteError("Invalid instrument_id — no spaces, commas, or newlines allowed.");
      return;
    }
    setPasteError(null);
    const url = buildCsvDownloadUrl({
      service: coord.service,
      asset_group: coord.asset_group,
      venue: coord.venue,
      day: coord.day,
      instrument_type: activeInstrumentType,
      data_type: coord.data_type,
      instrument_ids: [candidate],
    });
    // Trigger download via a hidden link — avoids a navigation away from the UI.
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const downloadUrl = listing
    ? buildCsvDownloadUrl({
      service: coord.service,
      asset_group: coord.asset_group,
      venue: coord.venue,
      day: coord.day,
      instrument_type: activeInstrumentType,
      data_type: coord.data_type,
      instrument_ids: Array.from(selected),
    })
    : null;

  // Active coordinate used for downstream children (bundle rows, schema
  // modal) — reflects the picker choice when the caller's guess was wrong.
  const effectiveCoord: ShardCoordinate = {
    ...coord,
    instrument_type: activeInstrumentType,
  };

  // Type-picker UI: show whenever we discovered >1 instrument_type on the
  // shard. For single-type shards the picker is hidden (just informational).
  const multiType = (shardInfo?.instrument_types.length ?? 0) > 1;
  const typePicker = multiType ? (
    <label className="flex items-center gap-2 text-[11px]">
      <span className="text-[var(--color-text-muted)]">instrument_type:</span>
      <select
        value={activeInstrumentType}
        onChange={(e) => {
          setActiveInstrumentType(e.target.value);
          setOffset(0);
          setLoadedInstruments([]);
          setSelected(new Set());
        }}
        className="px-1.5 py-0.5 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)] font-mono"
      >
        {shardInfo!.instrument_types.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({t.bundling})
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const bundlingHint =
    listing?.bundling === "per_underlying"
      ? "Bundled by underlying — one file per underlying contains all strikes / expiries / legs."
      : listing?.bundling === "per_condition_id"
        ? "All conditionIds live in one bundle parquet. Each checkbox filters the CSV to that conditionId."
        : "One parquet per symbol — each checkbox downloads that one file.";

  const totalCount = listing?.total_count ?? 0;
  const rangeStart = loadedInstruments.length === 0 ? 0 : offset === 0 ? 1 : offset + 1;
  const rangeEnd = offset + loadedInstruments.length;

  // If bundled, render the bundle variant (per-underlying rows with Download buttons + preview).
  if (isBundled) {
    return (
      <ModalShell
        title={`${coord.venue} · ${coord.day} · ${activeInstrumentType}/${coord.data_type}`}
        onClose={onClose}
      >
        {error && (
          <div className="text-xs text-[var(--color-accent-red)]">Error: {error}</div>
        )}
        {!listing && !error && <div className="text-xs">Loading…</div>}
        {listing && (
          <div className="space-y-2">
            {typePicker}
            <div className="text-xs text-[var(--color-text-muted)]">
              Bundling: <span className="font-mono">{listing.bundling}</span> ·{" "}
              {totalCount} underlying{totalCount === 1 ? "" : "s"}
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)]">
              {bundlingHint}
            </div>
            <div className="flex gap-2 text-xs">
              <button className="underline" onClick={() => setSchemaOpen(true)}>
                Show schema
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto border border-[var(--color-border-subtle)] rounded p-1">
              {loadedInstruments.length === 0 && (
                <div className="text-xs italic text-[var(--color-text-muted)] p-2">
                  No bundle parquets found for {coord.day}.
                </div>
              )}
              {loadedInstruments.map((i) => (
                <BundleRow key={i.instrument_id} coord={effectiveCoord} instrument={i} />
              ))}
            </div>
            {listing.has_more && (
              <div className="flex justify-center">
                <button
                  className="text-xs underline"
                  onClick={loadMore}
                  type="button"
                >
                  Load more ({totalCount - loadedInstruments.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
        {schemaOpen && listing && (
          <SchemaModal
            coord={{
              service: coord.service,
              asset_group: coord.asset_group,
              venue: coord.venue,
              instrument_type: activeInstrumentType,
              data_type: coord.data_type,
            }}
            onClose={() => setSchemaOpen(false)}
          />
        )}
      </ModalShell>
    );
  }

  // Normal (per_symbol / per_condition_id) flow — search + paginate + multi-select CSV.
  return (
    <ModalShell
      title={`${coord.venue} · ${coord.day} · ${activeInstrumentType}/${coord.data_type}`}
      onClose={onClose}
    >
      {error && (
        <div className="text-xs text-[var(--color-accent-red)]">Error: {error}</div>
      )}
      {!listing && !error && <div className="text-xs">Loading…</div>}
      {listing && (
        <div className="space-y-2">
          {/* Header: totals + bundling hint */}
          <div className="text-xs">
            <span className="font-medium">{totalCount.toLocaleString()}</span>
            {" market"}
            {totalCount === 1 ? "" : "s"}
            {totalCount > loadedInstruments.length && (
              <>
                {" — "}
                <span>
                  showing {rangeStart}-{rangeEnd} (search to narrow)
                </span>
              </>
            )}
            {" · "}
            <span className="text-[var(--color-text-muted)]">
              bundling: <span className="font-mono">{listing.bundling}</span>
            </span>
          </div>
          {typePicker}
          <div className="text-[11px] text-[var(--color-text-muted)]">{bundlingHint}</div>

          {/* Search + paste row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex flex-col gap-0.5">
              <span className="text-[var(--color-text-muted)]">Search instrument_id</span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="type >= 2 chars"
                className="px-1.5 py-1 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)] font-mono text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[var(--color-text-muted)]">Paste instrument_id</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitPaste();
                  }}
                  placeholder="paste exact ID then Enter"
                  className="flex-1 px-1.5 py-1 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-subtle)] font-mono text-[11px]"
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-[var(--color-accent-cyan)] text-[var(--color-bg-primary)] font-medium"
                  onClick={submitPaste}
                >
                  Download
                </button>
              </div>
              {pasteError && (
                <span className="text-[10px] text-[var(--color-accent-red)]">
                  {pasteError}
                </span>
              )}
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 text-xs">
            <button className="underline" onClick={selectAll}>
              Select visible
            </button>
            <button className="underline" onClick={clearAll}>
              Clear
            </button>
            <button className="underline" onClick={() => setSchemaOpen(true)}>
              Show schema
            </button>
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto border border-[var(--color-border-subtle)] rounded p-1">
            {loadedInstruments.length === 0 && (
              <div className="text-xs italic text-[var(--color-text-muted)] p-2">
                {debouncedSearch
                  ? `No matches for "${debouncedSearch}".`
                  : `No parquet files found for this shard on ${coord.day}.`}
              </div>
            )}
            {loadedInstruments.map((i) => {
              const status = (i.capture_status ?? "captured") as CaptureStatusValue;
              return (
                <div
                  key={i.instrument_id}
                  className="flex items-center gap-2 text-[11px] font-mono py-0.5 px-1 hover:bg-[var(--color-bg-hover)]"
                  data-testid={`shard-row-${i.instrument_id}`}
                  data-capture-status={status}
                >
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(i.instrument_id)}
                      onChange={() => toggle(i.instrument_id)}
                    />
                    <span className="truncate" title={i.instrument_id}>
                      {i.instrument_id}
                    </span>
                  </label>
                  <CaptureStatusBadge
                    status={status}
                    errorReason={i.error_reason}
                    attemptedAt={i.attempted_at}
                  />
                  {status === "attempted_failed" && (
                    <RetryShardButton
                      service={effectiveCoord.service}
                      asset_group={effectiveCoord.asset_group}
                      venue={effectiveCoord.venue}
                      day={effectiveCoord.day}
                      instrument_id={i.instrument_id}
                    />
                  )}
                  <span className="text-[var(--color-text-muted)]">
                    {(i.size_bytes / 1024).toFixed(1)} KB
                  </span>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {listing.has_more && (
            <div className="flex justify-center">
              <button className="text-xs underline" onClick={loadMore} type="button">
                Load more ({totalCount - loadedInstruments.length} remaining)
              </button>
            </div>
          )}

          {/* Footer: selection + download */}
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--color-text-muted)]">
              {selected.size} selected
              {selected.size === 0 && loadedInstruments.length > 0 && " (empty = full shard)"}
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
            asset_group: coord.asset_group,
            venue: coord.venue,
            instrument_type: activeInstrumentType,
            data_type: coord.data_type,
          }}
          onClose={() => setSchemaOpen(false)}
        />
      )}
    </ModalShell>
  );
}

/** Delegates instruments-service to {@link InstrumentsServiceShardModal} so hooks in the default path are never skipped. */
export function InstrumentsModal({
  coord,
  onClose,
}: {
  coord: ShardCoordinate;
  onClose: () => void;
}) {
  if (coord.service === "instruments-service") {
    return <InstrumentsServiceShardModal coord={coord} onClose={onClose} />;
  }
  return <InstrumentsModalStandard coord={coord} onClose={onClose} />;
}

/* =========================================================================
 * Bundle row — per-underlying entry with a single download button and an
 * optional "Preview symbols inside" expander. Used for options_chain /
 * futures_chain / combo shards where each parquet bundles many strikes /
 * expiries / legs under one underlying root.
 * ========================================================================= */

function BundleRow({
  coord,
  instrument,
}: {
  coord: ShardCoordinate;
  instrument: ShardInstrumentEntry;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<BundlePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const downloadUrl = useMemo(
    () =>
      buildCsvDownloadUrl({
        service: coord.service,
        asset_group: coord.asset_group,
        venue: coord.venue,
        day: coord.day,
        instrument_type: coord.instrument_type,
        data_type: coord.data_type,
        // Bundled shards expect the underlying's instrument_id — the
        // server maps this to the one bundle parquet.
        instrument_ids: [instrument.instrument_id],
      }),
    [coord, instrument.instrument_id],
  );

  function togglePreview() {
    if (!previewOpen && !preview && !previewError) {
      // Lazy fetch on first expand. Note: the backend preview endpoint
      // always returns the first underlying in the listing — good enough
      // for single-underlying bundles, and a reasonable sample for the
      // rest since columns are shared within a bundle.
      fetchBundlePreview({
        service: coord.service,
        asset_group: coord.asset_group,
        venue: coord.venue,
        day: coord.day,
        instrument_type: coord.instrument_type,
        data_type: coord.data_type,
        limit: 20,
      })
        .then((r) => setPreview(r))
        .catch((e: Error) => setPreviewError(e.message));
    }
    setPreviewOpen((p) => !p);
  }

  return (
    <div className="py-1 px-1 border-b border-[var(--color-border-subtle)] last:border-b-0">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-mono font-medium truncate" title={instrument.instrument_id}>
          {instrument.instrument_id}
        </span>
        <span className="text-[var(--color-text-muted)] text-[10px]">
          {(instrument.size_bytes / 1024).toFixed(1)} KB
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className="text-[10px] underline text-[var(--color-text-muted)]"
          onClick={togglePreview}
        >
          {previewOpen ? "Hide symbols" : "Preview symbols inside"}
        </button>
        <a
          href={downloadUrl}
          className="px-2 py-0.5 rounded bg-[var(--color-accent-cyan)] text-[var(--color-bg-primary)] font-medium text-[10px]"
        >
          Download {instrument.instrument_id} bundle
        </a>
      </div>
      {previewOpen && (
        <div className="mt-1 ml-2 pl-2 border-l border-[var(--color-border-subtle)]">
          {previewError && (
            <div className="text-[10px] text-[var(--color-accent-red)]">
              Error: {previewError}
            </div>
          )}
          {!preview && !previewError && (
            <div className="text-[10px] text-[var(--color-text-muted)]">Loading…</div>
          )}
          {preview && preview.symbols.length === 0 && (
            <div className="text-[10px] italic text-[var(--color-text-muted)]">
              {preview.message ?? "No symbols found."}
            </div>
          )}
          {preview && preview.symbols.length > 0 && (
            <div className="flex flex-wrap gap-1 text-[10px] font-mono">
              {preview.symbols.map((s) => (
                <span
                  key={s}
                  className="px-1 py-0.5 rounded bg-[var(--color-bg-secondary)]"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * instruments-service variant — low-cardinality reference data, one CSV per
 * day. Skip the list-and-select dance entirely.
 * ========================================================================= */

function InstrumentsServiceShardModal({
  coord,
  onClose,
}: {
  coord: ShardCoordinate;
  onClose: () => void;
}) {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const downloadUrl = buildCsvDownloadUrl({
    service: coord.service,
    asset_group: coord.asset_group,
    venue: coord.venue,
    day: coord.day,
    instrument_type: coord.instrument_type,
    data_type: coord.data_type,
    instrument_ids: [], // empty = full shard
  });
  return (
    <ModalShell
      title={`${coord.venue} · ${coord.day} · ${coord.instrument_type}/${coord.data_type}`}
      onClose={onClose}
    >
      <div className="space-y-3 text-xs">
        <div className="text-[var(--color-text-muted)]">
          Instruments reference data is low-cardinality — one file per day per venue.
        </div>
        <div className="flex gap-2">
          <a
            href={downloadUrl}
            className="px-3 py-1.5 rounded bg-[var(--color-accent-cyan)] text-[var(--color-bg-primary)] font-medium"
          >
            Download day CSV
          </a>
          <button
            type="button"
            className="underline"
            onClick={() => setSchemaOpen(true)}
          >
            Show schema
          </button>
        </div>
      </div>
      {schemaOpen && (
        <SchemaModal
          coord={{
            service: coord.service,
            asset_group: coord.asset_group,
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
  asset_group,
  venue,
  day,
  data_type,
  autoLoad = true,
}: {
  service: string;
  asset_group: string;
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
    fetchBucketCounts({ service, asset_group, venue, day, data_type })
      .then((r) => {
        if (!cancelled) setCounts(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.message
              : typeof e === "string"
                ? e
                : (() => {
                    try {
                      return JSON.stringify(e);
                    } catch {
                      return String(e);
                    }
                  })();
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [autoLoad, service, asset_group, venue, day, data_type]);

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

export function ModalShell({
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


// ---------------------------------------------------------------------------
// Phase C retry affordance — "Retry" button per attempted_failed shard row.
// Wraps a confirm() dialog around the deploy-trigger POST so the user can't
// accidentally spin up a VM by double-clicking.
// ---------------------------------------------------------------------------

function RetryShardButton({
  service,
  asset_group,
  venue,
  day,
  instrument_id,
}: {
  service: string;
  asset_group: string;
  venue: string;
  day: string;
  instrument_id: string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<"idle" | "ok" | "err">("idle");
  const [resultMessage, setResultMessage] = useState<string>("");

  async function onRetry() {
    const confirmed = window.confirm(
      `Retry ${instrument_id} on ${day} (${service} / ${venue})?\n\n` +
      "This re-triggers the adapter with force=true and can spin up a VM.",
    );
    if (!confirmed) return;
    setPending(true);
    setResult("idle");
    try {
      const resp = await retryFailedShard({ service, asset_group, venue, day });
      const depId = resp.deployment?.deployment_id ?? "";
      setResult("ok");
      setResultMessage(
        depId ? `queued (deployment_id=${depId})` : resp.message ?? "queued",
      );
    } catch (err) {
      setResult("err");
      setResultMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={pending}
      data-testid={`retry-shard-button-${instrument_id}`}
      data-retry-status={result}
      title={resultMessage || "Retry this failed shard"}
      className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-accent-red)] text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)] hover:text-[var(--color-bg-primary)] disabled:opacity-50"
    >
      {pending ? "…" : result === "ok" ? "Retried ✓" : result === "err" ? "Retry failed" : "Retry"}
    </button>
  );
}
