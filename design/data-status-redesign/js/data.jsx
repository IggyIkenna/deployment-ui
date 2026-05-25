// Axis-aware data generator. The matrix structure is now:
//
//   ds = {
//     service, ags, agData: {
//       [ag]: {
//         primary,        // primary axis name (string)
//         primaryValues,  // ordered array of primary-axis values
//         subAxes,        // remaining shard axes (drilldown order)
//         shardsPerCell,  // # sub-shards rolled into each (primary, day) cell
//         grid: { [primaryValue]: { [date]: cellStats } },
//         byPrimary: { [primaryValue]: cellStats },  // rolled-up across dates
//         total: cellStats,
//       }
//     }
//   }
//
// cellStats:
//   {
//     total, captured, empty, 'known-empty', failed, unattempted, partial,
//     status (worst-of), coverage (0..1), rows,
//     failedSubShards: [{...shard coords + reason + pillar}]   // top 8
//   }

const TODAY = new Date(2026, 4, 24);
const DATE_END = ymd(TODAY);
const DATE_START = ymd(addDays(TODAY, -29)); // 30-day window

const SERVICES = [
  { name: "instruments-service",            label: "Instruments",         layer: "Data pipeline" },
  { name: "market-tick-data-service",       label: "Market Tick Data",    layer: "Data pipeline" },
  { name: "market-data-processing-service", label: "Market Data Proc.",   layer: "Data pipeline" },
  { name: "features-service",               label: "Features",            layer: "Features" },
  { name: "ml-training-service",            label: "ML Training",         layer: "ML" },
  { name: "ml-inference-service",           label: "ML Inference",        layer: "ML" },
  { name: "strategy-service",               label: "Strategy",            layer: "Strategy & Exec" },
  { name: "execution-service",              label: "Execution",           layer: "Strategy & Exec" },
  { name: "deployment-api",                 label: "Deployment API",      layer: "Infrastructure" },
];

// Per-AG health profile — drives synthetic status distribution.
const AG_PROFILES = {
  cefi:       { c: 0.94, e: 0.02, k: 0.01, f: 0.012, u: 0.018, partial: 0.000 },
  defi:       { c: 0.80, e: 0.05, k: 0.03, f: 0.09,  u: 0.03,  partial: 0.000 },
  tradfi:     { c: 0.71, e: 0.27, k: 0,    f: 0.005, u: 0.015, partial: 0.000 },
  sports:     { c: 0.78, e: 0.14, k: 0.04, f: 0.02,  u: 0.02,  partial: 0.000 },
  prediction: { c: 0.55, e: 0.08, k: 0.04, f: 0.04,  u: 0.29,  partial: 0.000 },
  shared:     { c: 0.92, e: 0.01, k: 0.03, f: 0.01,  u: 0.03,  partial: 0.000 },
};

const STATUS_KEYS = ["captured", "empty", "known-empty", "failed", "unattempted", "partial"];

const FAILURE_REASONS = [
  { key: "rate_limit",      label: "Rate limit",         pillar: "upstream_throttle" },
  { key: "auth_expired",    label: "Auth token expired", pillar: "auth" },
  { key: "schema_drift",    label: "Schema drift",       pillar: "schema" },
  { key: "venue_outage",    label: "Venue outage",       pillar: "upstream_outage" },
  { key: "parser_error",    label: "Parser error",       pillar: "parser" },
  { key: "writer_oom",      label: "Writer OOM",         pillar: "infra" },
];

const STATUS_RANK = { captured: 0, empty: 1, "known-empty": 1, partial: 2, unattempted: 3, failed: 4, future: 0, none: 0 };
const worstOf = (a, b) => (STATUS_RANK[a] || 0) >= (STATUS_RANK[b] || 0) ? a : b;

function pickStatus(rng, prof) {
  const r = rng();
  let acc = 0;
  acc += prof.c;  if (r < acc) return "captured";
  acc += prof.e;  if (r < acc) return "empty";
  acc += prof.k;  if (r < acc) return "known-empty";
  acc += prof.f;  if (r < acc) return "failed";
  acc += prof.partial; if (r < acc) return "partial";
  return "unattempted";
}

function weekendOverride(ag, date) {
  const dow = parseYmd(date).getDay();
  if ((ag === "tradfi") && (dow === 0 || dow === 6)) return "known-empty";
  return null;
}

/** Sub-shard cardinality for a (service, ag, primaryValue). */
function shardsPerPrimary(service, ag, primaryValue, cap = 400) {
  const subAxes = (getShardAxes(service, ag) || []).slice(1);
  let n = 1;
  for (const ax of subAxes) {
    const vals = axisValues(ax, ag, { venue: primaryValue });
    if (ax === "instrument_id") n *= Math.min(20, vals.length || 20);
    else if (ax === "league_id") n *= 6;
    else if (ax === "job_id") n *= 4;
    else if (ax === "fixture_id") n *= 10;
    else n *= Math.max(1, vals.length || 1);
  }
  return Math.min(n, cap);
}

/** Build the dataset for one service across all its asset groups. */
function buildServiceDataset({ service = "market-tick-data-service", seed = 42, shardCap = 400 } = {}) {
  const ags = AGS_FOR_SERVICE[service] || [];
  const agData = {};

  for (const ag of ags) {
    const shardAxes  = getShardAxes(service, ag);
    const primary    = getPrimaryAxis(service, ag);
    const subAxes    = shardAxes.slice(1);
    const primaryValues = axisValuesFor(service, ag, primary);
    if (primaryValues.length === 0) {
      agData[ag] = makeEmpty(primary, primaryValues, subAxes);
      continue;
    }

    const profile = AG_PROFILES[ag] || AG_PROFILES.shared;
    const dates = enumerateDates(DATE_START, DATE_END);
    const rng = mulberry32(seed + hashString(service + ag));

    const grid = {};
    const byPrimary = {};
    const total = emptyCell();
    let shardsPerCellTotal = 0; let cellsCounted = 0;

    for (const pv of primaryValues) {
      grid[pv] = {};
      byPrimary[pv] = emptyCell();
      const shardsPerCell = shardsPerPrimary(service, ag, pv, shardCap);
      shardsPerCellTotal += shardsPerCell; cellsCounted++;

      // Per-(primary, date) bias — make a few primary values genuinely bad.
      const venueIsTroubled = (ag === "defi" && (pv === "uniswap_v3" || pv === "curve"))
                           || (ag === "prediction" && pv === "kalshi")
                           || (ag === "cefi" && pv === "deribit");
      const venueIsHealthy  = (ag === "cefi" && pv === "binance")
                           || (ag === "tradfi" && pv === "nyse");
      const localProfile = venueIsHealthy ? { ...profile, c: Math.min(0.985, profile.c + 0.05), f: 0.003, u: 0.005 }
                          : venueIsTroubled ? { ...profile, c: profile.c - 0.18, f: profile.f * 3, u: profile.u * 1.8 }
                          : profile;

      // PREDICTION+polymarket: the most recent 10 days of canonical_question_group=us_elections etc unattempted
      const recencyCut = (ag === "prediction" && pv === "polymarket") ? 8 : 0;

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const future = parseYmd(date) > TODAY;
        if (future) { grid[pv][date] = futureCell(shardsPerCell); continue; }

        const wkOver = weekendOverride(ag, date);

        const cell = emptyCell(); cell.total = shardsPerCell;
        // For each sub-shard, pick a status. Generate at LEAST 1 sub-shard so
        // the cell has color even for instruments-service (shardsPerCell=1).
        const recencyForce = (recencyCut && i > dates.length - 1 - recencyCut);
        for (let s = 0; s < shardsPerCell; s++) {
          let st = wkOver
            ? wkOver
            : recencyForce ? "unattempted"
            : pickStatus(rng, localProfile);
          cell[st]++;
        }
        // Honest empties for known weekend cases stay "empty"/"known-empty".

        // Cell-level status: thresholds based on share of sub-shards (NOT
        // "any-failure → red"). With deep granularity (e.g. 400 sub-shards/
        // cell for MTDS+CeFi), a single dropped shard out of 400 should not
        // light up the whole day red.
        const failedFrac      = cell.total === 0 ? 0 : cell.failed / cell.total;
        const unattemptedFrac = cell.total === 0 ? 0 : cell.unattempted / cell.total;
        const capturedFrac    = cell.total === 0 ? 0 : (cell.captured + cell.empty + cell["known-empty"]) / cell.total;

        let status;
        if (failedFrac >= 0.10)             status = "failed";
        else if (unattemptedFrac >= 0.50)   status = "missing";
        else if (failedFrac > 0 || unattemptedFrac > 0 || cell.partial > 0)
                                            status = "partial";
        else if (capturedFrac === 1 && cell.captured === 0)
                                            status = "empty";
        else                                status = "captured";

        cell.status = status;
        cell.coverage = cell.total === 0 ? 0 :
          (cell.captured + cell.empty + cell["known-empty"]) / cell.total;

        // Rows for captured sub-shards (rough)
        cell.rows = Math.round((cell.captured + 0.3 * cell.partial) * (50_000 + 200_000 * rng()));

        // Top failure reasons for this cell — for the drawer's drilldown.
        if (cell.failed > 0) {
          const r = FAILURE_REASONS[Math.floor(rng() * FAILURE_REASONS.length)];
          cell.dominantFailure = r;
        }
        grid[pv][date] = cell;

        // Aggregate up
        for (const k of STATUS_KEYS) byPrimary[pv][k] += cell[k];
        byPrimary[pv].total += cell.total; byPrimary[pv].rows += cell.rows;
        for (const k of STATUS_KEYS) total[k] += cell[k];
        total.total += cell.total; total.rows += cell.rows;
      }

      // Status of the primary-value rollup (across all dates).
      const byPv = byPrimary[pv];
      const fFrac = byPv.total === 0 ? 0 : byPv.failed / byPv.total;
      const uFrac = byPv.total === 0 ? 0 : byPv.unattempted / byPv.total;
      byPv.status =
        fFrac >= 0.05 ? "failed" :
        uFrac >= 0.20 ? "missing" :
        fFrac > 0 || uFrac > 0 || byPv.partial > 0 ? "partial" :
        "captured";
      byPv.coverage = byPv.total === 0 ? 0 :
        (byPv.captured + byPv.empty + byPv["known-empty"]) / byPv.total;
    }

    total.coverage = total.total === 0 ? 0 :
      (total.captured + total.empty + total["known-empty"]) / total.total;
    total.honestCoverage = total.total === 0 ? 0 :
      (total.captured + total.empty + total["known-empty"]) /
      Math.max(1, total.captured + total.empty + total["known-empty"] + total.failed + total.unattempted);

    agData[ag] = {
      primary, primaryValues, subAxes,
      shardsPerCell: Math.round(shardsPerCellTotal / Math.max(1, cellsCounted)),
      grid, byPrimary, total,
    };
  }

  return { service, ags, agData };
}

/** Get the SERIES of values for the primary axis on this (service, ag).
 *  For axes that are open-ended (job_id, fixture_id), synthesize stable IDs. */
function axisValuesFor(service, ag, axis) {
  const v = axisValues(axis, ag);
  if (v.length > 0) return v;
  if (axis === "job_id")     return ["job_a8f2", "job_b3e1", "job_c7d4", "job_e9a5"];
  if (axis === "fixture_id") return ["fx_1001", "fx_1002", "fx_1003"];
  return [];
}

function emptyCell() {
  return { total: 0, captured: 0, empty: 0, "known-empty": 0, failed: 0, unattempted: 0, partial: 0, status: "captured", coverage: 0, rows: 0 };
}
function futureCell(total = 0) {
  return { ...emptyCell(), status: "future", total: 0 };
}
function makeEmpty(primary, primaryValues, subAxes) {
  return { primary, primaryValues, subAxes, shardsPerCell: 0, grid: {}, byPrimary: {}, total: emptyCell() };
}
function enumerateDates(start, end) {
  const out = []; let d = parseYmd(start); const ed = parseYmd(end);
  while (d <= ed) { out.push(ymd(d)); d = addDays(d, 1); }
  return out;
}
function hashString(s) {
  let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h;
}

/* ───────────────── Recent failures / missing across the dataset ───────────────── */

function recentFailures(ds, { limit = 6, sinceDays = 14 } = {}) {
  const cutoff = addDays(TODAY, -sinceDays);
  const out = [];
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] || {};
      for (const date of Object.keys(days)) {
        if (parseYmd(date) < cutoff) continue;
        const c = days[date];
        if (c.failed > 0) out.push({ ag, primary: a.primary, primaryValue: pv, date, failed: c.failed, total: c.total, reason: c.dominantFailure });
      }
    }
  }
  out.sort((a, b) => (b.date.localeCompare(a.date)) || (b.failed - a.failed));
  return out.slice(0, limit);
}

function recentMissing(ds, { limit = 6, sinceDays = 14 } = {}) {
  const cutoff = addDays(TODAY, -sinceDays);
  const blocks = {};
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] || {};
      const sorted = Object.keys(days).sort();
      let block = null;
      for (const date of sorted) {
        if (parseYmd(date) < cutoff || parseYmd(date) > TODAY) continue;
        const c = days[date];
        const isMissing = c.unattempted > c.total * 0.3 || c.total === 0;
        if (isMissing) {
          if (!block) block = { ag, primary: a.primary, primaryValue: pv, start: date, end: date, count: 1 };
          else { block.end = date; block.count++; }
        } else if (block) {
          blocks[`${ag}-${pv}-${block.start}`] = block; block = null;
        }
      }
      if (block) blocks[`${ag}-${pv}-${block.start}`] = block;
    }
  }
  return Object.values(blocks).sort((a, b) => b.count - a.count).slice(0, limit);
}

function staleCapture(ds, { limit = 3, behindDays = 2 } = {}) {
  const out = [];
  for (const ag of ds.ags) {
    const a = ds.agData[ag];
    for (const pv of a.primaryValues) {
      const sorted = Object.keys(a.grid[pv] || {}).sort().reverse();
      let last = null;
      for (const date of sorted) {
        if (parseYmd(date) > TODAY) continue;
        const c = a.grid[pv][date];
        if (c.captured > 0 || c.empty > 0) { last = date; break; }
      }
      if (last) {
        const gap = daysBetween(last, ymd(TODAY));
        if (gap >= behindDays) out.push({ ag, primary: a.primary, primaryValue: pv, lastCaptured: last, gap });
      }
    }
  }
  return out.sort((a, b) => b.gap - a.gap).slice(0, limit);
}

/* ───────── Per-AG rollup at date-level (for heatmap calendar) ───────── */

function rollUpDates(ds, ag, startDate, endDate) {
  const a = ds.agData[ag]; if (!a) return {};
  const startD = parseYmd(startDate); const endD = parseYmd(endDate);
  const byDate = {};
  for (const pv of a.primaryValues) {
    const days = a.grid[pv] || {};
    for (const date of Object.keys(days)) {
      const d = parseYmd(date);
      if (d < startD || d > endD) continue;
      const c = days[date];
      const acc = byDate[date] ||= emptyCell();
      for (const k of STATUS_KEYS) acc[k] += c[k];
      acc.total += c.total; acc.rows += c.rows;
    }
  }
  for (const date of Object.keys(byDate)) {
    const c = byDate[date];
    c.coverage = c.total === 0 ? 0 :
      (c.captured + c.empty + c["known-empty"]) / c.total;
    const fFrac = c.total === 0 ? 0 : c.failed / c.total;
    const uFrac = c.total === 0 ? 0 : c.unattempted / c.total;
    c.status =
      fFrac >= 0.10 ? "failed" :
      uFrac >= 0.50 ? "missing" :
      fFrac > 0 || uFrac > 0 || c.partial > 0 ? "partial" :
      c.captured === 0 && c.empty + c["known-empty"] === c.total ? "empty" :
      "captured";
  }
  return byDate;
}

/* ───────── Date-range rollup for the hero ───────── */

function rollupService(ds, { ags, startDate, endDate } = {}) {
  const startD = parseYmd(startDate || DATE_START);
  const endD = parseYmd(endDate || DATE_END);
  const include = (ags && ags.length) ? new Set(ags.map(a => a.toLowerCase())) : null;
  const overall = emptyCell();
  const byAg = {};
  for (const ag of ds.ags) {
    if (include && !include.has(ag)) continue;
    const a = ds.agData[ag];
    const accAg = emptyCell();
    for (const pv of a.primaryValues) {
      const days = a.grid[pv] || {};
      for (const date of Object.keys(days)) {
        const d = parseYmd(date);
        if (d < startD || d > endD) continue;
        const c = days[date];
        for (const k of STATUS_KEYS) { accAg[k] += c[k]; overall[k] += c[k]; }
        accAg.total += c.total; overall.total += c.total;
        accAg.rows += c.rows; overall.rows += c.rows;
      }
    }
    accAg.coverage = accAg.total === 0 ? 0 :
      (accAg.captured + accAg.empty + accAg["known-empty"]) / accAg.total;
    accAg.honestCoverage = accAg.total === 0 ? 0 :
      (accAg.captured + accAg.empty + accAg["known-empty"]) /
      Math.max(1, accAg.captured + accAg.empty + accAg["known-empty"] + accAg.failed + accAg.unattempted);
    byAg[ag] = accAg;
  }
  overall.coverage = overall.total === 0 ? 0 :
    (overall.captured + overall.empty + overall["known-empty"]) / overall.total;
  overall.honestCoverage = overall.total === 0 ? 0 :
    (overall.captured + overall.empty + overall["known-empty"]) /
    Math.max(1, overall.captured + overall.empty + overall["known-empty"] + overall.failed + overall.unattempted);
  return { byAg, overall };
}

Object.assign(window, {
  TODAY, DATE_END, DATE_START,
  SERVICES, AG_PROFILES, STATUS_KEYS, FAILURE_REASONS,
  buildServiceDataset, axisValuesFor,
  recentFailures, recentMissing, staleCapture,
  rollUpDates, rollupService,
  worstOf,
});
