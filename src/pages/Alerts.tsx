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

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BellRing, ExternalLink, RefreshCw } from "lucide-react";
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getUnifiedAlerts()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

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

  const filteredAlerts = useMemo(() => {
    if (!data) return [];
    return data.alerts.filter(
      (a) =>
        (kindFilters.size === 0 || kindFilters.has(a.kind)) &&
        (severityFilters.size === 0 || severityFilters.has(severityBucket(a))) &&
        (!repoFilter || a.repo === repoFilter) &&
        (!serviceFilter || a.workflow_name === serviceFilter),
    );
  }, [data, kindFilters, severityFilters, repoFilter, serviceFilter]);

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
            {(kindFilters.size > 0 || severityFilters.size > 0 || repoFilter || serviceFilter) && (
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
          <Card data-testid="alert-streams">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Streams — current vs previous state (worst first)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.streams.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">No alert streams in the window.</p>
              )}
              {data.streams.map((stream) => (
                <div
                  key={`${stream.repo}/${stream.workflow_name}`}
                  className="flex items-center gap-2 text-sm flex-wrap"
                  data-testid={`alert-stream-${stream.repo}-${stream.workflow_name}`}
                >
                  <DomainChip kind={stream.current.kind} />
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {stream.repo} / {stream.workflow_name}
                  </span>
                  {stream.previous && (
                    <>
                      <EntryChip entry={stream.previous} testId="stream-previous" />
                      <span className="text-[var(--color-text-muted)]">→</span>
                    </>
                  )}
                  <EntryChip entry={stream.current} testId="stream-current" />
                  <span className="text-[var(--color-text-muted)]">
                    {formatAge(ageMin(stream.current.timestamp))} ago · {stream.count} event
                    {stream.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
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
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] pb-1 border-b border-[var(--color-border-default)]">
                  <span className="w-[46px] shrink-0" aria-hidden="true" />
                  {ALERT_SORT_COLUMNS.map((c) => {
                    const dir = sort?.key === c.key ? sort.dir : undefined;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onHeaderClick(c.key)}
                        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                        data-testid={`alert-col-${c.key}`}
                        className={`shrink-0 select-none hover:text-[var(--color-text-primary)] ${
                          dir ? "text-[var(--color-text-primary)] font-medium" : ""
                        }`}
                      >
                        {c.label}
                        {dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {sortedAlerts.map((alert, index) => (
                <div
                  key={`${alert.timestamp}-${index}`}
                  className="flex items-start gap-2 text-sm"
                  data-testid={`alert-entry-${index}`}
                >
                  <DomainChip kind={alert.kind} />
                  <EntryChip entry={alert} />
                  <span
                    className="font-mono text-[var(--color-text-secondary)] shrink-0"
                    data-testid={`alert-entry-timestamp-${index}`}
                    title={alert.timestamp}
                  >
                    {alert.timestamp.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="font-mono text-[var(--color-text-muted)] shrink-0">{alert.repo}</span>
                  {alert.workflow_name && (
                    <span
                      className="font-mono text-[var(--color-text-muted)] shrink-0"
                      data-testid={`alert-entry-workflow-${index}`}
                    >
                      {alert.workflow_name}
                    </span>
                  )}
                  <span className="text-[var(--color-text-primary)]">{alert.message}</span>
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
                  {alert.run_url && (
                    <a href={alert.run_url} target="_blank" rel="noreferrer" className="text-[var(--color-text-muted)]">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
      {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
