import { Database, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CatalogueFilterOptions, InstrumentCatalogueRow } from "../api/client";
import { buildCatalogueCsvDownloadUrl, fetchCatalogueFilterOptions, fetchInstrumentCatalogue } from "../api/client";
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
const EMPTY_FILTER_OPTIONS: Omit<CatalogueFilterOptions, "service" | "asset_group"> = {
  venues: [],
  instrument_types: [],
  data_types: [],
};

export function CatalogueExplorer({ service = "instruments-service" }: { service?: string }) {
  const [assetGroup, setAssetGroup] = useState("cefi");
  // venue / instrument_type / data_type are now discrete dropdown selections
  // (F3) — "" is the "Any" default. Only search remains free-text/debounced.
  const [venue, setVenue] = useState("");
  const [instrumentType, setInstrumentType] = useState("");
  const [dataType, setDataType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [mvpOnly, setMvpOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  // Distinct values for the dropdowns, scoped to the current (service, asset_group).
  const [filterOptions, setFilterOptions] =
    useState<Omit<CatalogueFilterOptions, "service" | "asset_group">>(EMPTY_FILTER_OPTIONS);

  const [rows, setRows] = useState<InstrumentCatalogueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce only the free-text search box (a keystroke shouldn't fire a request
  // per character); the asset_group / venue / instrument_type / data_type selects
  // + MVP toggle are discrete and fetch immediately via their handlers below.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load distinct venue/instrument_type/data_type values for the current
  // (service, asset_group) so the filter dropdowns offer only REAL values (F3).
  // A failed/aborted fetch just leaves the dropdowns at "Any" — never blocks the
  // list. handleAssetGroupChange clears stale options synchronously so a venue
  // from the previous asset group can't briefly appear for the new one.
  useEffect(() => {
    const controller = new AbortController();
    fetchCatalogueFilterOptions({ service, asset_group: assetGroup, signal: controller.signal })
      .then((opts) =>
        // `?? []` guards a malformed/partial response (e.g. an endpoint that
        // returns the wrong shape) — the option lists are always arrays so the
        // `.map` render can never throw; a bad axis just degrades to "Any".
        setFilterOptions({
          venues: opts.venues ?? [],
          instrument_types: opts.instrument_types ?? [],
          data_types: opts.data_types ?? [],
        }),
      )
      .catch(() => {
        /* keep whatever options are current — the narrows still work as free "Any". */
      });
    return () => controller.abort();
  }, [service, assetGroup]);

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
    // A venue/instrument_type/data_type valid for one asset group won't exist in
    // another — reset the narrows and clear the stale dropdown options so they
    // repopulate from the new asset group's catalogue.
    setVenue("");
    setInstrumentType("");
    setDataType("");
    setFilterOptions(EMPTY_FILTER_OPTIONS);
    setOffset(0);
  }

  function handleVenueChange(value: string) {
    setVenue(value);
    setOffset(0);
  }

  function handleInstrumentTypeChange(value: string) {
    setInstrumentType(value);
    setOffset(0);
  }

  function handleDataTypeChange(value: string) {
    setDataType(value);
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
            <select
              id="ce-venue"
              className={SELECT_CLASSNAME}
              value={venue}
              onChange={(ev) => handleVenueChange(ev.target.value)}
              data-testid="catalogue-explorer-venue-select"
            >
              <option value="">Any venue</option>
              {filterOptions.venues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-instrument-type" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Instrument type
            </Label>
            <select
              id="ce-instrument-type"
              className={SELECT_CLASSNAME}
              value={instrumentType}
              onChange={(ev) => handleInstrumentTypeChange(ev.target.value)}
              data-testid="catalogue-explorer-instrument-type-select"
            >
              <option value="">Any type</option>
              {filterOptions.instrument_types.map((it) => (
                <option key={it} value={it}>
                  {it}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="ce-data-type" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Data type
            </Label>
            <select
              id="ce-data-type"
              className={SELECT_CLASSNAME}
              value={dataType}
              onChange={(ev) => handleDataTypeChange(ev.target.value)}
              data-testid="catalogue-explorer-data-type-select"
            >
              <option value="">Any data type</option>
              {filterOptions.data_types.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
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
                    <th className="py-1.5 pr-2 font-medium">Name</th>
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
                      {/* Human-readable name (KRX equities: "Samsung Electronics" next to
                          the bare 6-digit code). Honest em-dash when the instrument carries
                          no display name (its instrument_id is already readable). */}
                      <td
                        className="py-1.5 pr-2 max-w-[16rem]"
                        data-testid={`catalogue-explorer-name-${row.instrument_id}`}
                      >
                        {row.name ? (
                          <span className="truncate" title={row.name}>
                            {row.name}
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-muted)]">—</span>
                        )}
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
