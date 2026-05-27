/**
 * The four Data Status visuals — Heatmap, Stacked, Matrix, Columns.
 * Ported from the prototype's `visual-*.jsx`. ClassNames preserved verbatim.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  mapStatusToCell,
  rollUpDates,
  type AgData,
  type CellStats,
  type ServiceDataset,
  type VenueCompletion,
} from "./redesignData";
import { Icons } from "./redesignIcons";
import {
  buildCsvDownloadUrl,
  getHierarchicalDrilldown,
  getShardAxisMatrix,
  type DrilldownNode,
  type DrilldownTotals,
  type ReasonSummary,
} from "../../api/client";
import { groupReasonSummary, reasonMeta, REASON_ORDER } from "./reasonCategory";
import {
  axisLabel,
  cls,
  enumerateDates,
  fmtDateFull,
  fmtNumber,
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

// ───────────── #4 Columns (Finder-style drilldown cascade) ─────────────
//
// DRILLDOWN-DRIVEN: every column past `asset_group` is populated by a real
// backend drilldown call for the current pinned-prefix, so each value shown
// CO-OCCURS with the pins (real narrowing) and carries REAL counts +
// completion. No static cross-product, no synthesized coverage. See
// `data_status_drilldown_shard_atom_alignment` plan.

type Selections = Record<string, string | undefined>;

/** One value in a drilldown column. */
interface ColumnItem {
  value: string;
  count: number;
  captured: number;
  coveragePct: number;
  reason?: string;
  /** Exact tuple for this node — preferred source for the download URL. */
  rowKey: Record<string, string>;
}

interface ColumnState {
  loading: boolean;
  error: boolean;
  items: ColumnItem[];
  /** True when the slice exceeded the backend child cap (best-effort note). */
  capped: boolean;
}

const COLUMN_CHILD_LIMIT = 500;

/** Build the contiguous-prefix filter map for a given axis position.
 * The backend matches `matched_depth = number of pinned filters` and returns
 * children for `axes[matched_depth]`, so we may only pin a CONTIGUOUS prefix.
 * Returns null when the prefix up to (but excluding) `depth` is incomplete
 * (an earlier axis is unpinned) — that column can't be fetched yet. */
function prefixFilters(
  axes: string[],
  depth: number,
  selections: Selections,
): Record<string, string> | null {
  const filters: Record<string, string> = {};
  for (let i = 0; i < depth; i++) {
    const axis = axes[i];
    const val = selections[axis];
    if (val == null) return null;
    filters[axis] = val;
  }
  return filters;
}

/** Map a DrilldownNode to a ColumnItem. */
function nodeToItem(node: DrilldownNode): ColumnItem {
  return {
    value: node.value,
    count: node.total,
    captured: node.captured,
    coveragePct: node.completion_pct,
    reason: node.reason_category,
    rowKey: node.row_key,
  };
}

function PivotRow({
  item,
  isActive,
  axis,
  onClick,
}: {
  item: ColumnItem;
  isActive: boolean;
  axis: string;
  onClick: () => void;
}) {
  const pct = item.coveragePct;
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
        {`${pct.toFixed(0)}%`}
        <span className="muted" style={{ marginLeft: 6, fontWeight: 400 }}>
          {fmtNumber(item.count)}
        </span>
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

/** The asset_group column reads the already-fetched grid `ds` (no drilldown). */
function AssetGroupColumn({
  ds,
  selections,
  onSelect,
}: {
  ds: ServiceDataset;
  selections: Selections;
  onSelect: (v: string) => void;
}) {
  const items: ColumnItem[] = ds.ags.map((agKey) => {
    const t = ds.agData[agKey]?.total;
    return {
      value: agKey,
      count: t?.total ?? 0,
      captured: t?.captured ?? 0,
      coveragePct: (t?.coverage ?? 0) * 100,
      rowKey: {},
    };
  });
  return (
    <div className="cols-col">
      <div className="cols-col-header">
        <span>{axisLabel("asset_group")}</span>
        <span style={{ flex: 1 }} />
        {selections.asset_group && (
          <span
            className="badge badge-info badge-mono"
            style={{ padding: "0 5px", fontSize: 9.5 }}
          >
            PINNED
          </span>
        )}
        <span className="cols-row-count">{items.length}</span>
      </div>
      <div className="cols-col-body">
        {items.map((it) => (
          <PivotRow
            key={it.value}
            item={it}
            isActive={selections.asset_group === it.value}
            axis="asset_group"
            onClick={() => onSelect(it.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** A drilldown-backed column for one shard axis at `depth` in `axes`. */
function DrilldownColumn({
  ds,
  ag,
  axis,
  depth,
  axes,
  selections,
  onSelect,
  onItems,
}: {
  ds: ServiceDataset;
  ag: string;
  axis: string;
  depth: number;
  axes: string[];
  selections: Selections;
  onSelect: (v: string) => void;
  /** Report the loaded items up so the parent can drive auto-advance + the
   * leaf row_key for the download URL. */
  onItems: (axis: string, state: ColumnState) => void;
}) {
  const [filter, setFilter] = useState("");
  const [state, setState] = useState<ColumnState>({
    loading: true,
    error: false,
    items: [],
    capped: false,
  });

  const { service, start, end } = ds;
  const filters = prefixFilters(axes, depth, selections);
  // Stable primitive key for the effect dep — the pinned prefix.
  const prefixKey = filters
    ? axes
        .slice(0, depth)
        .map((a) => `${a}=${filters[a]}`)
        .join("|")
    : "__incomplete__";

  // Keep the latest onItems in a ref so it isn't an effect dep (avoids
  // re-fetch loops from an unstable callback identity).
  const onItemsRef = useRef(onItems);
  onItemsRef.current = onItems;

  useEffect(() => {
    if (!filters) {
      const incomplete: ColumnState = {
        loading: false,
        error: false,
        items: [],
        capped: false,
      };
      setState(incomplete);
      onItemsRef.current(axis, incomplete);
      return;
    }
    const controller = new AbortController();
    setState({ loading: true, error: false, items: [], capped: false });
    getHierarchicalDrilldown({
      service,
      asset_group: ag.toLowerCase(),
      start_date: start,
      end_date: end,
      filters,
      expand_to_depth: 1,
      child_limit: COLUMN_CHILD_LIMIT,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        // The backend returns children for `axes[matched_depth]`; only accept
        // them when that matches this column's axis (defensive).
        const headAxis = res.tree[0]?.axis ?? axis;
        const items = headAxis === axis ? res.tree.map(nodeToItem) : [];
        const capped =
          res.total_top_axis_children != null &&
          res.total_top_axis_children > items.length;
        const next: ColumnState = {
          loading: false,
          error: false,
          items,
          capped,
        };
        setState(next);
        onItemsRef.current(axis, next);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        const next: ColumnState = {
          loading: false,
          error: true,
          items: [],
          capped: false,
        };
        setState(next);
        onItemsRef.current(axis, next);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, start, end, ag, axis, prefixKey]);

  const isDate = axis === "date";
  const showSearch = state.items.length > 12 && !isDate;
  const filtered = filter
    ? state.items.filter((it) =>
        it.value.toLowerCase().includes(filter.toLowerCase()),
      )
    : state.items;

  return (
    <div
      className={cls(
        "cols-col",
        axis === "instrument_id" && "cols-col-wide",
        isDate && "cols-col-date",
      )}
    >
      <div className="cols-col-header">
        <span>{axisLabel(axis)}</span>
        <span style={{ flex: 1 }} />
        {selections[axis] && (
          <span
            className="badge badge-info badge-mono"
            style={{ padding: "0 5px", fontSize: 9.5 }}
          >
            PINNED
          </span>
        )}
        <span className="cols-row-count">
          {state.loading ? "…" : state.items.length}
        </span>
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
        {state.loading && (
          <div
            className="muted text-xs"
            style={{ padding: 14, textAlign: "center" }}
          >
            loading…
          </div>
        )}
        {!state.loading && state.error && (
          <div
            className="muted text-xs"
            style={{ padding: 14, textAlign: "center" }}
          >
            unavailable
          </div>
        )}
        {!state.loading && !state.error && filtered.length === 0 && (
          <div
            className="muted text-xs"
            style={{ padding: 14, textAlign: "center" }}
          >
            {filter ? "No matches" : "no values"}
          </div>
        )}
        {!state.loading &&
          !state.error &&
          filtered.map((it) => (
            <PivotRow
              key={it.value}
              item={it}
              isActive={selections[axis] === it.value}
              axis={axis}
              onClick={() => onSelect(it.value)}
            />
          ))}
        {state.capped && !state.loading && (
          <div
            className="muted text-xs"
            style={{ padding: "6px 14px", textAlign: "center" }}
          >
            showing first {state.items.length} — narrow with a filter
          </div>
        )}
      </div>
    </div>
  );
}

/** Detail panel: pinned slice totals (real) + reason mini-breakdown + the real
 * manifest_uri + a download wired to the selected leaf's row_key. */
function PivotDetail({
  ds,
  ag,
  axes,
  selections,
  leafRowKey,
  onCellClick,
}: {
  ds: ServiceDataset;
  ag: string;
  axes: string[];
  selections: Selections;
  /** Exact tuple of the deepest pinned node (preferred download source). */
  leafRowKey: Record<string, string> | null;
  onCellClick: (p: CellClick) => void;
}) {
  const [totals, setTotals] = useState<DrilldownTotals | null>(null);
  const [reason, setReason] = useState<ReasonSummary | null>(null);
  const [manifestUri, setManifestUri] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const { service, start, end } = ds;
  // Pinned shard axes (excludes asset_group + unpinned). Used both as the
  // drilldown filter and as a stable effect key.
  const pinnedAxes = axes.filter((a) => selections[a] != null);
  const pinKey = pinnedAxes.map((a) => `${a}=${selections[a]}`).join("|");

  useEffect(() => {
    const controller = new AbortController();
    const filters: Record<string, string> = {};
    for (const a of pinnedAxes) filters[a] = selections[a] as string;
    setLoading(true);
    getHierarchicalDrilldown({
      service,
      asset_group: ag.toLowerCase(),
      start_date: start,
      end_date: end,
      filters,
      expand_to_depth: 0,
      signal: controller.signal,
    })
      .then((res) => {
        if (controller.signal.aborted) return;
        setTotals(res.totals);
        setReason(res.reason_summary ?? {});
        setManifestUri(res.manifest_uri);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setTotals(null);
        setReason(null);
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, start, end, ag, pinKey]);

  const pct = totals?.completion_pct ?? 0;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const tc =
    tone === "good"
      ? "var(--color-accent-green)"
      : tone === "warn"
        ? "var(--color-accent-amber)"
        : "var(--color-accent-red)";

  const pinnedSegments = ["asset_group", ...axes]
    .filter((a) => selections[a] != null)
    .map((a) => selections[a] as string);
  const unpinned = axes.filter((a) => selections[a] == null);

  // Download requires a venue + a date (the leaf). Prefer the leaf node's
  // exact row_key tuple; fall back to the pinned selections.
  const rk = leafRowKey ?? {};
  const venue = rk.venue ?? selections.venue;
  const day = rk.date ?? selections.date;
  const dataType = rk.data_type ?? selections.data_type ?? "";
  const instrumentType = rk.instrument_type ?? selections.instrument_type ?? "";
  const instrumentId = rk.instrument_id ?? selections.instrument_id;
  const chain = rk.chain ?? selections.chain;
  const canDownload = Boolean(ds.service && venue && day);

  const reasonRows = reason
    ? REASON_ORDER.map((id) => ({ id, count: reason[id] ?? 0 })).filter(
        (r) => r.count > 0,
      )
    : [];
  const reasonGroups = groupReasonSummary(reason ?? undefined);

  return (
    <div className="cols-col cols-col-detail">
      <div className="cols-col-header">
        <span>Detail</span>
        <span style={{ flex: 1 }} />
        <span className="text-xs muted font-mono">
          {pinnedSegments.length}/{axes.length + 1} pinned
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
              {loading ? "…" : `${pct.toFixed(1)}%`}
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
            <span>{fmtNumber(totals?.total ?? 0)} shards</span>
            {totals && totals.attempted_failed > 0 && (
              <span style={{ color: "var(--color-accent-red)" }}>
                {fmtNumber(totals.attempted_failed)} failed
              </span>
            )}
          </div>
        </div>
        {reasonRows.length > 0 && (
          <div className="cols-detail-section">
            <div className="cols-detail-label" style={{ marginBottom: 6 }}>
              Why
            </div>
            <div className="col" style={{ gap: 4 }}>
              {reasonRows.map((r) => {
                const meta = reasonMeta(r.id);
                return (
                  <div
                    key={r.id}
                    className="row"
                    style={{ gap: 8, alignItems: "center" }}
                    title={meta.hint}
                  >
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
            <div className="text-xs muted" style={{ marginTop: 6 }}>
              {reasonGroups.failed > 0
                ? `${fmtNumber(reasonGroups.failed)} failed`
                : "no failures in slice"}
            </div>
          </div>
        )}
        <div className="cols-detail-section">
          <div className="col" style={{ gap: 6 }}>
            <button
              className="btn btn-primary"
              style={{
                width: "100%",
                opacity: venue && day ? 1 : 0.5,
                cursor: venue && day ? "pointer" : "not-allowed",
              }}
              disabled={!venue || !day}
              onClick={() => {
                if (venue && day)
                  onCellClick({ ag, primaryValue: venue, date: day });
              }}
            >
              <Icons.Eye size={12} /> Inspect leaf shard
            </button>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn btn-outline"
                style={{
                  flex: 1,
                  opacity: canDownload ? 1 : 0.5,
                  cursor: canDownload ? "pointer" : "not-allowed",
                }}
                disabled={!canDownload}
                onClick={() => {
                  if (!canDownload) return;
                  const url = buildCsvDownloadUrl({
                    service: ds.service,
                    asset_group: ag,
                    venue: venue as string,
                    day: day as string,
                    instrument_type: instrumentType,
                    data_type: dataType,
                    instrument_ids: instrumentId ? [instrumentId] : [],
                    chain,
                    league_id: selections.league_id,
                    job_id: selections.job_id,
                  });
                  window.open(url, "_blank", "noopener");
                }}
                title={
                  canDownload
                    ? "Download this shard's rows as CSV"
                    : "Pin down to a venue and a date"
                }
              >
                <Icons.Download size={12} /> Download
              </button>
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
        {manifestUri && (
          <div className="cols-detail-section">
            <div className="cols-detail-label">Manifest index</div>
            <div
              className="font-mono text-xs"
              style={{
                color: "var(--color-text-tertiary)",
                wordBreak: "break-all",
                lineHeight: 1.55,
              }}
            >
              {manifestUri}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PivotHeader({
  ds,
  ag,
  axes,
  selections,
  clearSelection,
}: {
  ds: ServiceDataset;
  ag: string;
  axes: string[];
  selections: Selections;
  clearSelection: (axis: string) => void;
}) {
  const a = ds.agData[ag];
  const segments = ["asset_group", ...axes]
    .map((axis) => ({ axis, value: selections[axis] }))
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
            Pick a value in any column to pin it. Each column shows only values
            that co-occur with the pins. Click a pinned value again to unpin.
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
          {fmtNumber(a.total.total)} shards · {axes.length} axes
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
  void filters; // date range comes from `ds.start`/`ds.end`; kept for API parity.
  const initialAg = ds.ags[0];
  const [selections, setSelections] = useState<Selections>({
    asset_group: initialAg,
  });
  // Loaded items per axis (from the drilldown columns) — drives auto-advance of
  // the instrument_id axis and supplies the leaf row_key for downloads.
  const [columnItems, setColumnItems] = useState<Record<string, ColumnState>>(
    {},
  );

  const ag = selections.asset_group || ds.ags[0];

  useEffect(() => {
    setSelections({ asset_group: ds.ags[0] });
    setColumnItems({});
  }, [ds.service, ds.ags]);

  // The ordered shard axes come from the backend drilldown (authoritative for
  // this (service, asset_group)). Fetched once per AG via the unfiltered call,
  // so columns reflect the REAL shard atom — instruments-service shows only
  // [venue, date] (no junk data_type/instrument_type), DeFi MTDS shows
  // [venue, chain, data_type, instrument_id, date], etc.
  // The ordered shard axes are STATIC config (the canonical shard atom for this
  // service × asset_group) — they come from `/config/shard-axis-matrix`, NOT a
  // GCS drilldown. Sourcing them from the matrix is instant + reliable (a cold
  // drilldown read raced/aborted and left the cascade showing "0 axes"), and it
  // is authoritative: instruments-service resolves to just [venue] (+ chain for
  // defi) so it never shows junk data_type/instrument_type columns. We append
  // `date` as the leaf axis (the drilldown appends it server-side too).
  const [axes, setAxes] = useState<string[]>([]);
  const { service: dsService, start: dsStart, end: dsEnd } = ds;
  useEffect(() => {
    if (!ag) {
      setAxes([]);
      return;
    }
    const controller = new AbortController();
    setColumnItems({});
    getShardAxisMatrix(dsService, controller.signal)
      .then((m) => {
        if (controller.signal.aborted) return;
        const sa = m.shard_axes?.[dsService]?.[ag.toLowerCase()] ?? [];
        setAxes(sa.includes("date") ? [...sa] : [...sa, "date"]);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAxes([]);
      });
    return () => controller.abort();
  }, [dsService, dsStart, dsEnd, ag]);

  const setAxis = (axis: string, value: string) => {
    setSelections((s) => {
      const next: Selections = { ...s };
      if (next[axis] === value) {
        if (axis !== "asset_group") {
          // Unpin this axis AND every deeper axis (prefix invariant).
          const idx = axis === "asset_group" ? -1 : axes.indexOf(axis);
          delete next[axis];
          if (idx >= 0) {
            for (let i = idx + 1; i < axes.length; i++) delete next[axes[i]];
          }
        }
      } else {
        next[axis] = value;
        if (axis === "asset_group") {
          for (const k of Object.keys(next))
            if (k !== "asset_group") delete next[k];
        } else {
          // Pinning a new value invalidates every deeper pin.
          const idx = axes.indexOf(axis);
          for (let i = idx + 1; i < axes.length; i++) delete next[axes[i]];
        }
      }
      return next;
    });
  };
  const clearSelection = (axis: string) =>
    setSelections((s) => {
      const next = { ...s };
      delete next[axis];
      const idx = axes.indexOf(axis);
      if (idx >= 0) {
        for (let i = idx + 1; i < axes.length; i++) delete next[axes[i]];
      }
      return next;
    });

  const handleItems = (axis: string, state: ColumnState) => {
    setColumnItems((prev) => {
      const existing = prev[axis];
      if (
        existing &&
        existing.loading === state.loading &&
        existing.error === state.error &&
        existing.capped === state.capped &&
        existing.items.length === state.items.length &&
        existing.items.every((it, i) => it.value === state.items[i]?.value)
      ) {
        return prev;
      }
      return { ...prev, [axis]: state };
    });
  };

  // Auto-advance the instrument_id axis when it is the next unpinned axis and
  // the slice has NO distinct instrument_ids (bundled data_type → blank id).
  // Pin "" so the `date` column (which follows instrument_id) can render.
  useEffect(() => {
    const idIdx = axes.indexOf("instrument_id");
    if (idIdx < 0) return;
    // Only auto-advance when the contiguous prefix up to instrument_id is
    // pinned and instrument_id itself is unpinned.
    for (let i = 0; i < idIdx; i++) {
      if (selections[axes[i]] == null) return;
    }
    if (selections.instrument_id != null) return;
    const st = columnItems.instrument_id;
    if (st && !st.loading && !st.error && st.items.length === 0) {
      setSelections((s) => ({ ...s, instrument_id: "" }));
    }
  }, [axes, selections, columnItems]);

  // Resolve the deepest pinned node's exact row_key for the download.
  const leafRowKey = useMemo(() => {
    let deepest: Record<string, string> | null = null;
    for (const axis of axes) {
      const val = selections[axis];
      if (val == null) break;
      const st = columnItems[axis];
      const match = st?.items.find((it) => it.value === val);
      if (match && Object.keys(match.rowKey).length > 0) {
        deepest = match.rowKey;
      }
    }
    return deepest;
  }, [axes, selections, columnItems]);

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
        axes={axes}
        selections={selections}
        clearSelection={clearSelection}
      />
      <div className="cols-wrap">
        <AssetGroupColumn
          ds={ds}
          selections={selections}
          onSelect={(v) => setAxis("asset_group", v)}
        />
        {axes.map((axis, depth) => (
          <DrilldownColumn
            key={axis}
            ds={ds}
            ag={ag}
            axis={axis}
            depth={depth}
            axes={axes}
            selections={selections}
            onSelect={(v) => setAxis(axis, v)}
            onItems={handleItems}
          />
        ))}
        <PivotDetail
          ds={ds}
          ag={ag}
          axes={axes}
          selections={selections}
          leafRowKey={leafRowKey}
          onCellClick={onCellClick}
        />
      </div>
    </div>
  );
}
