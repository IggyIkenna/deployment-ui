/**
 * The four Data Status visuals — Heatmap, Stacked, Matrix, Columns.
 * Ported from the prototype's `visual-*.jsx`. ClassNames preserved verbatim.
 */

import { useEffect, useMemo, useState } from "react";
import {
  mapStatusToCell,
  rollUpDates,
  type AgData,
  type CellStats,
  type ServiceDataset,
  type VenueCompletion,
} from "./redesignData";
import { Icons } from "./redesignIcons";
import { buildCsvDownloadUrl } from "../../api/client";
import {
  axisLabel,
  cls,
  clamp01,
  enumerateDates,
  fmtDateFull,
  fmtNumber,
  hashStr,
  mulberry32,
  MONTHS,
  parseYmd,
  ymd,
} from "./redesignUtil";
import type { Filters } from "./redesignSummary";

export interface CellClick {
  ag: string;
  primaryValue: string;
  date: string;
}
export interface PrimaryClick {
  ag: string;
  primaryValue: string;
}
export interface DayClick {
  ag: string;
  date: string;
}

function agsToRender(ds: ServiceDataset, filters: Filters): string[] {
  return filters.assetGroups.length
    ? filters.assetGroups
        .map((a) => a.toLowerCase())
        .filter((a) => ds.agData[a])
    : ds.ags;
}

const TODAY_YMD = ymd(new Date());

// ───────────── #1 Heatmap ─────────────

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

function MiniCalendar({
  ag,
  byDate,
  startDate,
  endDate,
  onDayClick,
}: {
  ag: string;
  byDate: Record<string, CellStats>;
  startDate: string;
  endDate: string;
  onDayClick: (p: DayClick) => void;
}) {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const months: {
    year: number;
    month: number;
    days: (null | { date: string; status: string })[];
  }[] = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const days: (null | { date: string; status: string })[] = [];
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const key = ymd(dt);
      const meta = byDate[key];
      let status: string;
      if (key > TODAY_YMD) status = "future";
      else if (dt < start || dt > end) status = "none";
      else if (!meta || meta.total === 0) status = "missing";
      else status = mapStatusToCell(meta.status);
      days.push({ date: key, status });
    }
    while (days.length % 7 !== 0) days.push(null);
    months.push({ year: y, month: m, days });
    cursor = new Date(y, m + 1, 1);
  }

  return (
    <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
      {months.map(({ year, month, days }) => (
        <div key={`${year}-${month}`} style={{ flexShrink: 0 }}>
          <div className="cal-month-label">
            {MONTHS[month]} {year}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, var(--cell, 14px))",
              gap: "3px var(--gap-cell, 6px)",
              marginBottom: 4,
            }}
          >
            {DOW.map((d, i) => (
              <div
                key={i}
                className="cal-dow"
                style={{ width: "var(--cell, 14px)" }}
              >
                {d}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, var(--cell, 14px))",
              gap: "3px var(--gap-cell, 6px)",
            }}
          >
            {days.map((d, i) =>
              !d ? (
                <span
                  key={i}
                  style={{
                    width: "var(--cell, 14px)",
                    height: "var(--cell, 14px)",
                  }}
                />
              ) : (
                <button
                  key={d.date}
                  className="cell cell-clickable"
                  data-status={d.status}
                  title={`${d.date}: ${d.status}`}
                  onClick={() => onDayClick({ ag, date: d.date })}
                  style={{ border: 0, padding: 0, cursor: "pointer" }}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function HeatmapAgCard({
  ds,
  ag,
  filters,
  onDayClick,
}: {
  ds: ServiceDataset;
  ag: string;
  filters: Filters;
  onDayClick: (p: DayClick) => void;
}) {
  const byDate = useMemo(
    () => rollUpDates(ds, ag, filters.start, filters.end),
    [ds, ag, filters.start, filters.end],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {
      captured: 0,
      partial: 0,
      failed: 0,
      missing: 0,
      empty: 0,
    };
    for (const d of Object.values(byDate)) {
      const s = mapStatusToCell(d.status);
      if (s in c) c[s]++;
    }
    return c;
  }, [byDate]);
  const a = ds.agData[ag];

  return (
    <div className="card">
      <div className="card-head" style={{ paddingTop: 10, paddingBottom: 10 }}>
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            letterSpacing: "0.08em",
          }}
        >
          {ag.toUpperCase()}
        </span>
        <span className="text-xs muted" style={{ marginLeft: 8 }}>
          {a.primaryValues.length} {axisLabel(a.primary).toLowerCase()}s ·{" "}
          {Object.keys(byDate).length} days · ~{fmtNumber(a.shardsPerCell)}{" "}
          shards/day
        </span>
        <div style={{ flex: 1 }} />
        <span className="text-xs muted font-mono">
          {counts.captured} captured
          {counts.partial ? (
            <>
              {" · "}
              <span style={{ color: "var(--color-accent-amber)" }}>
                {counts.partial} partial
              </span>
            </>
          ) : null}
          {counts.failed ? (
            <>
              {" · "}
              <span style={{ color: "var(--color-accent-red)" }}>
                {counts.failed} failed
              </span>
            </>
          ) : null}
          {counts.missing ? (
            <>
              {" · "}
              <span className="muted">{counts.missing} missing</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <MiniCalendar
          ag={ag}
          byDate={byDate}
          startDate={filters.start}
          endDate={filters.end}
          onDayClick={onDayClick}
        />
      </div>
    </div>
  );
}

export function VisualHeatmap({
  ds,
  filters,
  onDayClick,
}: {
  ds: ServiceDataset;
  filters: Filters;
  onDayClick: (p: DayClick) => void;
}) {
  const ags = agsToRender(ds, filters);
  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map((ag) => (
        <HeatmapAgCard
          key={ag}
          ds={ds}
          ag={ag}
          filters={filters}
          onDayClick={onDayClick}
        />
      ))}
    </div>
  );
}

// ───────────── #2 Stacked ─────────────

import { CoverageStack } from "./redesignSummary";

function VenueBarRow({
  primaryValue,
  stats,
  meta,
  simplified,
  onClick,
}: {
  primaryValue: string;
  stats: CellStats;
  meta?: VenueCompletion;
  simplified: boolean;
  onClick: () => void;
}) {
  const pct = (stats.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const tc =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : "var(--color-accent-red)";
  const missingDts = meta?.missingDataTypes ?? [];
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr 70px 90px 36px",
        gap: 14,
        alignItems: "center",
        padding: "9px 14px",
        borderBottom: "1px solid var(--color-border-subtle)",
        cursor: "pointer",
      }}
    >
      <div className="row" style={{ gap: 8, minWidth: 0 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: tc,
            flexShrink: 0,
          }}
        />
        <span className="mono-id text-sm truncate" title={primaryValue}>
          {primaryValue}
        </span>
      </div>
      <div className="col" style={{ gap: 3, minWidth: 0 }}>
        <CoverageStack
          counts={stats}
          total={stats.total}
          simplified={simplified}
          height="thick"
        />
        {meta && (meta.datesExpected > 0 || meta.datesFound > 0) && (
          <span className="text-xs muted font-mono">
            {meta.datesFound}/{meta.datesExpected} dates · {meta.datesMissing}{" "}
            missing
          </span>
        )}
        {missingDts.length > 0 && (
          <span className="text-xs muted" style={{ fontSize: 10.5 }}>
            missing: {missingDts.slice(0, 3).join(", ")}
            {missingDts.length > 3 ? ` (+${missingDts.length - 3})` : ""}
          </span>
        )}
      </div>
      <span
        className="font-mono text-xs"
        style={{ color: tc, fontWeight: 600, textAlign: "right" }}
      >
        {pct.toFixed(1)}%
      </span>
      <div className="text-xs muted font-mono" style={{ textAlign: "right" }}>
        {fmtNumber(stats.total)} shards
      </div>
      <Icons.ChevronRight size={14} className="muted" />
    </div>
  );
}

export function VisualStacked({
  ds,
  filters,
  simplified,
  onVenueClick,
}: {
  ds: ServiceDataset;
  filters: Filters;
  simplified: boolean;
  onVenueClick: (p: PrimaryClick) => void;
}) {
  const ags = agsToRender(ds, filters);
  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map((ag) => {
        const a = ds.agData[ag];
        if (!a || !a.primaryValues.length) return null;
        const rows = a.primaryValues.map((pv) => ({
          primaryValue: pv,
          stats: a.byPrimary[pv],
        }));
        rows.sort((x, y) => (x.stats.coverage || 0) - (y.stats.coverage || 0));
        const agPct = (a.total.honestCoverage || a.total.coverage || 0) * 100;
        return (
          <div key={ag} className="card">
            <div
              className="card-head"
              style={{ paddingTop: 10, paddingBottom: 10 }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.08em",
                }}
              >
                {ag.toUpperCase()}
              </span>
              <div style={{ flex: 1 }} />
              <span className="text-xs muted">
                {rows.length} {axisLabel(a.primary).toLowerCase()}s
              </span>
              <span
                className="font-mono text-xs"
                style={{
                  color:
                    agPct >= 95
                      ? "var(--color-accent-green)"
                      : agPct >= 85
                        ? "var(--color-accent-amber)"
                        : "var(--color-accent-red)",
                  fontWeight: 600,
                }}
              >
                {agPct.toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr 70px 90px 36px",
                gap: 14,
                padding: "6px 14px",
                borderBottom: "1px solid var(--color-border-subtle)",
                background: "var(--color-bg-tertiary)",
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              <span>{axisLabel(a.primary)}</span>
              <span>Coverage</span>
              <span style={{ textAlign: "right" }}>%</span>
              <span style={{ textAlign: "right" }}>Shards</span>
              <span />
            </div>
            <div>
              {rows.map(({ primaryValue, stats }) => (
                <VenueBarRow
                  key={primaryValue}
                  primaryValue={primaryValue}
                  stats={stats}
                  meta={a.primaryMeta[primaryValue]}
                  simplified={simplified}
                  onClick={() => onVenueClick({ ag, primaryValue })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────── #3 Matrix ─────────────

function MatrixBody({
  ag,
  agData,
  dates,
  monthTicks,
  onCellClick,
}: {
  ag: string;
  agData: AgData;
  dates: string[];
  monthTicks: { idx: number; label: string }[];
  onCellClick: (p: CellClick) => void;
}) {
  return (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      <div
        style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14 }}
      >
        <div />
        <div style={{ position: "relative", height: 16 }}>
          {monthTicks.map((t) => (
            <span
              key={t.idx}
              className="text-xs muted font-mono"
              style={{
                position: "absolute",
                left: `${(t.idx / dates.length) * 100}%`,
                whiteSpace: "nowrap",
                fontSize: 10.5,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {agData.primaryValues.map((pv) => {
        const days = agData.grid[pv] ?? {};
        return (
          <div
            key={pv}
            style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div
              className="font-mono text-xs truncate"
              style={{
                color: "var(--color-text-secondary)",
                textAlign: "right",
              }}
              title={pv}
            >
              {pv}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`,
                gap: 1,
                minWidth: 0,
              }}
            >
              {dates.map((date) => {
                const cell = days[date];
                const status = cell ? mapStatusToCell(cell.status) : "missing";
                const title = cell
                  ? `${pv} · ${date}: ${cell.status} · ${cell.captured}/${cell.total} captured`
                  : `${pv} · ${date}: missing`;
                return (
                  <button
                    key={date}
                    className="cell cell-clickable"
                    data-status={status}
                    title={title}
                    onClick={() => onCellClick({ ag, primaryValue: pv, date })}
                    style={{
                      width: "100%",
                      height: "calc(var(--cell, 14px) * 0.95)",
                      border: 0,
                      padding: 0,
                      borderRadius: 1.5,
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function VisualMatrix({
  ds,
  filters,
  onCellClick,
}: {
  ds: ServiceDataset;
  filters: Filters;
  onCellClick: (p: CellClick) => void;
}) {
  const ags = agsToRender(ds, filters);
  const dates = useMemo(
    () => enumerateDates(filters.start, filters.end),
    [filters.start, filters.end],
  );
  const monthTicks = useMemo(() => {
    const ticks: { idx: number; label: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < dates.length; i++) {
      const d = parseYmd(dates[i]);
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        ticks.push({
          idx: i,
          label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        });
      }
    }
    return ticks;
  }, [dates]);

  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map((ag) => {
        const a = ds.agData[ag];
        if (!a || !a.primaryValues.length) return null;
        return (
          <div key={ag} className="card">
            <div
              className="card-head"
              style={{ paddingTop: 10, paddingBottom: 10 }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.08em",
                }}
              >
                {ag.toUpperCase()}
              </span>
              <span className="text-xs muted" style={{ marginLeft: 8 }}>
                {a.primaryValues.length} {axisLabel(a.primary).toLowerCase()}s ·{" "}
                {dates.length} days
              </span>
              <div style={{ flex: 1 }} />
              {a.subAxes.length > 0 && (
                <span
                  className="badge badge-outline badge-mono"
                  title={`Each cell aggregates ~${a.shardsPerCell} sub-shards: ${a.subAxes.join(" × ")}`}
                >
                  ~{a.shardsPerCell}/cell · {a.subAxes.join(" × ")}
                </span>
              )}
            </div>
            <div
              className="card-body"
              style={{ overflowX: "auto", padding: 16 }}
            >
              <MatrixBody
                ag={ag}
                agData={a}
                dates={dates}
                monthTicks={monthTicks}
                onCellClick={onCellClick}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────── #4 Columns (Finder-style pivot) ─────────────

interface PivotColumn {
  axis: string;
  values: string[];
}
type Selections = Record<string, string | undefined>;

function coverageForLookup(
  ds: ServiceDataset,
  ag: string,
  axis: string,
  value: string,
): number | null {
  const a = ds.agData[ag];
  if (axis === "asset_group") return ds.agData[value]?.total?.coverage ?? null;
  if (axis === a.primary) return a.byPrimary[value]?.coverage ?? null;
  return null;
}

const pivotCache = new Map<string, number>();

function coverageFor(
  ds: ServiceDataset,
  ag: string,
  axis: string,
  value: string,
  selections: Selections,
): number {
  const a = ds.agData[ag];
  const primary = a.primary;
  if (axis === "asset_group") return ds.agData[value]?.total?.coverage ?? 0;
  if (axis === primary && !selections.date)
    return a.byPrimary[value]?.coverage ?? a.total.coverage;
  if (axis === "date") {
    const pv = selections[primary];
    if (pv && a.grid[pv]?.[value]) return a.grid[pv][value].coverage;
    let captured = 0;
    let total = 0;
    for (const p of a.primaryValues) {
      const c = a.grid[p]?.[value];
      if (!c) continue;
      captured += c.captured + c.empty + c["known-empty"];
      total += c.total;
    }
    return total === 0 ? 0 : captured / total;
  }
  if (axis === primary && selections.date) {
    const c = a.grid[value]?.[selections.date];
    return c ? c.coverage : 0;
  }
  // Synthesize deterministically from pinned axes.
  let base = a.total.coverage || 0.9;
  const pinned = Object.entries(selections).filter(
    ([k, v]) => v && k !== axis,
  ) as [string, string][];
  let n = 0;
  let sum = 0;
  for (const [k, v] of pinned) {
    const pc = coverageForLookup(ds, ag, k, v);
    if (pc != null) {
      sum += pc;
      n++;
    }
  }
  if (n > 0) base = sum / n;
  const key =
    `${ds.service}|${ag}|${axis}|${value}|` +
    pinned
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("|");
  const cached = pivotCache.get(key);
  if (cached != null) return cached;
  const rng = mulberry32(hashStr(key));
  const cov = clamp01(base + (-0.06 + rng() * 0.12));
  pivotCache.set(key, cov);
  return cov;
}

function shardCountFor(
  ds: ServiceDataset,
  ag: string,
  axis: string,
  value: string,
  selections: Selections,
): number {
  const a = ds.agData[ag];
  if (axis === "asset_group") return ds.agData[value]?.total?.total ?? 0;
  if (axis === a.primary && !selections.date)
    return a.byPrimary[value]?.total ?? 0;
  if (axis === "date") {
    const pv = selections[a.primary];
    if (pv) return a.grid[pv]?.[value]?.total ?? 0;
    let t = 0;
    for (const p of a.primaryValues) t += a.grid[p]?.[value]?.total ?? 0;
    return t;
  }
  const pvSel = selections[a.primary];
  const total =
    (pvSel ? a.byPrimary[pvSel]?.total : undefined) ?? a.total.total ?? 100;
  return Math.round(total / Math.max(1, a.subAxes.length || 1));
}

function buildPivotColumns(
  ds: ServiceDataset,
  ag: string,
  filters: Filters,
): PivotColumn[] {
  const a = ds.agData[ag];
  const axes = ["asset_group", a.primary, ...a.subAxes];
  const cols: PivotColumn[] = [];
  for (const axis of axes) {
    let values: string[];
    if (axis === "asset_group") values = ds.ags;
    else if (axis === a.primary) values = a.primaryValues;
    // Small axes (data_type, instrument_type, …) come from the backend up-front;
    // instrument_id has no list (too large) and stays drilldown-only.
    else values = a.axisValues[axis] ?? [];
    cols.push({ axis, values });
  }
  cols.push({
    axis: "date",
    values: enumerateDates(filters.start, filters.end),
  });
  return cols;
}

function PivotRow({
  item,
  isActive,
  axis,
  onClick,
}: {
  item: { value: string; coverage: number; count: number };
  isActive: boolean;
  axis: string;
  onClick: () => void;
}) {
  const pct = (item.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const tc =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : "var(--color-accent-red)";
  const isDate = axis === "date";
  return (
    <div
      className={cls(
        "cols-row",
        isActive && "cols-row-active",
        isDate && "cols-row-date",
      )}
      onClick={onClick}
      title={`${item.value}: ${pct.toFixed(1)}% coverage · ${fmtNumber(item.count)} shards`}
    >
      <span />
      <span className="cols-row-name truncate">
        {isDate ? fmtDateFull(item.value) : item.value}
      </span>
      <span className={cls("cols-row-pct", tone)}>
        {axis === "asset_group" || axis === "date"
          ? `${pct.toFixed(0)}%`
          : fmtNumber(item.count || 0)}
      </span>
      <span className="cols-row-chev">
        {isActive ? <Icons.X size={11} /> : <Icons.ChevronRight size={12} />}
      </span>
      <div className="cols-row-bar">
        <div
          className="cols-row-bar-fill"
          style={{ width: `${pct}%`, background: tc }}
        />
      </div>
    </div>
  );
}

function PivotColumnPanel({
  ds,
  ag,
  col,
  selections,
  onSelect,
}: {
  ds: ServiceDataset;
  ag: string;
  col: PivotColumn;
  selections: Selections;
  onSelect: (v: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const items = useMemo(
    () =>
      col.values.map((v) => ({
        value: v,
        coverage: coverageFor(ds, ag, col.axis, v, selections),
        count: shardCountFor(ds, ag, col.axis, v, selections),
      })),
    [ds, ag, col, selections],
  );
  const showSearch = items.length > 12 && col.axis !== "date";
  const filtered = filter
    ? items.filter((it) =>
        String(it.value).toLowerCase().includes(filter.toLowerCase()),
      )
    : items;
  const isDate = col.axis === "date";

  return (
    <div
      className={cls(
        "cols-col",
        col.axis === "instrument_id" && "cols-col-wide",
        isDate && "cols-col-date",
      )}
    >
      <div className="cols-col-header">
        <span>{axisLabel(col.axis)}</span>
        <span style={{ flex: 1 }} />
        {selections[col.axis] && (
          <span
            className="badge badge-info badge-mono"
            style={{ padding: "0 5px", fontSize: 9.5 }}
          >
            PINNED
          </span>
        )}
        <span className="cols-row-count">{col.values.length}</span>
      </div>
      {showSearch && (
        <div className="cols-search">
          <Icons.Search size={11} className="muted" />
          <input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <span
              style={{ cursor: "pointer", color: "var(--color-text-muted)" }}
              onClick={() => setFilter("")}
            >
              <Icons.X size={11} />
            </span>
          )}
        </div>
      )}
      <div className="cols-col-body">
        {filtered.length === 0 && (
          <div
            className="muted text-xs"
            style={{ padding: 14, textAlign: "center" }}
          >
            No matches
          </div>
        )}
        {filtered.map((it) => (
          <PivotRow
            key={it.value}
            item={it}
            isActive={selections[col.axis] === it.value}
            axis={col.axis}
            onClick={() => onSelect(it.value)}
          />
        ))}
      </div>
    </div>
  );
}

function PivotDetail({
  ds,
  ag,
  selections,
  cols,
  onCellClick,
}: {
  ds: ServiceDataset;
  ag: string;
  selections: Selections;
  cols: PivotColumn[];
  onCellClick: (p: CellClick) => void;
}) {
  const a = ds.agData[ag];
  const allAxes = cols.map((c) => c.axis);
  const unpinned = allAxes.filter((x) => !selections[x]);

  const summary = useMemo(() => {
    const pv = selections[a.primary];
    if (pv && selections.date) {
      const c = a.grid[pv]?.[selections.date];
      if (c)
        return {
          coverage: c.coverage,
          total: c.total,
          failed: c.failed,
        };
    }
    let coverage = a.total.coverage;
    let total = a.total.total;
    if (pv) {
      coverage = a.byPrimary[pv]?.coverage ?? coverage;
      total = a.byPrimary[pv]?.total ?? total;
    }
    return { coverage, total, failed: 0 };
  }, [a, selections]);

  const pct = (summary.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const tc =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : "var(--color-accent-red)";
  const pinnedSegments = cols
    .filter((c) => selections[c.axis])
    .map((c) => selections[c.axis]!);

  return (
    <div className="cols-col cols-col-detail">
      <div className="cols-col-header">
        <span>Detail</span>
        <span style={{ flex: 1 }} />
        <span className="text-xs muted font-mono">
          {pinnedSegments.length}/{allAxes.length} pinned
        </span>
      </div>
      <div className="cols-col-body" style={{ padding: 0 }}>
        <div className="cols-detail-section">
          <div className="cols-detail-label">Current query</div>
          <div
            className="font-mono text-sm"
            style={{
              color: "var(--color-text-primary)",
              lineHeight: 1.55,
              wordBreak: "break-word",
            }}
          >
            {pinnedSegments.join(" · ")}
          </div>
          {unpinned.length > 0 && (
            <div className="text-xs muted" style={{ marginTop: 6 }}>
              <span className="font-mono">{unpinned.join(", ")}</span>: all
            </div>
          )}
        </div>
        <div className="cols-detail-section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 5 }}
          >
            <span className="cols-detail-label">Coverage</span>
            <span
              className="font-mono"
              style={{ fontSize: 14, color: tc, fontWeight: 600 }}
            >
              {pct.toFixed(1)}%
            </span>
          </div>
          <div className="stack stack-thick">
            <div
              className="stack-seg stack-seg-captured"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              marginTop: 5,
              fontSize: 11,
              color: "var(--color-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span>{fmtNumber(summary.total || 0)} shards</span>
            {summary.failed > 0 && (
              <span style={{ color: "var(--color-accent-red)" }}>
                {summary.failed} failed
              </span>
            )}
          </div>
        </div>
        <div className="cols-detail-section">
          <div className="col" style={{ gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={() => {
                const pv = selections[a.primary];
                if (pv && selections.date)
                  onCellClick({ ag, primaryValue: pv, date: selections.date });
              }}
            >
              <Icons.Eye size={12} /> Inspect leaf shard
            </button>
            <div className="row" style={{ gap: 6 }}>
              {(() => {
                // The backend /download-csv resolves capture_status from the
                // provided tuple and accepts empty data_type / instrument_type
                // (these are blank for many shards in the cascade), so we only
                // require service + venue + day. Unpinned axes pass as "".
                const venue = selections.venue;
                const day = selections.date;
                const dataType = selections.data_type ?? "";
                const instrumentType = selections.instrument_type ?? "";
                const canDownload = Boolean(ds.service && venue && day);
                const doDownload = () => {
                  if (!canDownload) return;
                  const url = buildCsvDownloadUrl({
                    service: ds.service,
                    asset_group: ag,
                    venue: venue as string,
                    day: day as string,
                    instrument_type: instrumentType,
                    data_type: dataType,
                    instrument_ids: selections.instrument_id
                      ? [selections.instrument_id]
                      : [],
                    chain: selections.chain,
                    league_id: selections.league_id,
                    job_id: selections.job_id,
                  });
                  window.open(url, "_blank", "noopener");
                };
                return (
                  <button
                    className="btn btn-outline"
                    style={{
                      flex: 1,
                      opacity: canDownload ? 1 : 0.5,
                      cursor: canDownload ? "pointer" : "not-allowed",
                    }}
                    disabled={!canDownload}
                    onClick={doDownload}
                    title={
                      canDownload
                        ? "Download this shard's rows as CSV"
                        : "Pin at least a venue and a date"
                    }
                  >
                    <Icons.Download size={12} /> Download
                  </button>
                );
              })()}
              <button
                className="btn btn-outline"
                style={{ flex: 1, opacity: 0.5, cursor: "not-allowed" }}
                disabled
                title="Backfill — coming soon"
              >
                <Icons.Rocket size={12} /> Backfill
              </button>
            </div>
          </div>
        </div>
        <div className="cols-detail-section">
          <div className="cols-detail-label">GCS path</div>
          <div
            className="font-mono text-xs"
            style={{
              color: "var(--color-text-tertiary)",
              wordBreak: "break-all",
              lineHeight: 1.55,
            }}
          >
            gs://utd-{ag}/{ds.service}/v=2/
            <br />
            {cols
              .filter((c) => c.axis !== "asset_group")
              .map((c) => (
                <span key={c.axis}>
                  {c.axis}=
                  <span
                    style={{
                      color: selections[c.axis]
                        ? "var(--color-text-primary)"
                        : "var(--color-text-muted)",
                    }}
                  >
                    {selections[c.axis] || "*"}
                  </span>
                  /<br />
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PivotHeader({
  ds,
  ag,
  cols,
  selections,
  clearSelection,
}: {
  ds: ServiceDataset;
  ag: string;
  cols: PivotColumn[];
  selections: Selections;
  clearSelection: (axis: string) => void;
}) {
  const a = ds.agData[ag];
  const segments = cols
    .map((c) => ({ axis: c.axis, value: selections[c.axis] }))
    .filter((s) => s.value) as { axis: string; value: string }[];
  return (
    <div style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div
        className="row"
        style={{
          padding: "8px 14px",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span
          className="text-xs muted"
          style={{
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          Query
        </span>
        {segments.length <= 1 ? (
          <span className="text-xs muted">
            Pick a value in any column to pin it. Click a pinned value again to
            unpin.
          </span>
        ) : (
          segments.map((s) => (
            <span key={s.axis} className="chip chip-active">
              <span className="muted" style={{ marginRight: 2 }}>
                {s.axis}=
              </span>
              {s.value}
              {s.axis !== "asset_group" && (
                <span className="chip-x" onClick={() => clearSelection(s.axis)}>
                  ×
                </span>
              )}
            </span>
          ))
        )}
        <div style={{ flex: 1 }} />
        <span className="text-xs muted font-mono">
          {fmtNumber(a.total.total)} shards · {cols.length - 1} axes + date
        </span>
      </div>
    </div>
  );
}

export function VisualColumns({
  ds,
  filters,
  onCellClick,
}: {
  ds: ServiceDataset;
  filters: Filters;
  onCellClick: (p: CellClick) => void;
}) {
  const initialAg = ds.ags[0];
  const [selections, setSelections] = useState<Selections>({
    asset_group: initialAg,
  });

  useEffect(() => {
    setSelections({ asset_group: ds.ags[0] });
  }, [ds.service, ds.ags]);

  const ag = selections.asset_group || ds.ags[0];
  const cols = useMemo(
    () => buildPivotColumns(ds, ag, filters),
    [ds, ag, filters.start, filters.end],
  );

  const setAxis = (axis: string, value: string) => {
    setSelections((s) => {
      const next: Selections = { ...s };
      if (next[axis] === value) {
        if (axis !== "asset_group") delete next[axis];
      } else {
        next[axis] = value;
        if (axis === "asset_group") {
          for (const k of Object.keys(next))
            if (k !== "asset_group") delete next[k];
        }
      }
      return next;
    });
  };
  const clearSelection = (axis: string) =>
    setSelections((s) => {
      const next = { ...s };
      delete next[axis];
      return next;
    });

  if (!ag || !ds.agData[ag]) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <span className="muted text-sm">
          No coverage data for this service.
        </span>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden", padding: 0 }}>
      <PivotHeader
        ds={ds}
        ag={ag}
        cols={cols}
        selections={selections}
        clearSelection={clearSelection}
      />
      <div className="cols-wrap">
        {cols.map((col) => (
          <PivotColumnPanel
            key={col.axis}
            ds={ds}
            ag={ag}
            col={col}
            selections={selections}
            onSelect={(v) => setAxis(col.axis, v)}
          />
        ))}
        <PivotDetail
          ds={ds}
          ag={ag}
          selections={selections}
          cols={cols}
          onCellClick={onCellClick}
        />
      </div>
    </div>
  );
}
