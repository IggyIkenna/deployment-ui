/**
 * Real data layer for the redesigned Data Status tab.
 *
 * Builds the prototype's `ds` shape (see
 * `design/data-status-redesign/js/data.jsx` + `NOTES.md` § "Wiring to real
 * APIs") from the FAST `/api/data-status/turbo` + `/api/data-status/coverage-summary`
 * + `/api/config/shard-axis-matrix` endpoints.
 *
 * Why not `/grid`? The grid endpoint reads the full (172 MB) manifest index
 * per request and HANGS (60-90s+) on the real production manifest. Turbo
 * (~3.5s) + coverage-summary (~1.7s) read the consolidated rollups instead,
 * so the hero / AG tiles / Stacked / inventory / needs-attention render FAST.
 *
 * The per-`(primary,date)` `grid` (consumed only by the Heatmap + Matrix
 * visuals) is NOT built eagerly. It is loaded lazily via `loadAgGrid` when the
 * user selects one of those visuals — see `DataStatusRedesign`. Until then each
 * `AgData.grid` is an empty object and the date-grid visuals show a loading /
 * slow-load note.
 *
 * Status vocabulary — the prototype's cell keys mapped from the backend
 * 4-state `capture_status`:
 *   captured       <- captured
 *   empty          <- empty_confirmed   (honest, typed-reason empty)
 *   failed         <- attempted_failed
 *   known-empty    <- expected_unattempted_known_empty (when present)
 *   unattempted    <- expected_unattempted_pending_fetch (when present)
 */

import {
  getCoverageGrid,
  getDataStatusTurbo,
  getShardAxisMatrix,
  type CoverageGridCounts,
  type ShardAxisMatrixResponse,
  type TurboAssetGroupStatus,
  type TurboDataStatusResponse,
  type TurboSubDimension,
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

/** Per-primary-value (venue / data_type) date-level completion readout.
 * Carried through from the turbo sub-dimension entry so the Stacked visual +
 * the venue drawer can show exactly how many dates are done vs remaining vs
 * missing — and which specific dates. */
export interface VenueCompletion {
  datesFound: number;
  datesExpected: number;
  datesMissing: number;
  /** First ~25 missing dates (the backend truncates the list). */
  missingDates: string[];
  /** True total missing count (>= missingDates.length when truncated). */
  missingDatesTotal: number;
  completionPct: number;
  /** Declared data_types with zero found shards for this venue. */
  missingDataTypes: string[];
  /** When venue data first starts (venue-specific expected basis). */
  venueStart?: string;
}

export interface AgData {
  primary: string;
  primaryValues: string[];
  subAxes: string[];
  shardsPerCell: number;
  /** Per-(primaryValue, date) cell grid. Empty until `loadAgGrid` runs —
   * the Heatmap + Matrix visuals are the only consumers. */
  grid: Record<string, Record<string, CellStats>>;
  /** True once the lazy per-day grid has been merged in. */
  gridLoaded: boolean;
  byPrimary: Record<string, CellStats>;
  /** Per-primary-value date-level completion readout from turbo. */
  primaryMeta: Record<string, VenueCompletion>;
  total: AgRollup;
}

export interface ServiceDataset {
  service: string;
  ags: string[];
  agData: Record<string, AgData>;
  start: string;
  end: string;
  mode: string;
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

/** 4-state capture counts as exposed by turbo (AG-level + per-sub-dimension). */
interface CaptureStatusCounts {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted_known_empty?: number;
  expected_unattempted_pending_fetch?: number;
}

/** Build a CellStats from turbo's 4-state capture-status counts. */
function cellFromCaptureCounts(
  counts: CaptureStatusCounts | undefined,
): CellStats {
  const c = emptyCell();
  if (!counts) return c;
  c.captured = counts.captured ?? 0;
  c.empty = counts.empty_confirmed ?? 0;
  c.failed = counts.attempted_failed ?? 0;
  c["known-empty"] = counts.expected_unattempted_known_empty ?? 0;
  c.unattempted = counts.expected_unattempted_pending_fetch ?? 0;
  c.total = c.captured + c.empty + c.failed + c["known-empty"] + c.unattempted;
  c.status = statusFromCounts(c);
  c.coverage = coverageOf(c);
  // Illustrative row estimate (captured shards carry rows; honest empties don't).
  c.rows = Math.round(c.captured * 120_000);
  return c;
}

/** Build a CellStats from raw `/grid` 4-state counts (lazy per-day path). */
function cellFromGridCounts(counts: CoverageGridCounts): CellStats {
  const c = emptyCell();
  c.captured = counts.captured;
  c.empty = counts.empty_confirmed;
  c.failed = counts.attempted_failed;
  c.total = counts.captured + counts.empty_confirmed + counts.attempted_failed;
  c.status = statusFromCounts(c);
  c.coverage = coverageOf(c);
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

/** Read the capture-status counts off a turbo AG or sub-dimension entry. */
function captureCountsOf(
  entry: TurboAssetGroupStatus | TurboSubDimension,
): CaptureStatusCounts | undefined {
  // `counts` is the canonical 5-field alias; `capture_status_counts` is the
  // 3-field rollup. Prefer the canonical one when present.
  const withCounts = entry as {
    counts?: CaptureStatusCounts;
    capture_status_counts?: CaptureStatusCounts;
  };
  return withCounts.counts ?? withCounts.capture_status_counts;
}

/** Build a `VenueCompletion` from one turbo sub-dimension entry.
 *
 * Prefers `dates_expected_venue` (venue-specific expected based on venue start)
 * over the legacy asset-group-level `dates_expected`. The missing-date list is
 * read from `dates_missing_list` (the truncated first-25) falling back to
 * `missing_dates`; the true total is `dates_missing_count` when the list was
 * truncated, else the list length / `dates_missing`. */
function completionOf(entry: TurboSubDimension): VenueCompletion {
  const datesFound = entry.dates_found ?? 0;
  const datesExpected = entry.dates_expected_venue ?? entry.dates_expected ?? 0;
  const missingDates = entry.dates_missing_list ?? entry.missing_dates ?? [];
  const datesMissing =
    entry.dates_missing ??
    entry.dates_missing_count ??
    (datesExpected > datesFound ? datesExpected - datesFound : 0);
  const missingDatesTotal =
    entry.dates_missing_count ??
    (datesMissing > missingDates.length ? datesMissing : missingDates.length);
  return {
    datesFound,
    datesExpected,
    datesMissing,
    missingDates,
    missingDatesTotal,
    completionPct: entry.completion_pct ?? 0,
    missingDataTypes: entry.missing_data_types ?? [],
    venueStart: entry.venue_start_date ?? undefined,
  };
}

/** The sub-dimension map for one AG, keyed by the primary axis value. */
function subDimensionsOf(
  ag: TurboAssetGroupStatus,
  primary: string,
): Record<string, TurboSubDimension> {
  if (primary === "data_type" && ag.data_types) return ag.data_types;
  if (ag.venues) return ag.venues;
  if (ag.data_types) return ag.data_types;
  return {};
}

/** Convert one turbo asset_group block into the prototype's `AgData`
 * (fast path — `grid` left empty for lazy load). Exported for unit testing of
 * the per-venue completion (`primaryMeta`) projection. */
export function toAgData(
  ag: TurboAssetGroupStatus,
  primaryAxis: string,
  breakdownAxes: string[],
): AgData {
  const primary =
    primaryAxis || (ag.breakdown_axis === "data_type" ? "data_type" : "venue");
  const subDims = subDimensionsOf(ag, primary);
  const primaryValues = Object.keys(subDims);

  const byPrimary: Record<string, CellStats> = {};
  const primaryMeta: Record<string, VenueCompletion> = {};
  const total = emptyRollup();

  for (const pv of primaryValues) {
    const cell = cellFromCaptureCounts(captureCountsOf(subDims[pv]));
    byPrimary[pv] = cell;
    primaryMeta[pv] = completionOf(subDims[pv]);
    addInto(total, cell);
  }

  // When the AG carries its own rollup counts prefer them for the total
  // (sub-dimension sums can omit non-primary axes).
  const agCounts = captureCountsOf(ag);
  if (agCounts) {
    const agCell = cellFromCaptureCounts(agCounts);
    if (agCell.total > total.total) {
      total.total = agCell.total;
      total.captured = agCell.captured;
      total.empty = agCell.empty;
      total["known-empty"] = agCell["known-empty"];
      total.failed = agCell.failed;
      total.unattempted = agCell.unattempted;
      total.rows = agCell.rows;
    }
  }

  total.coverage = coverageOf(total);
  total.honestCoverage = honestCoverageOf(total);
  total.status = statusFromCounts(total);

  const subAxes = breakdownAxes.filter(
    (a) => a !== "date" && a !== primary && a !== "instrument_id",
  );

  return {
    primary,
    primaryValues,
    subAxes,
    shardsPerCell: primaryValues.length
      ? Math.round(total.total / primaryValues.length)
      : 0,
    grid: {},
    gridLoaded: false,
    byPrimary,
    primaryMeta,
    total,
  };
}

/** Resolve the primary + breakdown axes for `(service, asset_group)` from the
 * SHARD_AXIS_MATRIX SSOT (keys are lowercase asset_group). */
function axesForAg(
  matrix: ShardAxisMatrixResponse | null,
  service: string,
  ag: string,
): { primary: string; breakdowns: string[] } {
  const agKey = ag.toLowerCase();
  const primary = matrix?.primary_axis?.[service]?.[agKey] ?? "";
  const breakdowns = matrix?.breakdown_axes?.[service]?.[agKey] ?? [];
  return { primary, breakdowns };
}

/** Fetch + assemble the full `ds` for one service from the FAST endpoints. */
export async function buildServiceDataset(params: {
  service: string;
  start: string;
  end: string;
  mode?: string;
  signal?: AbortSignal;
}): Promise<ServiceDataset> {
  const turboMode = params.mode === "live" ? "live" : "batch";
  const [turbo, matrix] = await Promise.all([
    getDataStatusTurbo({
      service: params.service,
      start_date: params.start,
      end_date: params.end,
      mode: turboMode,
      include_sub_dimensions: true,
      signal: params.signal,
    }),
    getShardAxisMatrix(params.service, params.signal).catch(
      (): ShardAxisMatrixResponse => ({
        shard_axes: {},
        display_axes: {},
        primary_axis: {},
        breakdown_axes: {},
      }),
    ),
  ]);

  const agData: Record<string, AgData> = {};
  const ags: string[] = [];
  for (const [ag, block] of Object.entries(turbo.asset_groups)) {
    const { primary, breakdowns } = axesForAg(matrix, params.service, ag);
    const built = toAgData(block, primary, breakdowns);
    if (built.primaryValues.length === 0) continue;
    ags.push(ag);
    agData[ag] = built;
  }
  return {
    service: params.service,
    ags,
    agData,
    start: params.start,
    end: params.end,
    mode: params.mode ?? "batch",
  };
}

/**
 * Lazily load the per-(primary,date) grid from `/grid` and merge it into the
 * dataset. SLOW on the real production manifest — callers must show a spinner.
 * Returns a NEW dataset (immutable) so React re-renders. If the grid is
 * already loaded, the same dataset is returned unchanged.
 */
export async function loadAgGrid(params: {
  ds: ServiceDataset;
  signal?: AbortSignal;
}): Promise<ServiceDataset> {
  const { ds } = params;
  if (ds.ags.every((ag) => ds.agData[ag]?.gridLoaded)) return ds;

  const res = await getCoverageGrid({
    service: ds.service,
    start_date: ds.start,
    end_date: ds.end,
    signal: params.signal,
  });
  const dates = enumerateDates(ds.start, ds.end);
  const today = ymd(new Date());

  const nextAgData: Record<string, AgData> = {};
  for (const ag of ds.ags) {
    const existing = ds.agData[ag];
    const block = res.asset_groups[ag];
    if (!block) {
      nextAgData[ag] = existing;
      continue;
    }
    const grid: Record<string, Record<string, CellStats>> = {};
    for (const pv of existing.primaryValues) {
      const byDate: Record<string, CellStats> = {};
      const rawDays = block.grid[pv] ?? {};
      for (const date of dates) {
        const raw = rawDays[date];
        if (raw) {
          byDate[date] = cellFromGridCounts(raw);
        } else {
          const cell = emptyCell();
          cell.status = date > today ? "future" : "missing";
          byDate[date] = cell;
        }
      }
      grid[pv] = byDate;
    }
    nextAgData[ag] = { ...existing, grid, gridLoaded: true };
  }
  return { ...ds, agData: nextAgData };
}

/** Hero rollup over a date range + optional asset-group filter.
 *
 * When the per-day grid is loaded we sum the in-range cells; otherwise we use
 * the AG-level `total` (whole-window rollup from turbo). */
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
    if (include && !include.has(ag.toLowerCase())) continue;
    const a = ds.agData[ag];
    const acc = emptyRollup();
    if (a.gridLoaded) {
      for (const pv of a.primaryValues) {
        const days = a.grid[pv] ?? {};
        for (const date of Object.keys(days)) {
          const d = parseYmd(date);
          if (d < startD || d > endD) continue;
          addInto(acc, days[date]);
        }
      }
    } else {
      addInto(acc, a.total);
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

/** Per-date rollup across all primary values (heatmap calendars). Requires the
 * lazy grid; returns `{}` until it's loaded. */
export function rollUpDates(
  ds: ServiceDataset,
  ag: string,
  startDate: string,
  endDate: string,
): Record<string, CellStats> {
  const a = ds.agData[ag];
  if (!a || !a.gridLoaded) return {};
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

/** Recent failures.
 *
 * With the lazy grid loaded we report exact (primaryValue, date) failure
 * cells; without it we fall back to the per-primaryValue rollup (date column
 * shows the window end) so the panel still surfaces failing venues fast. */
export function recentFailures(
  ds: ServiceDataset,
  opts: { limit?: number } = {},
): FailureItem[] {
  const limit = opts.limit ?? 5;
  const out: FailureItem[] = [];
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    if (a.gridLoaded) {
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
    } else {
      for (const pv of a.primaryValues) {
        const c = a.byPrimary[pv];
        if (c && c.failed > 0) {
          out.push({
            ag,
            primary: a.primary,
            primaryValue: pv,
            date: ds.end,
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

/** Missing-date blocks. Requires the lazy grid (per-day granularity); returns
 * empty until it's loaded. */
export function recentMissing(
  ds: ServiceDataset,
  opts: { limit?: number } = {},
): MissingItem[] {
  const limit = opts.limit ?? 4;
  const t = today();
  const blocks: Record<string, MissingItem> = {};
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    if (!a.gridLoaded) continue;
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

/** Stale-capture detection. Requires the lazy grid; returns empty until loaded. */
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
    if (!a.gridLoaded) continue;
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

// Re-export so consumers can keep importing the turbo type from here if needed.
export type { TurboDataStatusResponse };
