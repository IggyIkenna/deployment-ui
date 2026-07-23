/**
 * Alerts — unified alert traceability across all alert classes (operator requirement 2026-06-10).
 *
 * Consumes GET /api/alerts (unified ledger) rather than /api/repo-ci/alerts (CI/CD-only).
 * Current `kind` values: "alert" | "event" (CI/CD). When INFRA P1 lands
 * (alert_quality_overhaul_2026_06_18.md) non-CI kinds appear automatically:
 * "vm_down" | "consolidator_down" | "git_health" | "worker_liveness" | "data_pipeline".
 *
 * Shows (1) lifecycle STREAMS per (repo, workflow) — the CURRENT state vs the PREVIOUS
 * state, worst-first — and (2) the raw alert timeline with severity + run links. The
 * answer to "how did this reach alerting point and where is it now" without scrollback.
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md (unified ledger UI P1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BellRing, ExternalLink, Radio, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { getUnifiedAlerts, type UnifiedAlertEntry, type UnifiedAlerts } from "../api/client";
import { formatAge } from "../lib/repoCi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";
import { useColumnSort, type ColumnSort } from "../hooks/useColumnSort";
import { compareByColumn } from "../lib/columnSort";
import { FilterSelect } from "../components/filters/FilterSelect";
import { MultiChipFilter, type MultiChipOption } from "../components/filters/MultiChipFilter";
import type { ChipTone } from "../components/filters/chipTone";

function severityTone(entry: UnifiedAlertEntry): string {
  if (entry.severity === "CRITICAL" || entry.conclusion === "failure")
    return "bg-red-500/15 text-red-400 border-red-500/40";
  if (entry.severity === "WARNING") return "bg-amber-500/15 text-amber-400 border-amber-500/40";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/40";
}

/** Map the `kind` discriminator to a compact human label for the domain badge. */
function kindLabel(kind: string): string {
  switch (kind) {
    case "alert":
    case "event":
      return "CI";
    case "vm_down":
      return "VM";
    case "consolidator_down":
      return "CONS";
    case "git_health":
      return "GIT";
    case "worker_liveness":
      return "WRKR";
    case "data_pipeline":
      return "DATA";
    default:
      return kind.toUpperCase().slice(0, 5);
  }
}

/** Lower = more severe (matches the existing "worst first" semantics of the streams card). */
function severityRank(entry: UnifiedAlertEntry): number {
  if (entry.severity === "CRITICAL" || entry.conclusion === "failure") return 0;
  if (entry.severity === "WARNING") return 1;
  return 2;
}

/** The filterable "effective severity" bucket per entry — mirrors severityTone's own fallback
 *  chain (severity, then conclusion, then "info") so the filter chips and the rendered chip
 *  colour never disagree about which bucket a row belongs to. */
function severityBucket(entry: UnifiedAlertEntry): string {
  return entry.severity ?? entry.conclusion ?? "info";
}

function severityBucketTone(bucket: string): ChipTone {
  if (bucket === "CRITICAL" || bucket === "failure") return "red";
  if (bucket === "WARNING") return "yellow";
  return "green";
}

function kindTone(_kind: string): ChipTone {
  return "blue";
}

/**
 * Date-range picker — two native date inputs bounding an inclusive `[alert_from, alert_to]`
 * window, URL-backed. Local to this page (not the shared `filters/` dir): the extracted
 * primitives are `FilterSelect`/`StatusFilterChips`/`useColumnSort`/`compareByColumn` only —
 * Deployments.tsx's own date-range filter stayed local too (a server-side query wired to its own
 * `date_from`/`date_to` backend contract), so this mirrors its UX pattern (atomic clear, no pick
 * blocked by `min`/`max`) without re-editing that file or forcing a shared abstraction over two
 * backends with different contracts (deployments = explicit from/to query; alerts = a `days`-back
 * window, filtered client-side here — see `retentionFloorDate` below).
 */
function AlertDateRangeFilter({
  from,
  to,
  onChangeFrom,
  onChangeTo,
  onClear,
}: {
  from: string;
  to: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
  onClear: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const field =
    "bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] rounded px-1.5 py-1 text-[11px] text-[var(--color-text-primary)]";
  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
      date range
      <input
        type="date"
        aria-label="Alert date range start"
        data-testid="filter-alert-date-from"
        value={from}
        max={to || today}
        onChange={(e) => onChangeFrom(e.target.value)}
        className={field}
      />
      <span className="text-[var(--color-text-tertiary)]">→</span>
      <input
        type="date"
        aria-label="Alert date range end"
        data-testid="filter-alert-date-to"
        value={to}
        min={from}
        max={today}
        onChange={(e) => onChangeTo(e.target.value)}
        className={field}
      />
      {(from || to) && (
        <button
          type="button"
          aria-label="Clear alert date range"
          data-testid="filter-alert-date-clear"
          onClick={onClear}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Must track deployment-api's `_MAX_DAYS` (_repo_ci_alerts.py) — FastAPI validates `days` with
// `le=_MAX_DAYS` server-side, so a request past this is rejected (422), not clamped.
const ALERTS_MAX_DAYS = 30;

/** Timeline column sort keys — timestamp/severity/source/subject (WS-5 Plan B todo 2). */
type AlertSortKey = "timestamp" | "severity" | "source" | "subject";

const ALERT_SORT_COLUMNS: { label: string; key: AlertSortKey }[] = [
  { label: "Time", key: "timestamp" },
  { label: "Severity", key: "severity" },
  { label: "Source", key: "source" },
  { label: "Subject", key: "subject" },
];

/** The comparable value for a timeline column — number or string; compareByColumn's own
 *  null-handling never triggers here (every column has a real value on every alert), so this
 *  never returns null. */
function alertColumnSortValue(entry: UnifiedAlertEntry, key: AlertSortKey): string | number {
  switch (key) {
    case "timestamp":
      return entry.timestamp;
    case "severity":
      return severityRank(entry);
    case "source":
      return kindLabel(entry.kind);
    case "subject":
      return entry.repo.toLowerCase();
  }
}

/** Tie-break for equal column values — the table's own default (newest-first). */
function alertDefaultCmp(a: UnifiedAlertEntry, b: UnifiedAlertEntry): number {
  return b.timestamp.localeCompare(a.timestamp);
}

function ageMin(ts: string): number | null {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : Math.floor((Date.now() - parsed) / 60000);
}

function EntryChip({ entry, testId }: { entry: UnifiedAlertEntry; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${severityTone(entry)}`}
    >
      {entry.severity ?? entry.conclusion ?? "event"}
    </span>
  );
}

function DomainChip({ kind }: { kind: string }) {
  return (
    <span
      data-testid="alert-domain-chip"
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-mono font-medium bg-slate-500/15 text-slate-400 border border-slate-500/40"
      title={`kind: ${kind}`}
    >
      {kindLabel(kind)}
    </span>
  );
}

/** Parse `sort_key`/`sort_dir` off the URL into the shared hook's initial-state shape (once, at
 *  mount) — an unrecognised/missing pair falls back to the table's own default (newest-first). */
function initialSortFromParams(params: URLSearchParams): ColumnSort<AlertSortKey> | null {
  const key = params.get("sort_key");
  const dir = params.get("sort_dir");
  if (
    (key === "timestamp" || key === "severity" || key === "source" || key === "subject") &&
    (dir === "asc" || dir === "desc")
  ) {
    return { key, dir };
  }
  return null;
}

export function AlertsContent() {
  const [data, setData] = useState<UnifiedAlerts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Ref, not state: `load` closes over this with an empty dep array (stable identity for the
  // 60s interval below), so a state read here would always see the initial-render value.
  const loadInFlightRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { sort, onHeaderClick } = useColumnSort<AlertSortKey>(initialSortFromParams(searchParams));

  // URL-backed filter state — parsed fresh from searchParams on every render (cheap: these are
  // small string/Set derivations, and it keeps the filter state and the URL as the single source
  // of truth instead of duplicating it into component state that could drift, mirroring
  // Deployments.tsx's own `kindFilters`/`setParam` pattern).
  const kindFilters = useMemo(() => {
    const raw = searchParams.get("kind");
    return raw ? new Set(raw.split(",").filter(Boolean)) : new Set<string>();
  }, [searchParams]);
  const severityFilters = useMemo(() => {
    const raw = searchParams.get("severity");
    return raw ? new Set(raw.split(",").filter(Boolean)) : new Set<string>();
  }, [searchParams]);
  const repoFilter = searchParams.get("repo") ?? "";
  const serviceFilter = searchParams.get("service") ?? "";
  const alertFromFilter = searchParams.get("alert_from") ?? "";
  const alertToFilter = searchParams.get("alert_to") ?? "";

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toggleKindFilter = useCallback(
    (kind: string) => {
      const next = new Set(kindFilters);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      setParam("kind", Array.from(next).join(","));
    },
    [kindFilters, setParam],
  );

  const toggleSeverityFilter = useCallback(
    (bucket: string) => {
      const next = new Set(severityFilters);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      setParam("severity", Array.from(next).join(","));
    },
    [severityFilters, setParam],
  );

  // Clears BOTH date-range bounds in one atomic update — two sequential `setParam` calls would each
  // race against the same pre-update `prev` snapshot and clobber each other (mirrors Deployments.tsx's
  // own `clearDateRange`).
  const clearAlertDateRange = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("alert_from");
        next.delete("alert_to");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // The backend contract is a `days`-back window ending now (not an arbitrary from/to range —
  // see AlertDateRangeFilter's doc comment above), so a picked `alert_from` translates into how
  // many days back to REQUEST; `alert_to` only narrows the client-side filter over that window
  // (below). Undefined (no `alert_from` picked) lets the backend use its own `_DEFAULT_DAYS`.
  const daysToFetch = useMemo(() => {
    if (!alertFromFilter) return undefined;
    const from = new Date(`${alertFromFilter}T00:00:00Z`);
    if (Number.isNaN(from.getTime())) return undefined;
    const diffDays = Math.ceil((Date.now() - from.getTime()) / 86_400_000) + 1;
    return Math.min(ALERTS_MAX_DAYS, Math.max(1, diffDays));
  }, [alertFromFilter]);

  const load = useCallback(() => {
    // A real /api/alerts response now takes ~240s (single-day alerting-service walk). Without
    // this guard, the 60s auto-refresh interval below — plus the immediate refresh
    // useVisibilityPausedInterval fires on every tab-visibility-regain — would stack multiple
    // concurrent slow requests against a backend that's already measured to OOM under load
    // (deployment_alerts_ingestion_completeness_2026_07_20.md). Skip if one is still in flight.
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setError(null);
    getUnifiedAlerts(daysToFetch)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        loadInFlightRef.current = false;
        setLoading(false);
      });
  }, [daysToFetch]);

  useEffect(() => {
    load();
  }, [load]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(load, 60_000);

  // URL-back the active sort (deep-linkable, plain-routes contract) — a null sort (back to the
  // default newest-first ordering) clears both params rather than writing them empty.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sort) {
          next.set("sort_key", sort.key);
          next.set("sort_dir", sort.dir);
        } else {
          next.delete("sort_key");
          next.delete("sort_dir");
        }
        return next;
      },
      { replace: true },
    );
  }, [sort, setSearchParams]);

  // Filter options are derived from the LOADED alert set (not a hardcoded vocabulary) — a kind/
  // repo/service that never appears in the current window never shows as a dead filter option.
  const kindOptions = useMemo<MultiChipOption[]>(() => {
    if (!data) return [];
    const seen = new Set(data.alerts.map((a) => a.kind));
    return Array.from(seen)
      .sort()
      .map((kind) => ({ value: kind, label: kindLabel(kind), tone: kindTone(kind) }));
  }, [data]);
  const severityOptions = useMemo<MultiChipOption[]>(() => {
    if (!data) return [];
    const seen = new Set(data.alerts.map(severityBucket));
    return Array.from(seen)
      .sort()
      .map((bucket) => ({ value: bucket, label: bucket, tone: severityBucketTone(bucket) }));
  }, [data]);
  const repoOptions = useMemo(() => {
    if (!data) return [{ value: "", label: "All repos" }];
    const seen = new Set(data.alerts.map((a) => a.repo));
    return [
      { value: "", label: "All repos" },
      ...Array.from(seen)
        .sort()
        .map((r) => ({ value: r, label: r })),
    ];
  }, [data]);
  const serviceOptions = useMemo(() => {
    if (!data) return [{ value: "", label: "All services" }];
    const seen = new Set(data.alerts.map((a) => a.workflow_name).filter(Boolean));
    return [
      { value: "", label: "All services" },
      ...Array.from(seen)
        .sort()
        .map((w) => ({ value: w, label: w })),
    ];
  }, [data]);

  // The retention floor honesty check (deployment_alerts_ingestion_completeness_2026_07_20.md todo
  // 8: `_DEFAULT_DAYS = _MAX_DAYS = 30`) — `data.days` is the day window the BACKEND actually served
  // (clamped to its own retention constant), so deriving the floor from it (rather than hardcoding
  // "30" here) means this never drifts out of sync if the backend's retention window changes.
  const retentionFloorDate = useMemo(() => {
    if (!data) return null;
    const floor = new Date();
    floor.setUTCDate(floor.getUTCDate() - (data.days - 1));
    return floor.toISOString().slice(0, 10);
  }, [data]);
  const alertDateRangeOutOfRetention = !!(
    retentionFloorDate &&
    alertFromFilter &&
    alertFromFilter < retentionFloorDate
  );

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alerts.filter(
      (a) =>
        (kindFilters.size === 0 || kindFilters.has(a.kind)) &&
        (severityFilters.size === 0 || severityFilters.has(severityBucket(a))) &&
        (!repoFilter || a.repo === repoFilter) &&
        (!serviceFilter || a.workflow_name === serviceFilter) &&
        (!alertFromFilter || a.timestamp.slice(0, 10) >= alertFromFilter) &&
        (!alertToFilter || a.timestamp.slice(0, 10) <= alertToFilter),
    );
  }, [data, kindFilters, severityFilters, repoFilter, serviceFilter, alertFromFilter, alertToFilter]);

  const sortedAlerts = useMemo(() => {
    if (!sort) return filteredAlerts;
    return [...filteredAlerts].sort((a, b) =>
      compareByColumn(a, b, sort.key, sort.dir, alertColumnSortValue, alertDefaultCmp),
    );
  }, [filteredAlerts, sort]);

  return (
    <div className="space-y-4" data-testid="alerts-page">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-400" /> Alerts — unified traceability
          {data && (
            <span
              data-testid="alerts-source-badge"
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                data.source === "live" || data.source === "mock"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                  : "bg-amber-500/15 text-amber-400 border-amber-500/40"
              }`}
              title={`generated_at: ${data.generated_at}`}
            >
              {data.source.toUpperCase()} · as of {data.generated_at.slice(11, 19)}Z
            </span>
          )}
        </h1>
        <Button onClick={load} variant="ghost" size="sm" disabled={loading} data-testid="alerts-refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error && (
        <div className="p-3 rounded-lg status-error text-sm text-red-400" data-testid="alerts-error">
          {error}
        </div>
      )}
      {data && (
        <>
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 p-2.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/40"
            data-testid="alerts-filter-bar"
          >
            <MultiChipFilter
              testId="filter-kind"
              label="source"
              options={kindOptions}
              selected={kindFilters}
              onToggle={toggleKindFilter}
            />
            <MultiChipFilter
              testId="filter-severity"
              label="severity"
              options={severityOptions}
              selected={severityFilters}
              onToggle={toggleSeverityFilter}
            />
            <FilterSelect
              testId="filter-repo"
              label="repo"
              value={repoFilter}
              options={repoOptions}
              onChange={(v) => setParam("repo", v)}
            />
            <FilterSelect
              testId="filter-service"
              label="service"
              value={serviceFilter}
              options={serviceOptions}
              onChange={(v) => setParam("service", v)}
            />
            <AlertDateRangeFilter
              from={alertFromFilter}
              to={alertToFilter}
              onChangeFrom={(v) => setParam("alert_from", v)}
              onChangeTo={(v) => setParam("alert_to", v)}
              onClear={clearAlertDateRange}
            />
            {(kindFilters.size > 0 ||
              severityFilters.size > 0 ||
              repoFilter ||
              serviceFilter ||
              alertFromFilter ||
              alertToFilter) && (
              <button
                type="button"
                data-testid="filter-clear"
                onClick={() => {
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.delete("kind");
                      next.delete("severity");
                      next.delete("repo");
                      next.delete("service");
                      next.delete("alert_from");
                      next.delete("alert_to");
                      return next;
                    },
                    { replace: true },
                  );
                }}
                className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline"
              >
                clear filters
              </button>
            )}
            <span className="text-[11px] text-[var(--color-text-muted)] ml-auto" data-testid="filter-result-count">
              {filteredAlerts.length} of {data.alerts.length} alerts
            </span>
          </div>
          {alertDateRangeOutOfRetention && retentionFloorDate && (
            <div
              className="p-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-400"
              data-testid="alerts-retention-floor-banner"
            >
              No alerts before {retentionFloorDate} — the ledger retains {data.days} days.
            </div>
          )}
          {/* Streams stays a visible SUMMARY (Layout/"proper view" todo, operator decision A,
              2026-07-21) — a compact single-line-per-stream strip, not a full Card with the same
              visual weight as the Timeline below. No Card/CardHeader/CardContent chrome, smaller
              text, tighter padding; every existing data-testid (`alert-streams`,
              `alert-stream-{repo}-{workflow}`, `stream-previous`/`stream-current`) is unchanged. */}
          <div
            data-testid="alert-streams"
            className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]/40 p-2 space-y-1"
          >
            <div className="text-[11px] font-medium text-[var(--color-text-muted)]" data-testid="alert-streams-label">
              Streams — summary (worst first)
            </div>
            {data.streams.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">No alert streams in the window.</p>
            )}
            {data.streams.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" aria-label="Alert streams">
                  <thead>
                    <tr className="border-b border-[var(--color-border-default)] text-left text-[var(--color-text-muted)]">
                      <th scope="col" className="py-1 pr-2 font-medium whitespace-nowrap">
                        Source
                      </th>
                      <th scope="col" className="py-1 pr-2 font-medium">
                        Previous
                      </th>
                      <th scope="col" className="py-1 pr-2 font-medium">
                        Current
                      </th>
                      <th scope="col" className="py-1 pr-2 font-medium whitespace-nowrap">
                        Age
                      </th>
                      <th scope="col" className="py-1 font-medium text-right whitespace-nowrap">
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.streams.map((stream) => (
                      <tr
                        key={`${stream.repo}/${stream.workflow_name}`}
                        data-testid={`alert-stream-${stream.repo}-${stream.workflow_name}`}
                        className="border-b border-[var(--color-border-default)]/50 align-top hover:bg-[var(--color-bg-secondary)]"
                      >
                        <td className="py-1 pr-2 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <DomainChip kind={stream.current.kind} />
                            <span className="font-mono text-[var(--color-text-primary)]">
                              {stream.repo} / {stream.workflow_name}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-2 max-w-[320px]">
                          {stream.previous ? (
                            <div className="flex items-start gap-1.5">
                              <EntryChip entry={stream.previous} testId="stream-previous" />
                              <span className="text-[var(--color-text-muted)] break-words">
                                {stream.previous.message}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>
                        <td className="py-1 pr-2 max-w-[320px]">
                          <div className="flex items-start gap-1.5">
                            <EntryChip entry={stream.current} testId="stream-current" />
                            <span className="text-[var(--color-text-primary)] break-words">
                              {stream.current.message}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-2 text-[var(--color-text-muted)] whitespace-nowrap">
                          {formatAge(ageMin(stream.current.timestamp))} ago
                        </td>
                        <td className="py-1 text-[var(--color-text-muted)] whitespace-nowrap text-right">
                          {stream.count} event{stream.count === 1 ? "" : "s"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <Card data-testid="alert-timeline">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Alert timeline (newest first)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.alerts.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No alerts persisted yet — the ledger fills as notify-slack posts.
                </p>
              )}
              {data.alerts.length > 0 && filteredAlerts.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]" data-testid="alerts-filter-empty">
                  No alerts match the active filters.
                </p>
              )}
              {filteredAlerts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse" aria-label="Alert timeline">
                    <thead>
                      <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
                        {ALERT_SORT_COLUMNS.map((c) => {
                          const dir = sort?.key === c.key ? sort.dir : undefined;
                          return (
                            <th
                              key={c.key}
                              scope="col"
                              onClick={() => onHeaderClick(c.key)}
                              aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                              data-testid={`alert-col-${c.key}`}
                              className={`py-1.5 pr-3 font-medium cursor-pointer select-none whitespace-nowrap hover:text-[var(--color-text-primary)] ${
                                dir ? "text-[var(--color-text-primary)]" : ""
                              }`}
                            >
                              {c.label}
                              {dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
                            </th>
                          );
                        })}
                        <th scope="col" className="py-1.5 pr-3 font-medium whitespace-nowrap">
                          Workflow
                        </th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">
                          Message
                        </th>
                        <th scope="col" className="py-1.5 font-medium text-right whitespace-nowrap">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAlerts.map((alert, index) => (
                        <tr
                          key={`${alert.timestamp}-${index}`}
                          data-testid={`alert-entry-${index}`}
                          className="border-b border-[var(--color-border-default)]/60 align-top hover:bg-[var(--color-bg-secondary)]"
                        >
                          <td
                            className="py-1.5 pr-3 font-mono text-[var(--color-text-secondary)] whitespace-nowrap"
                            data-testid={`alert-entry-timestamp-${index}`}
                            title={alert.timestamp}
                          >
                            {alert.timestamp.slice(0, 16).replace("T", " ")}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <EntryChip entry={alert} />
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            <DomainChip kind={alert.kind} />
                          </td>
                          <td className="py-1.5 pr-3 font-mono text-[var(--color-text-muted)] whitespace-nowrap">
                            {alert.repo}
                          </td>
                          <td
                            className="py-1.5 pr-3 font-mono text-[var(--color-text-muted)] whitespace-nowrap"
                            data-testid={`alert-entry-workflow-${index}`}
                          >
                            {alert.workflow_name || "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--color-text-primary)] max-w-[520px] break-words">
                            {alert.message}
                          </td>
                          <td className="py-1.5 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-2">
                              {alert.deployment_target && (
                                <Link
                                  to={`/deployments/${encodeURIComponent(alert.deployment_target)}`}
                                  className="inline-flex shrink-0 items-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                                  title={`Open ${alert.deployment_target} in Deployments`}
                                  data-testid={`alert-deployment-link-${index}`}
                                >
                                  <ArrowUpRight className="h-3 w-3" />
                                  <span className="text-xs">deployment</span>
                                </Link>
                              )}
                              {alert.deployment_target && (
                                <button
                                  type="button"
                                  onClick={() => setParam("logs", alert.deployment_target ?? "")}
                                  className="inline-flex shrink-0 items-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                                  title={`Stream logs for ${alert.deployment_target}`}
                                  data-testid={`alert-logs-link-${index}`}
                                >
                                  <Radio className="h-3 w-3" />
                                  <span className="text-xs">logs</span>
                                </button>
                              )}
                              {alert.run_url && (
                                <a
                                  href={alert.run_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
