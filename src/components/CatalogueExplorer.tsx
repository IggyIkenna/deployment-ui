import { Database, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { InstrumentCatalogueRow } from "../api/client";
import { buildCatalogueCsvDownloadUrl, fetchInstrumentCatalogue } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const PAGE_SIZE = 25;
const DEFAULT_LABEL = "captured instruments (availability-derived)";
const ASSET_GROUP_OPTIONS = ["cefi", "tradfi", "defi", "sports", "prediction"];

/** Shared classes so the native `<select>` visually matches `Input`/Radix `Select`. */
const SELECT_CLASSNAME =
  "flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

function captureStatusBadgeVariant(status: string): "success" | "warning" | "error" | "outline" {
  switch (status) {
    case "captured":
      return "success";
    case "empty_confirmed":
      return "warning";
    case "attempted_failed":
      return "error";
    default:
      return "outline";
  }
}

/**
 * "Catalogue Explorer" — availability-derived instrument catalogue browser
 * (P6 phase-1 of data_status_page_ux_and_canonicalisation_2026_07_16).
 *
 * Deliberately NOT "the catalogue" — deployment-api cannot reach the
 * instruments-service ``InstrumentCatalogReader`` SSOT (T4 — no
 * service→service imports), so every response is labeled "captured
 * instruments (availability-derived)": what the availability manifest has
 * recorded, not what the venue could theoretically list. Renders that label
 * verbatim so operators don't mistake this for a true catalogue browser.
 *
 * Mirrors ``PredictionCatalogueCard``'s useX(...) + loading/error/empty +
 * debounced-search + pagination pattern. "Download CSV" always carries the
 * SAME filters as the on-screen list (search + mvp_only + narrows) so the
 * export never drifts from what's rendered.
 */
export function CatalogueExplorer({ service = "instruments-service" }: { service?: string }) {
  const [assetGroup, setAssetGroup] = useState("cefi");
  const [venueInput, setVenueInput] = useState("");
  const [venue, setVenue] = useState("");
  const [instrumentTypeInput, setInstrumentTypeInput] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [dataTypeInput, setDataTypeInput] = useState("");
  const [dataType, setDataType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [mvpOnly, setMvpOnly] = useState(false);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<InstrumentCatalogueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce the free-text narrows (venue / instrument_type / data_type /
  // search) so a keystroke doesn't fire a request per character; the
  // asset_group select + MVP toggle are discrete and fetch immediately (via
  // their own handlers below, which also reset pagination).
  useEffect(() => {
    const t = setTimeout(() => {
      setVenue(venueInput.trim());
      setInstrumentType(instrumentTypeInput.trim());
      setDataType(dataTypeInput.trim());
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [venueInput, instrumentTypeInput, dataTypeInput, searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInstrumentCatalogue({
        service,
        asset_group: assetGroup,
        venue: venue || undefined,
        instrument_type: instrumentType || undefined,
        data_type: dataType || undefined,
        search: search || undefined,
        mvp_only: mvpOnly,
        limit: PAGE_SIZE,
        offset,
      });
      setRows(data.instruments ?? []);
      setTotal(data.total_count ?? 0);
      setLabel(data.label || DEFAULT_LABEL);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load catalogue");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [service, assetGroup, venue, instrumentType, dataType, search, mvpOnly, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleAssetGroupChange(value: string) {
    setAssetGroup(value);
    setOffset(0);
  }

  function handleMvpOnlyChange(value: boolean) {
    setMvpOnly(value);
    setOffset(0);
  }

  const csvUrl = buildCatalogueCsvDownloadUrl({
    service,
    asset_group: assetGroup,
    venue: venue || undefined,
    instrument_type: instrumentType || undefined,
    data_type: dataType || undefined,
    search: search || undefined,
    mvp_only: mvpOnly,
  });

  const rangeLabel = total === 0 ? "0 of 0" : `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`;

  return (
    <Card data-testid="catalogue-explorer-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Catalogue Explorer</CardTitle>
              <CardDescription className="text-xs" data-testid="catalogue-explorer-label">
                {label}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={csvUrl}
              download
              className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border-default)] px-2 text-xs hover:bg-[var(--color-bg-secondary)]"
              data-testid="catalogue-explorer-download-csv"
              title="Download the on-screen filtered view as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
              data-testid="catalogue-explorer-refresh"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-asset-group" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Asset group
            </Label>
            <select
              id="ce-asset-group"
              className={SELECT_CLASSNAME}
              value={assetGroup}
              onChange={(ev) => handleAssetGroupChange(ev.target.value)}
              data-testid="catalogue-explorer-asset-group-select"
            >
              {ASSET_GROUP_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-venue" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Venue
            </Label>
            <Input
              id="ce-venue"
              className="h-8 text-xs"
              placeholder="optional"
              value={venueInput}
              onChange={(ev) => setVenueInput(ev.target.value)}
              data-testid="catalogue-explorer-venue-input"
            />
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-instrument-type" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Instrument type
            </Label>
            <Input
              id="ce-instrument-type"
              className="h-8 text-xs"
              placeholder="optional"
              value={instrumentTypeInput}
              onChange={(ev) => setInstrumentTypeInput(ev.target.value)}
              data-testid="catalogue-explorer-instrument-type-input"
            />
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-data-type" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Data type
            </Label>
            <Input
              id="ce-data-type"
              className="h-8 text-xs"
              placeholder="optional"
              value={dataTypeInput}
              onChange={(ev) => setDataTypeInput(ev.target.value)}
              data-testid="catalogue-explorer-data-type-input"
            />
          </div>
          <div className="space-y-1 min-w-[12rem] flex-1">
            <Label htmlFor="ce-search" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Search
            </Label>
            <Input
              id="ce-search"
              className="h-8 text-xs"
              placeholder="Search instrument_id…"
              value={searchInput}
              onChange={(ev) => setSearchInput(ev.target.value)}
              data-testid="catalogue-explorer-search"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs pb-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={mvpOnly}
              onChange={(ev) => handleMvpOnlyChange(ev.target.checked)}
              data-testid="catalogue-explorer-mvp-toggle"
            />
            <span className="text-[var(--color-text-muted)]">MVP only</span>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="catalogue-explorer-error">
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="catalogue-explorer-empty">
            No captured instruments match the current filters.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[24rem] overflow-y-auto pr-1">
              <table className="w-full text-xs" data-testid="catalogue-explorer-table">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                    <th className="py-1.5 pr-2 font-medium">Instrument</th>
                    <th className="py-1.5 pr-2 font-medium">Venue</th>
                    <th className="py-1.5 pr-2 font-medium">Type / data_type</th>
                    <th className="py-1.5 pr-2 font-medium">Capture status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.instrument_id}
                      className="border-b border-[var(--color-border-subtle)] last:border-0"
                      data-testid={`catalogue-explorer-row-${row.instrument_id}`}
                    >
                      <td className="py-1.5 pr-2 max-w-[20rem]">
                        <div className="flex items-center gap-1">
                          <span className="font-mono truncate" title={row.instrument_id}>
                            {row.instrument_id}
                          </span>
                          {row.is_mvp && (
                            <Badge
                              variant="outline"
                              className="text-[8px] font-mono shrink-0"
                              data-testid={`catalogue-explorer-mvp-badge-${row.instrument_id}`}
                            >
                              MVP
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {row.venue}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-[10px]">
                        {row.instrument_type}/{row.data_type}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge
                          variant={captureStatusBadgeVariant(row.capture_status)}
                          className="text-[9px] font-mono"
                          title={row.error_reason || undefined}
                        >
                          {row.capture_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2 text-[10px] text-[var(--color-text-muted)]">
              <span data-testid="catalogue-explorer-page-info">{rangeLabel}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  data-testid="catalogue-explorer-prev"
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset + rows.length >= total || loading}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  data-testid="catalogue-explorer-next"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
