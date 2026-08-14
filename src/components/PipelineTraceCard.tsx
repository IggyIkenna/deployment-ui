import { AlertTriangle, CheckCircle2, Loader2, Route, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { InstrumentSearchMatch, PipelineTraceHop, PipelineTraceResponse } from "../api/client";
import { fetchPipelineTrace, searchInstruments } from "../api/client";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const ASSET_GROUP_OPTIONS = ["cefi", "tradfi", "defi", "sports", "prediction"];

const SELECT_CLASSNAME =
  "select-compact flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_BADGE_VARIANT: Record<PipelineTraceHop["status"], "success" | "warning" | "error" | "outline"> = {
  captured: "success",
  empty_confirmed: "outline",
  attempted_failed: "error",
  never_attempted: "warning",
};

function HopStatusIcon({ status }: { status: PipelineTraceHop["status"] }) {
  if (status === "captured") return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent-green)]" />;
  if (status === "attempted_failed") return <XCircle className="h-3.5 w-3.5 text-[var(--color-accent-red)]" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-accent-amber)]" />;
}

/**
 * "Pipeline Trace" — GAP G-TRACE, consuming `GET /data-status/pipeline-trace`
 * (deployment-api `routes/data_status/_pipeline_trace.py`).
 *
 * Threads one (instrument, date) through every pipeline stage
 * (IS -> MTDS -> MDPS -> features-* -> strategy -> execution) and shows each
 * hop's manifest `capture_status`, so an operator can answer "where did this
 * instrument/date get stuck" in one view instead of checking each service's
 * own data-status panel separately. The first non-`captured` hop (in pipeline
 * order) is highlighted as the stuck point.
 */
export function PipelineTraceCard() {
  const [instrument, setInstrument] = useState("");
  const [date, setDate] = useState("");
  const [assetGroup, setAssetGroup] = useState("cefi");
  const [data, setData] = useState<PipelineTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Type-ahead instrument search — hits the same cross-asset-group
  // `GET /data-status/instruments/search` endpoint DataStatusTab.tsx's
  // "Symbol search" box uses (`searchInstruments`), mirroring its debounce
  // (250ms, 2-char floor), stale-response guard (monotonic sequence ref, not
  // just a cleared timer — a slower earlier request could otherwise resolve
  // after a faster later one and clobber it), and loading/empty-state
  // handling. Deliberately does NOT scope the search to the `assetGroup`
  // select below: DataStatusTab's own equivalent box doesn't scope to that
  // page's category filter either (it always searches all five groups), and
  // the whole point here is the operator doesn't need to know an
  // instrument's asset_group before finding it.
  const [searchResults, setSearchResults] = useState<InstrumentSearchMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTruncated, setSearchTruncated] = useState(false);
  // Distinct from "no results" — set true right after a pick (or Enter/Escape
  // dismiss) so the dropdown collapses instead of reopening under the just-
  // populated input; cleared the moment the operator types again. This is
  // the closer analog of DataStatusTab's own `showInstrumentDropdown` gate
  // ("prevents dropdown from reopening after selection") applied to a single
  // combined search+submit field, since the Gap-3 symbol-search box there
  // is a separate widget from its target field and never needs to collapse.
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  const canSubmit = instrument.trim().length > 0 && date.trim().length > 0;
  const showDropdown = !dropdownDismissed && instrument.trim().length >= 2;

  const runInstrumentSearch = useCallback((query: string) => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchTruncated(false);
      setSearchLoading(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      const mySeq = ++searchSeqRef.current;
      setSearchLoading(true);
      try {
        const result = await searchInstruments({ query: trimmed, limit: 50 });
        if (mySeq !== searchSeqRef.current) return; // stale response, discard
        setSearchResults(result.matches);
        setSearchTruncated(result.truncated);
      } catch {
        if (mySeq !== searchSeqRef.current) return;
        setSearchResults([]);
        setSearchTruncated(false);
      } finally {
        if (mySeq === searchSeqRef.current) setSearchLoading(false);
      }
    }, 250);
  }, []);

  const runTrace = useCallback(async () => {
    // Always collapse the dropdown on a trace run (button click or Enter) —
    // otherwise a lingering "No matches" panel from the last keystroke can
    // sit open (z-10) over the result area below.
    setDropdownDismissed(true);
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPipelineTrace({
        instrument: instrument.trim(),
        date: date.trim(),
        asset_group: assetGroup,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline trace");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [instrument, date, assetGroup, canSubmit]);

  // Click-through for a dropdown result. Deliberately builds + fires the
  // trace request directly from the clicked match rather than calling the
  // memoized `runTrace` above after `setInstrument`/`setAssetGroup` — same
  // stale-closure gotcha DataStatusTab.tsx's `handleSymbolSearchInstrumentClick`
  // documents: state updates are async, so `runTrace`'s closure would still
  // see the pre-click `instrument`/`assetGroup` values and silently no-op or
  // trace the wrong instrument if called back-to-back with those setters.
  const handleResultClick = useCallback(
    (match: InstrumentSearchMatch) => {
      const canonicalId = match.canonical_id;
      const ag = match.asset_group.toLowerCase();
      setInstrument(canonicalId);
      setAssetGroup(ag);
      setDropdownDismissed(true);
      const trimmedDate = date.trim();
      if (!trimmedDate) return; // no date yet — leave the field populated, wait for the operator
      setLoading(true);
      setError(null);
      fetchPipelineTrace({ instrument: canonicalId, date: trimmedDate, asset_group: ag })
        .then((res) => setData(res))
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Failed to load pipeline trace");
          setData(null);
        })
        .finally(() => setLoading(false));
    },
    [date],
  );

  return (
    <Card data-testid="pipeline-trace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          <div>
            <CardTitle className="text-base">Pipeline Trace</CardTitle>
            <CardDescription className="text-xs">
              Thread one instrument/date through every pipeline stage (IS→MTDS→MDPS→features→strategy→execution) and see
              per-hop capture status in one call.
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="relative space-y-1 min-w-[16rem]">
            <Label htmlFor="pt-instrument" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Instrument
            </Label>
            <div className="relative">
              <Input
                id="pt-instrument"
                className="h-8 text-xs font-mono"
                placeholder="Search any asset group, or paste an exact canonical ID"
                value={instrument}
                onChange={(ev) => {
                  const value = ev.target.value;
                  setInstrument(value);
                  setDropdownDismissed(false);
                  runInstrumentSearch(value);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") {
                    setDropdownDismissed(true);
                    return;
                  }
                  if (ev.key === "Enter") {
                    // Exact-ID path: an operator who already knows the canonical
                    // ID types/pastes it and hits Enter — same submit the Trace
                    // button drives, no dropdown selection required.
                    ev.preventDefault();
                    setDropdownDismissed(true);
                    void runTrace();
                  }
                }}
                autoComplete="off"
                data-testid="pipeline-trace-instrument-input"
              />
              {searchLoading && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-[var(--color-text-muted)]" />
              )}
            </div>
            {showDropdown && (
              <div
                className="absolute z-10 mt-1 max-h-72 w-[28rem] max-w-[80vw] overflow-y-auto rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] shadow-md"
                data-testid="pipeline-trace-instrument-results"
              >
                {searchResults.length === 0 && !searchLoading && (
                  <div className="px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    No matches. Try a partial substring (e.g. `btc`, `eigenlayer`, `epl`).
                  </div>
                )}
                {searchResults.map((m) => (
                  <div
                    key={`${m.canonical_id}__${m.asset_group}__${m.venue}__${m.instrument_type}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-1.5 border-b border-[var(--color-border-subtle)] last:border-b-0",
                      "hover:bg-[var(--color-bg-hover)] text-xs cursor-pointer",
                    )}
                    data-testid="pipeline-trace-instrument-result"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleResultClick(m)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        handleResultClick(m);
                      }
                    }}
                  >
                    <Badge variant="outline" className="text-[9px] font-mono shrink-0 w-20 justify-center">
                      {m.asset_group}
                    </Badge>
                    <span className="font-mono truncate flex-1 text-[var(--color-text)]" title={m.canonical_id}>
                      {m.canonical_id}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">{m.venue}</span>
                    {m.instrument_type && (
                      <span className="text-[9px] text-[var(--color-text-muted)] font-mono shrink-0 opacity-70">
                        {m.instrument_type}
                      </span>
                    )}
                  </div>
                ))}
                {searchTruncated && (
                  <div className="px-3 py-1.5 text-[10px] text-[var(--color-text-muted)] italic border-t border-[var(--color-border-subtle)]">
                    Showing first 50 matches — refine your query for narrower results.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="pt-date" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Date
            </Label>
            <Input
              id="pt-date"
              type="date"
              className="h-8 text-xs"
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
              data-testid="pipeline-trace-date-input"
            />
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="pt-asset-group" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Asset group
            </Label>
            <select
              id="pt-asset-group"
              className={SELECT_CLASSNAME}
              value={assetGroup}
              onChange={(ev) => setAssetGroup(ev.target.value)}
              data-testid="pipeline-trace-asset-group-select"
            >
              {ASSET_GROUP_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void runTrace()}
            disabled={!canSubmit || loading}
            data-testid="pipeline-trace-run"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Trace
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="pipeline-trace-error">
            {error}
          </div>
        )}
        {!data && !loading && !error && (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="pipeline-trace-empty">
            Enter an instrument, date, and asset group, then click Trace.
          </p>
        )}
        {data && (
          <div data-testid="pipeline-trace-result">
            <div className="flex items-center gap-2 pb-3 text-xs">
              {data.stuck_at ? (
                <Badge variant="warning" data-testid="pipeline-trace-stuck-at">
                  Stuck at: {data.stuck_at}
                </Badge>
              ) : (
                <Badge variant="success" data-testid="pipeline-trace-stuck-at-none">
                  All hops captured
                </Badge>
              )}
            </div>
            <ol className="space-y-1.5" data-testid="pipeline-trace-hops">
              {data.hops.map((hop, idx) => (
                <li
                  key={`${hop.stage}-${hop.service}`}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] px-2 py-1.5"
                  data-testid={`pipeline-trace-hop-${hop.service}`}
                >
                  <span className="text-[10px] text-[var(--color-text-muted)] w-5 text-right">{idx + 1}</span>
                  <HopStatusIcon status={hop.status} />
                  <span className="text-xs font-mono flex-1">{hop.service}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[hop.status]} className="text-[9px]">
                    {hop.status}
                  </Badge>
                  {hop.error_reason && (
                    <span className="text-[10px] text-[var(--color-accent-red)]">{hop.error_reason}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
