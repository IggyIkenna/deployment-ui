/**
 * Real data layer for the redesigned Data Status tab.
 *
 * Builds the prototype's `ds` shape (see
 * `design/data-status-redesign/js/data.jsx` + `NOTES.md` § "Wiring to real
 * APIs") from the live `/api/data-status/grid` endpoint. The visuals consume
 * exactly this shape, so once it's built from real counts they render real
 * data with no further changes.
 *
 * Status vocabulary — the prototype's cell keys mapped from the backend
 * 4-state `capture_status`:
 *   captured       <- captured
 *   empty          <- empty_confirmed   (honest, typed-reason empty)
 *   failed         <- attempted_failed
 *   known-empty    <- (not distinguished by the grid; folded into empty)
 *   unattempted    <- derived: a (primary,date) cell absent from the grid
 *   partial/future <- derived per the prototype's cell rules
 */

import {
  getCoverageGrid,
  type CoverageGridAssetGroup,
  type CoverageGridCounts,
} from "../../api/client";
import { enumerateDates, parseYmd, ymd } from "./redesignUtil";

export type CellStatusName =
  | "captured"
  | "partial"
  | "failed"
  | "missing"
  | "empty"
  | "future";

export interface CellStats {
  total: number;
  captured: number;
  empty: number;
  "known-empty": number;
  failed: number;
  unattempted: number;
  partial: number;
  status: CellStatusName;
  coverage: number;
  rows: number;
}

export interface AgRollup extends CellStats {
  honestCoverage: number;
}

export interface AgData {
  primary: string;
  primaryValues: string[];
  subAxes: string[];
  shardsPerCell: number;
  grid: Record<string, Record<string, CellStats>>;
  byPrimary: Record<string, CellStats>;
  total: AgRollup;
}

export interface ServiceDataset {
  service: string;
  ags: string[];
  agData: Record<string, AgData>;
  start: string;
  end: string;
}

export interface ServiceRollup {
  byAg: Record<string, AgRollup>;
  overall: AgRollup;
}

const emptyCell = (): CellStats => ({
  total: 0,
  captured: 0,
  empty: 0,
  "known-empty": 0,
  failed: 0,
  unattempted: 0,
  partial: 0,
  status: "captured",
  coverage: 0,
  rows: 0,
});

const emptyRollup = (): AgRollup => ({ ...emptyCell(), honestCoverage: 0 });

/** Cell status from 4-state share — mirrors the prototype's thresholds. */
function statusFromCounts(c: CellStats): CellStatusName {
  if (c.total === 0) return "missing";
  const failedFrac = c.failed / c.total;
  const unattemptedFrac = c.unattempted / c.total;
  const okFrac = (c.captured + c.empty + c["known-empty"]) / c.total;
  if (failedFrac >= 0.1) return "failed";
  if (unattemptedFrac >= 0.5) return "missing";
  if (c.failed > 0 || c.unattempted > 0 || c.partial > 0) return "partial";
  if (okFrac === 1 && c.captured === 0) return "empty";
  return "captured";
}

function coverageOf(c: CellStats): number {
  return c.total === 0
    ? 0
    : (c.captured + c.empty + c["known-empty"]) / c.total;
}

function honestCoverageOf(c: CellStats): number {
  const ok = c.captured + c.empty + c["known-empty"];
  const denom = ok + c.failed + c.unattempted;
  return denom === 0 ? 0 : ok / denom;
}

/** Build a CellStats from raw backend counts for a single (primary,date) cell. */
function cellFromCounts(counts: CoverageGridCounts): CellStats {
  const c = emptyCell();
  c.captured = counts.captured;
  c.empty = counts.empty_confirmed;
  c.failed = counts.attempted_failed;
  c.total = counts.captured + counts.empty_confirmed + counts.attempted_failed;
  c.status = statusFromCounts(c);
  c.coverage = coverageOf(c);
  // Illustrative row estimate (captured shards carry rows; honest empties don't).
  c.rows = Math.round(c.captured * 120_000);
  return c;
}

function addInto(acc: CellStats, c: CellStats): void {
  acc.total += c.total;
  acc.captured += c.captured;
  acc.empty += c.empty;
  acc["known-empty"] += c["known-empty"];
  acc.failed += c.failed;
  acc.unattempted += c.unattempted;
  acc.partial += c.partial;
  acc.rows += c.rows;
}

/** Convert one asset_group grid block into the prototype's `AgData`. */
function toAgData(block: CoverageGridAssetGroup, dates: string[]): AgData {
  const primary = block.primary;
  const primaryValues = block.primary_values;
  const subAxes = block.sub_axes.filter((a) => a !== "date" && a !== primary);

  const grid: Record<string, Record<string, CellStats>> = {};
  const byPrimary: Record<string, CellStats> = {};
  const total = emptyRollup();
  const today = ymd(new Date());

  for (const pv of primaryValues) {
    const byDate: Record<string, CellStats> = {};
    const pvAcc = emptyCell();
    const rawDays = block.grid[pv] ?? {};
    for (const date of dates) {
      const raw = rawDays[date];
      if (raw) {
        const cell = cellFromCounts(raw);
        byDate[date] = cell;
        addInto(pvAcc, cell);
      } else {
        // Absent cell: future if beyond today, else not-yet-attempted (missing).
        const future = date > today;
        const cell = emptyCell();
        cell.status = future ? "future" : "missing";
        byDate[date] = cell;
      }
    }
    pvAcc.coverage = coverageOf(pvAcc);
    pvAcc.status = statusFromCounts(pvAcc);
    grid[pv] = byDate;
    byPrimary[pv] = pvAcc;
    addInto(total, pvAcc);
  }

  total.coverage = coverageOf(total);
  total.honestCoverage = honestCoverageOf(total);
  total.status = statusFromCounts(total);

  return {
    primary,
    primaryValues,
    subAxes,
    shardsPerCell: block.meta.days
      ? Math.round(
          block.meta.shards_per_day / Math.max(1, primaryValues.length),
        )
      : 0,
    grid,
    byPrimary,
    total,
  };
}

/** Fetch + assemble the full `ds` for one service across all its asset groups. */
export async function buildServiceDataset(params: {
  service: string;
  start: string;
  end: string;
  signal?: AbortSignal;
}): Promise<ServiceDataset> {
  const res = await getCoverageGrid({
    service: params.service,
    start_date: params.start,
    end_date: params.end,
    signal: params.signal,
  });
  const dates = enumerateDates(params.start, params.end);
  const agData: Record<string, AgData> = {};
  const ags: string[] = [];
  for (const [ag, block] of Object.entries(res.asset_groups)) {
    ags.push(ag);
    agData[ag] = toAgData(block, dates);
  }
  return {
    service: params.service,
    ags,
    agData,
    start: params.start,
    end: params.end,
  };
}

/** Hero rollup over a date range + optional asset-group filter. */
export function rollupService(
  ds: ServiceDataset,
  opts: { ags?: string[] | null; startDate: string; endDate: string },
): ServiceRollup {
  const startD = parseYmd(opts.startDate);
  const endD = parseYmd(opts.endDate);
  const include =
    opts.ags && opts.ags.length
      ? new Set(opts.ags.map((a) => a.toLowerCase()))
      : null;
  const overall = emptyRollup();
  const byAg: Record<string, AgRollup> = {};

  for (const ag of ds.ags) {
    if (include && !include.has(ag)) continue;
    const a = ds.agData[ag];
    const acc = emptyRollup();
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] ?? {};
      for (const date of Object.keys(days)) {
        const d = parseYmd(date);
        if (d < startD || d > endD) continue;
        addInto(acc, days[date]);
      }
    }
    acc.coverage = coverageOf(acc);
    acc.honestCoverage = honestCoverageOf(acc);
    acc.status = statusFromCounts(acc);
    byAg[ag] = acc;
    addInto(overall, acc);
  }
  overall.coverage = coverageOf(overall);
  overall.honestCoverage = honestCoverageOf(overall);
  overall.status = statusFromCounts(overall);
  return { byAg, overall };
}

/** Per-date rollup across all primary values (heatmap calendars). */
export function rollUpDates(
  ds: ServiceDataset,
  ag: string,
  startDate: string,
  endDate: string,
): Record<string, CellStats> {
  const a = ds.agData[ag];
  if (!a) return {};
  const startD = parseYmd(startDate);
  const endD = parseYmd(endDate);
  const byDate: Record<string, CellStats> = {};
  for (const pv of a.primaryValues) {
    const days = a.grid[pv] ?? {};
    for (const date of Object.keys(days)) {
      const d = parseYmd(date);
      if (d < startD || d > endD) continue;
      const acc = (byDate[date] ??= emptyCell());
      addInto(acc, days[date]);
    }
  }
  for (const date of Object.keys(byDate)) {
    const c = byDate[date];
    c.coverage = coverageOf(c);
    c.status = statusFromCounts(c);
  }
  return byDate;
}

// ───────────── Needs-attention derivations ─────────────

export interface FailureItem {
  ag: string;
  primary: string;
  primaryValue: string;
  date: string;
  failed: number;
  total: number;
}

export interface MissingItem {
  ag: string;
  primary: string;
  primaryValue: string;
  start: string;
  end: string;
  count: number;
}

export interface StaleItem {
  ag: string;
  primary: string;
  primaryValue: string;
  lastCaptured: string;
  gap: number;
}

const today = (): string => ymd(new Date());

export function recentFailures(
  ds: ServiceDataset,
  opts: { limit?: number } = {},
): FailureItem[] {
  const limit = opts.limit ?? 5;
  const out: FailureItem[] = [];
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] ?? {};
      for (const date of Object.keys(days)) {
        const c = days[date];
        if (c.failed > 0) {
          out.push({
            ag,
            primary: a.primary,
            primaryValue: pv,
            date,
            failed: c.failed,
            total: c.total,
          });
        }
      }
    }
  }
  out.sort((x, y) => y.date.localeCompare(x.date) || y.failed - x.failed);
  return out.slice(0, limit);
}

export function recentMissing(
  ds: ServiceDataset,
  opts: { limit?: number } = {},
): MissingItem[] {
  const limit = opts.limit ?? 4;
  const t = today();
  const blocks: Record<string, MissingItem> = {};
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] ?? {};
      const sorted = Object.keys(days).sort();
      let block: MissingItem | null = null;
      for (const date of sorted) {
        if (date > t) continue;
        const c = days[date];
        const isMissing = c.status === "missing" || c.total === 0;
        if (isMissing) {
          if (!block) {
            block = {
              ag,
              primary: a.primary,
              primaryValue: pv,
              start: date,
              end: date,
              count: 1,
            };
          } else {
            block.end = date;
            block.count++;
          }
        } else if (block) {
          blocks[`${ag}-${pv}-${block.start}`] = block;
          block = null;
        }
      }
      if (block) blocks[`${ag}-${pv}-${block.start}`] = block;
    }
  }
  return Object.values(blocks)
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}

export function staleCapture(
  ds: ServiceDataset,
  opts: { limit?: number; behindDays?: number } = {},
): StaleItem[] {
  const limit = opts.limit ?? 3;
  const behindDays = opts.behindDays ?? 2;
  const t = today();
  const out: StaleItem[] = [];
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const sorted = Object.keys(a.grid[pv] ?? {})
        .sort()
        .reverse();
      let last: string | null = null;
      for (const date of sorted) {
        if (date > t) continue;
        const c = a.grid[pv][date];
        if (c.captured > 0 || c.empty > 0) {
          last = date;
          break;
        }
      }
      if (last) {
        const gap = Math.round(
          (parseYmd(t).getTime() - parseYmd(last).getTime()) / 86_400_000,
        );
        if (gap >= behindDays) {
          out.push({
            ag,
            primary: a.primary,
            primaryValue: pv,
            lastCaptured: last,
            gap,
          });
        }
      }
    }
  }
  return out.sort((x, y) => y.gap - x.gap).slice(0, limit);
}

/** Map a cell status string to the CSS `data-status` token. */
export function mapStatusToCell(s: CellStatusName): string {
  if (s === "captured") return "captured";
  if (s === "empty") return "empty";
  if (s === "partial") return "partial";
  if (s === "failed") return "failed";
  if (s === "missing") return "missing";
  if (s === "future") return "future";
  return "none";
}
