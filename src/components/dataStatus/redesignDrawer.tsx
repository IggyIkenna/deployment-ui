/**
 * Drilldown drawer for the redesigned Data Status tab. Ported from the
 * prototype's `drawer.jsx`. The sub-axis breakdown is wired to the REAL
 * hierarchical drilldown endpoint (via `fetchDrilldownLevel`); the
 * ag/primary/date/cell summaries read the already-fetched grid `ds`.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchDrilldownLevel, type AxisValueCell } from "./dataStatusModel";
import {
  mapStatusToCell,
  type AgData,
  type CellStats,
  type ServiceDataset,
} from "./redesignData";
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

  useEffect(() => {
    if (!subAxis) return;
    const controller = new AbortController();
    setCells(null);
    setError(false);
    const filters: Record<string, string> = { [a.primary]: primaryValue };
    fetchDrilldownLevel({
      service: ds.service,
      assetGroup: ag,
      start: ds.start,
      end: ds.end,
      filters,
      expandToDepth: 1,
      signal: controller.signal,
    })
      .then((res) => setCells(res.cells.slice(0, 12)))
      .catch(() => setError(true));
    return () => controller.abort();
  }, [ds, ag, a.primary, primaryValue, subAxis, date]);

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
  return (
    <div className="card">
      <div className="card-body" style={{ padding: 14 }}>
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
