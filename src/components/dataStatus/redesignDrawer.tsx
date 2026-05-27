/**
 * Drilldown drawer for the redesigned Data Status tab. Ported from the
 * prototype's `drawer.jsx`. The sub-axis breakdown is wired to the REAL
 * hierarchical drilldown endpoint (via `fetchDrilldownLevel`); the
 * ag/primary/date/cell summaries read the already-fetched grid `ds`.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchDrilldownLevel, type AxisValueCell } from "./dataStatusModel";
import { getHierarchicalDrilldown, type ReasonSummary } from "../../api/client";
import {
  mapStatusToCell,
  type AgData,
  type CellStats,
  type ServiceDataset,
  type VenueCompletion,
} from "./redesignData";
import { groupReasonSummary, reasonMeta, REASON_ORDER } from "./reasonCategory";
import { Icons } from "./redesignIcons";
import { CoverageStack } from "./redesignSummary";
import {
  addDays,
  axisLabel,
  cls,
  fmtDateShort,
  fmtNumber,
  ymd,
} from "./redesignUtil";

/** One-line headline from grouped reason counts. */
function reasonHeadline(summary: ReasonSummary | undefined): string {
  const g = groupReasonSummary(summary);
  const parts: string[] = [];
  if (g.captured) parts.push(`${fmtNumber(g.captured)} captured`);
  if (g.empty) parts.push(`${fmtNumber(g.empty)} empty`);
  if (g.failed) parts.push(`${fmtNumber(g.failed)} failed`);
  if (g.phantom) parts.push(`${fmtNumber(g.phantom)} phantom`);
  if (g.pending) parts.push(`${fmtNumber(g.pending)} pending`);
  return parts.length ? parts.join(" · ") : "no rows";
}

const REASON_TONE_COLOR: Record<string, string> = {
  captured: "var(--color-accent-green)",
  empty: "var(--color-text-muted)",
  failed: "var(--color-accent-red)",
  partial: "var(--color-accent-amber)",
  missing: "var(--color-text-tertiary)",
};

/** Date-level completion block for one venue (primary value). */
function CompletionBlock({ meta }: { meta: VenueCompletion }) {
  const pct = Math.max(0, Math.min(100, meta.completionPct));
  const tone = pct >= 95 ? "good" : pct >= 85 ? "warn" : ("bad" as const);
  const barColor =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : "var(--color-accent-red)";
  const shownMissing = meta.missingDates.slice(0, 30);
  const moreMissing = meta.missingDatesTotal - shownMissing.length;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Completion</h3>
        <span
          className="font-mono text-xs"
          style={{ marginLeft: "auto", color: barColor, fontWeight: 600 }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="card-body" style={{ padding: 14 }}>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--color-bg-tertiary)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: barColor,
            }}
          />
        </div>
        <div
          className="row"
          style={{ marginTop: 10, gap: 18, flexWrap: "wrap" }}
        >
          <StatGroup
            label="Days with data"
            value={fmtNumber(meta.datesFound)}
            tone="good"
          />
          <StatGroup
            label="Days remaining"
            value={fmtNumber(meta.datesMissing)}
            tone={meta.datesMissing > 0 ? "warn" : null}
          />
        </div>
        {meta.venueStart && (
          <div className="text-xs muted" style={{ marginTop: 8 }}>
            venue data starts {meta.venueStart}
          </div>
        )}
        {meta.missingDataTypes.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>
              Missing data_types
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {meta.missingDataTypes.map((dt) => (
                <span key={dt} className="badge badge-error badge-mono">
                  {dt}
                </span>
              ))}
            </div>
          </div>
        )}
        {shownMissing.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="text-xs muted" style={{ marginBottom: 4 }}>
              Missing dates
            </div>
            <div
              className="row"
              style={{ gap: 5, flexWrap: "wrap", lineHeight: 1.6 }}
            >
              {shownMissing.map((d) => (
                <span
                  key={d}
                  className="font-mono text-xs"
                  style={{ color: "var(--color-accent-amber)" }}
                >
                  {d}
                </span>
              ))}
              {moreMissing > 0 && (
                <span className="text-xs muted">+{moreMissing} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Why" panel — fetches the drilldown reason_summary for one venue slice and
 * renders it as a stacked bar + per-category list. */
function WhyPanel({
  ds,
  ag,
  primaryAxis,
  primaryValue,
}: {
  ds: ServiceDataset;
  ag: string;
  primaryAxis: string;
  primaryValue: string;
}) {
  const [summary, setSummary] = useState<ReasonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Depend on PRIMITIVES (service/start/end), not the whole `ds` object —
  // an unstable `ds` identity (React StrictMode double-invoke / parent
  // re-render) would otherwise re-run the effect and abort its own in-flight
  // fetch, surfacing a spurious "unavailable".
  const { service, start, end } = ds;
  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setLoading(true);
    setError(false);
    getHierarchicalDrilldown({
      service,
      // Canonical lowercase asset_group (workspace SSOT) — also keeps the
      // backend index-read cache keyed consistently with turbo/grid so we
      // don't pay a second cold read for the CEFI-vs-cefi case variant.
      asset_group: ag.toLowerCase(),
      start_date: start,
      end_date: end,
      filters: { [primaryAxis]: primaryValue },
      expand_to_depth: 1,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setSummary(res.reason_summary ?? {});
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Any abort (however the fetch layer surfaces it) is not an error.
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [service, start, end, ag, primaryAxis, primaryValue]);

  const ordered = REASON_ORDER.map((id) => ({
    id,
    count: summary?.[id] ?? 0,
  })).filter((r) => r.count > 0);
  const total = ordered.reduce((s, r) => s + r.count, 0);
  const hasBreakdown = summary != null && Object.keys(summary).length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Why</h3>
        <span className="text-xs muted" style={{ marginLeft: "auto" }}>
          {loading
            ? "loading…"
            : error
              ? "unavailable"
              : reasonHeadline(summary ?? undefined)}
        </span>
      </div>
      <div className="card-body" style={{ padding: 14 }}>
        {loading &&
          (() => {
            // Instant coarse breakdown from the turbo cell (captured/empty/
            // failed) while the categorised reason_summary loads — the
            // drilldown reads the full manifest index (~10s cold) so we show
            // SOMETHING immediately rather than a blank spinner.
            const cell = ds.agData[ag]?.byPrimary?.[primaryValue];
            const coarse = cell
              ? [
                  { k: "captured", v: cell.captured, c: REASON_TONE_COLOR.captured },
                  { k: "empty", v: cell.empty + cell["known-empty"], c: REASON_TONE_COLOR.empty },
                  { k: "failed", v: cell.failed, c: REASON_TONE_COLOR.failed },
                ].filter((s) => s.v > 0)
              : [];
            const cTotal = coarse.reduce((s, x) => s + x.v, 0);
            return (
              <>
                {cTotal > 0 && (
                  <div
                    style={{
                      display: "flex",
                      height: 10,
                      borderRadius: 5,
                      overflow: "hidden",
                      background: "var(--color-bg-tertiary)",
                    }}
                  >
                    {coarse.map((s) => (
                      <span
                        key={s.k}
                        title={`${s.k}: ${fmtNumber(s.v)}`}
                        style={{ width: `${(s.v / cTotal) * 100}%`, background: s.c }}
                      />
                    ))}
                  </div>
                )}
                <div className="muted text-xs" style={{ marginTop: cTotal > 0 ? 8 : 0 }}>
                  Categorising failures… (reading the manifest index)
                </div>
              </>
            );
          })()}
        {!loading && error && (
          <div className="muted text-xs">
            Could not load the reason breakdown for this slice.
          </div>
        )}
        {!loading && !error && !hasBreakdown && (
          <div className="muted text-xs">
            Slice too large for a reason breakdown — narrow the filter (pick a
            data_type or date range) to see why.
          </div>
        )}
        {!loading && !error && hasBreakdown && total > 0 && (
          <>
            <div
              style={{
                display: "flex",
                height: 10,
                borderRadius: 5,
                overflow: "hidden",
                background: "var(--color-bg-tertiary)",
              }}
            >
              {ordered.map((r) => {
                const meta = reasonMeta(r.id);
                return (
                  <span
                    key={r.id}
                    title={`${meta.label}: ${fmtNumber(r.count)}`}
                    style={{
                      width: `${(r.count / total) * 100}%`,
                      background: REASON_TONE_COLOR[meta.tone],
                    }}
                  />
                );
              })}
            </div>
            <div className="col" style={{ gap: 4, marginTop: 10 }}>
              {ordered.map((r) => {
                const meta = reasonMeta(r.id);
                return (
                  <div
                    key={r.id}
                    className="row"
                    style={{ gap: 8, alignItems: "center" }}
                    title={meta.hint}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: REASON_TONE_COLOR[meta.tone],
                        flexShrink: 0,
                      }}
                    />
                    <span className="text-xs" style={{ flex: 1 }}>
                      {meta.label}
                    </span>
                    <span className="font-mono text-xs muted">
                      {fmtNumber(r.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type DrillEntry =
  | { kind: "ag"; ag: string }
  | { kind: "primary"; ag: string; primaryValue: string }
  | { kind: "date"; ag: string; date: string }
  | { kind: "cell"; ag: string; primaryValue: string; date: string };

export interface DrillStack {
  stack: DrillEntry[];
  open: (e: DrillEntry) => void;
  push: (e: DrillEntry) => void;
  popTo: (i: number) => void;
  close: () => void;
  isOpen: boolean;
}

export function useDrillStack(): DrillStack {
  const [stack, setStack] = useState<DrillEntry[]>([]);
  return {
    stack,
    open: (e) => setStack([e]),
    push: (e) => setStack((s) => [...s, e]),
    popTo: (i) => setStack((s) => s.slice(0, i + 1)),
    close: () => setStack([]),
    isOpen: stack.length > 0,
  };
}

function crumbLabel(e: DrillEntry): string {
  if (e.kind === "ag") return e.ag.toUpperCase();
  if (e.kind === "primary") return `${e.ag.toUpperCase()}/${e.primaryValue}`;
  if (e.kind === "date") return e.date;
  return `${e.primaryValue} · ${e.date}`;
}

function StatGroup({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad" | null;
}) {
  const color =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : tone === "bad"
          ? "var(--color-accent-red)"
          : "var(--color-text-primary)";
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="text-xs muted">{label}</span>
      <span
        className="font-mono"
        style={{ fontSize: 16, fontWeight: 500, color }}
      >
        {value}
      </span>
    </div>
  );
}

/** Real sub-axis breakdown from the hierarchical drilldown endpoint. */
function SubAxisBreakdown({
  ds,
  ag,
  primaryValue,
  date,
}: {
  ds: ServiceDataset;
  ag: string;
  primaryValue: string;
  date?: string;
}) {
  const a = ds.agData[ag];
  const subAxis = a.subAxes[0];
  const [cells, setCells] = useState<AxisValueCell[] | null>(null);
  const [error, setError] = useState(false);

  // Primitive deps (not the whole `ds`) + abort guard — same fix as WhyPanel:
  // an unstable `ds` identity re-ran this effect and aborted its own fetch,
  // and the bare `.catch(setError)` turned that abort into a spurious
  // "unavailable".
  const { service: dsService, start: dsStart, end: dsEnd } = ds;
  const primary = a.primary;
  useEffect(() => {
    if (!subAxis) return;
    const controller = new AbortController();
    setCells(null);
    setError(false);
    const filters: Record<string, string> = { [primary]: primaryValue };
    fetchDrilldownLevel({
      service: dsService,
      assetGroup: ag.toLowerCase(),
      start: dsStart,
      end: dsEnd,
      filters,
      expandToDepth: 1,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setCells(res.cells.slice(0, 12));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      });
    return () => controller.abort();
  }, [dsService, dsStart, dsEnd, ag, primary, primaryValue, subAxis, date]);

  if (!subAxis) return null;
  return (
    <div className="card">
      <div className="card-head">
        <h3>By {axisLabel(subAxis).toLowerCase()}</h3>
        <span className="text-xs muted" style={{ marginLeft: "auto" }}>
          {cells ? `${cells.length} shown` : error ? "unavailable" : "loading…"}
        </span>
      </div>
      <div>
        {(cells ?? []).map((it) => {
          const failed = it.stats.attempted_failed;
          return (
            <div
              key={it.value}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 70px 14px",
                gap: 10,
                padding: "9px 14px",
                borderBottom: "1px solid var(--color-border-subtle)",
                alignItems: "center",
                fontSize: 12.5,
              }}
            >
              <span className="font-mono truncate">{it.value}</span>
              <span
                className="text-xs muted font-mono"
                style={{ textAlign: "right" }}
              >
                {fmtNumber(it.stats.captured)}
              </span>
              {failed > 0 ? (
                <span
                  className="badge badge-error badge-mono"
                  style={{ justifySelf: "end" }}
                >
                  {failed} fail
                </span>
              ) : (
                <span
                  className="badge badge-success badge-mono"
                  style={{ justifySelf: "end" }}
                >
                  OK
                </span>
              )}
              <Icons.ChevronRight size={13} className="muted" />
            </div>
          );
        })}
        {cells && cells.length === 0 && (
          <div
            className="muted text-xs"
            style={{ padding: 14, textAlign: "center" }}
          >
            No sub-shards.
          </div>
        )}
      </div>
    </div>
  );
}

function AgDetail({
  ds,
  ag,
  onPush,
}: {
  ds: ServiceDataset;
  ag: string;
  onPush: (e: DrillEntry) => void;
}) {
  const a = ds.agData[ag];
  const rows = a.primaryValues
    .map((pv) => ({ pv, stats: a.byPrimary[pv] }))
    .sort((x, y) => (x.stats.coverage || 0) - (y.stats.coverage || 0));
  // Headline derived from the AG's already-fetched 4-state rollup — no fetch.
  const t = a.total;
  const headlineParts: string[] = [];
  if (t.captured) headlineParts.push(`${fmtNumber(t.captured)} captured`);
  if (t.empty + t["known-empty"])
    headlineParts.push(`${fmtNumber(t.empty + t["known-empty"])} empty`);
  if (t.failed) headlineParts.push(`${fmtNumber(t.failed)} failed`);
  if (t.unattempted) headlineParts.push(`${fmtNumber(t.unattempted)} pending`);
  const headline = headlineParts.length ? headlineParts.join(" · ") : "no rows";
  return (
    <div className="card">
      <div className="card-body" style={{ padding: 14 }}>
        <div className="text-xs muted" style={{ marginBottom: 6 }}>
          {headline}
        </div>
        <div className="text-xs muted" style={{ marginBottom: 6 }}>
          By {axisLabel(a.primary).toLowerCase()} (sorted worst first)
        </div>
        {rows.map(({ pv, stats }) => (
          <div
            key={pv}
            onClick={() => onPush({ kind: "primary", ag, primaryValue: pv })}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 60px",
              gap: 10,
              padding: "7px 0",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <span className="font-mono text-xs truncate">{pv}</span>
            <CoverageStack counts={stats} total={stats.total} simplified />
            <span
              className="font-mono text-xs"
              style={{
                textAlign: "right",
                color:
                  (stats.coverage || 0) >= 0.95
                    ? "var(--color-accent-green)"
                    : (stats.coverage || 0) >= 0.85
                      ? "var(--color-accent-amber)"
                      : "var(--color-accent-red)",
              }}
            >
              {((stats.coverage || 0) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryDetail({
  ds,
  ag,
  primaryValue,
  onPush,
}: {
  ds: ServiceDataset;
  ag: string;
  primaryValue: string;
  onPush: (e: DrillEntry) => void;
}) {
  const a: AgData = ds.agData[ag];
  const stats = a.byPrimary[primaryValue];
  const meta = a.primaryMeta[primaryValue];
  const days = a.grid[primaryValue] ?? {};
  const recent14 = useMemo(() => {
    const out: { date: string; cell?: CellStats }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = ymd(addDays(today, -i));
      out.push({ date: d, cell: days[d] });
    }
    return out;
  }, [days]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-body">
          <CoverageStack
            counts={stats}
            total={stats.total}
            simplified={false}
          />
          <div
            className="row"
            style={{ marginTop: 10, gap: 18, flexWrap: "wrap" }}
          >
            <StatGroup
              label="Coverage"
              value={`${((stats.coverage || 0) * 100).toFixed(1)}%`}
              tone={
                (stats.coverage || 0) >= 0.95
                  ? "good"
                  : (stats.coverage || 0) >= 0.85
                    ? "warn"
                    : "bad"
              }
            />
            <StatGroup label="Captured" value={fmtNumber(stats.captured)} />
            <StatGroup
              label="Failed"
              value={fmtNumber(stats.failed)}
              tone={stats.failed > 0 ? "bad" : null}
            />
            <StatGroup label="Empty" value={fmtNumber(stats.empty)} />
            <StatGroup label="Total" value={fmtNumber(stats.total)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Last 14 days</h3>
          <span className="text-xs muted" style={{ marginLeft: "auto" }}>
            click a day to drill into sub-shards
          </span>
        </div>
        <div className="card-body" style={{ padding: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {recent14.map(({ date, cell }) => {
              const status = cell ? mapStatusToCell(cell.status) : "missing";
              return (
                <button
                  key={date}
                  onClick={() =>
                    onPush({ kind: "cell", ag, primaryValue, date })
                  }
                  style={{
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                  title={`${date}: ${cell ? `${cell.captured}/${cell.total}` : "missing"}`}
                >
                  <span className="cell cell-lg" data-status={status} />
                  <div
                    className="font-mono"
                    style={{
                      fontSize: 9.5,
                      color: "var(--color-text-muted)",
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    {fmtDateShort(date)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {meta && <CompletionBlock meta={meta} />}

      <WhyPanel
        ds={ds}
        ag={ag}
        primaryAxis={a.primary}
        primaryValue={primaryValue}
      />

      <SubAxisBreakdown ds={ds} ag={ag} primaryValue={primaryValue} />
    </div>
  );
}

function DateDetail({
  ds,
  ag,
  date,
  onPush,
}: {
  ds: ServiceDataset;
  ag: string;
  date: string;
  onPush: (e: DrillEntry) => void;
}) {
  const a = ds.agData[ag];
  const rows = a.primaryValues.map((pv) => ({ pv, cell: a.grid[pv]?.[date] }));
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="text-xs muted">
        Per-{axisLabel(a.primary).toLowerCase()} status on {date}
      </div>
      <div className="card">
        {rows.map(({ pv, cell }) => {
          const status = cell ? mapStatusToCell(cell.status) : "missing";
          return (
            <div
              key={pv}
              onClick={() =>
                onPush({ kind: "cell", ag, primaryValue: pv, date })
              }
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto 14px",
                gap: 10,
                padding: "9px 14px",
                borderBottom: "1px solid var(--color-border-subtle)",
                alignItems: "center",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <span className="cell" data-status={status} />
              <span className="font-mono text-sm">{pv}</span>
              <span className="text-xs muted font-mono">
                {cell ? `${cell.captured}/${cell.total}` : "—"}
              </span>
              <span className="text-xs muted font-mono">
                {cell && cell.failed > 0 ? `${cell.failed} fail` : ""}
              </span>
              <Icons.ChevronRight size={13} className="muted" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CellDetail({
  ds,
  ag,
  primaryValue,
  date,
}: {
  ds: ServiceDataset;
  ag: string;
  primaryValue: string;
  date: string;
}) {
  const a = ds.agData[ag];
  const cell = a.grid[primaryValue]?.[date];
  if (!cell) return <div className="muted">No data for this cell.</div>;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-body">
          <CoverageStack counts={cell} total={cell.total} simplified={false} />
          <div
            className="row"
            style={{ marginTop: 10, gap: 18, flexWrap: "wrap" }}
          >
            <StatGroup
              label="Captured"
              value={fmtNumber(cell.captured)}
              tone="good"
            />
            <StatGroup
              label="Failed"
              value={fmtNumber(cell.failed)}
              tone={cell.failed > 0 ? "bad" : null}
            />
            <StatGroup label="Empty" value={fmtNumber(cell.empty)} />
            <StatGroup label="Total" value={fmtNumber(cell.total)} />
          </div>
        </div>
      </div>
      <SubAxisBreakdown
        ds={ds}
        ag={ag}
        primaryValue={primaryValue}
        date={date}
      />
    </div>
  );
}

function DrawerTitle({ entry, ds }: { entry: DrillEntry; ds: ServiceDataset }) {
  const a = ds.agData[entry.ag];
  if (entry.kind === "ag") {
    return (
      <div className="row" style={{ gap: 10 }}>
        <span className="badge badge-info badge-mono">ASSET GROUP</span>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          {entry.ag.toUpperCase()}
        </h2>
      </div>
    );
  }
  if (entry.kind === "primary") {
    return (
      <div className="row" style={{ gap: 10 }}>
        <span className="badge badge-info badge-mono">
          {entry.ag.toUpperCase()}
        </span>
        <span className="text-xs muted font-mono">{axisLabel(a.primary)}</span>
        <h2 className="font-mono" style={{ fontSize: 16, fontWeight: 600 }}>
          {entry.primaryValue}
        </h2>
      </div>
    );
  }
  if (entry.kind === "date") {
    return (
      <div className="row" style={{ gap: 10 }}>
        <span className="badge badge-info badge-mono">
          {entry.ag.toUpperCase()}
        </span>
        <h2 className="font-mono" style={{ fontSize: 16, fontWeight: 600 }}>
          {entry.date}
        </h2>
      </div>
    );
  }
  const cell = a.grid[entry.primaryValue]?.[entry.date];
  return (
    <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
      <span className="badge badge-info badge-mono">
        {entry.ag.toUpperCase()}
      </span>
      <span className="text-xs muted font-mono">
        {entry.primaryValue} · {entry.date}
      </span>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>
        {cell ? `${cell.captured}/${cell.total} captured` : "no shards"}
      </h2>
    </div>
  );
}

export function Drawer({
  drill,
  ds,
}: {
  drill: DrillStack;
  ds: ServiceDataset;
}) {
  const { stack, isOpen, popTo, close, push } = drill;
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const top = stack[stack.length - 1];
  return (
    <>
      <div className={cls("drawer-scrim", isOpen && "open")} onClick={close} />
      <aside
        className={cls("drawer", isOpen && "open")}
        role="dialog"
        aria-label="Shard drilldown"
      >
        {top && (
          <>
            <div className="drawer-head">
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div className="crumbs">
                  {stack.map((entry, i) => {
                    const isLast = i === stack.length - 1;
                    return (
                      <span
                        key={i}
                        className="row"
                        style={{ gap: 0, alignItems: "center" }}
                      >
                        {i > 0 && <span className="crumb-sep">/</span>}
                        <span
                          className={cls("crumb", isLast && "crumb-active")}
                          onClick={() => !isLast && popTo(i)}
                        >
                          {crumbLabel(entry)}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <button
                  className="btn btn-icon btn-ghost"
                  onClick={close}
                  title="Close (Esc)"
                >
                  <Icons.X size={14} />
                </button>
              </div>
              <DrawerTitle entry={top} ds={ds} />
            </div>
            <div className="drawer-body">
              {top.kind === "ag" && (
                <AgDetail ds={ds} ag={top.ag} onPush={push} />
              )}
              {top.kind === "primary" && (
                <PrimaryDetail
                  ds={ds}
                  ag={top.ag}
                  primaryValue={top.primaryValue}
                  onPush={push}
                />
              )}
              {top.kind === "date" && (
                <DateDetail ds={ds} ag={top.ag} date={top.date} onPush={push} />
              )}
              {top.kind === "cell" && (
                <CellDetail
                  ds={ds}
                  ag={top.ag}
                  primaryValue={top.primaryValue}
                  date={top.date}
                />
              )}
            </div>
            <div className="drawer-foot">
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-ghost btn-sm">
                  <Icons.Eye size={12} /> Open in matrix
                </button>
              </div>
              <button className="btn btn-primary btn-sm">
                <Icons.Rocket size={12} /> Deploy missing
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
