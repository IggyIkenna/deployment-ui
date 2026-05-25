// Visual #4 — Pivot Columns.
//
// Every shard axis (incl. date) becomes a column. All columns always show
// their full value list with coverage % computed against the OTHER current
// selections. Click any row to set that axis's value — other axes stay
// pinned. Click an already-selected row to unset it. The detail pane shows
// the leaf shard once all (or enough) axes are selected.
//
// This replaces strict cascading navigation with multi-dim pivot navigation,
// which matches how operators actually compare shards.

/* ────── coverage synthesis helpers ──────
 * The prototype only has hard data at (ag, primary, date) granularity. For
 * deeper axes (instrument_id, instrument_type, data_type, …), we synthesize
 * coverage deterministically from the axes that ARE pinned. Each cell's
 * coverage is biased by the pinned parents (a bad venue makes its children
 * worse). Output is stable per (selection set, axis, value). */

const __pivotCache = new Map();
function pivotHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

function coverageFor({ ds, ag, axis, value, selections, filters }) {
  // Special case: if (ag, primary, date) is available in the real grid use it.
  const a = ds.agData[ag];
  const primary = a.primary;

  // 1) Asset group level → use total.coverage
  if (axis === "asset_group") {
    return ds.agData[value]?.total?.coverage || 0;
  }

  // 2) Primary axis without a pinned date → use byPrimary rollup
  if (axis === primary && !selections.date) {
    return a.byPrimary[value]?.coverage ?? a.total.coverage;
  }

  // 3) Date axis → either rollup across primary or for pinned primary
  if (axis === "date") {
    const pv = selections[primary];
    if (pv && a.grid[pv]?.[value]) return a.grid[pv][value].coverage;
    // Aggregate across primary values
    let captured = 0, total = 0;
    for (const p of a.primaryValues) {
      const c = a.grid[p]?.[value];
      if (!c) continue;
      captured += c.captured + c.empty + c["known-empty"];
      total += c.total;
    }
    return total === 0 ? 0 : captured / total;
  }

  // 4) Primary axis WITH pinned date → exact cell
  if (axis === primary && selections.date) {
    const c = a.grid[value]?.[selections.date];
    return c ? c.coverage : 0;
  }

  // 5) Otherwise synthesize deterministically from pinned axes.
  // Base bias: average of pinned parent coverages.
  let baseCoverage = a.total.coverage || 0.9;
  const pinned = Object.entries(selections).filter(([k, v]) => v && k !== axis);
  let n = 0; let sum = 0;
  for (const [k, v] of pinned) {
    const pc = coverageForLookup(ds, ag, k, v);
    if (pc != null) { sum += pc; n++; }
  }
  if (n > 0) baseCoverage = sum / n;

  const key = `${ds.service}|${ag}|${axis}|${value}|` + pinned.map(([k, v]) => `${k}=${v}`).sort().join("|");
  if (__pivotCache.has(key)) return __pivotCache.get(key);
  const rng = mulberry32(pivotHash(key));
  const jitter = -0.06 + rng() * 0.12;
  const cov = clamp01(baseCoverage + jitter);
  __pivotCache.set(key, cov);
  return cov;
}

// Cheap lookup helper used inside the recursion. Doesn't compute pinned-context.
function coverageForLookup(ds, ag, axis, value) {
  const a = ds.agData[ag];
  if (axis === "asset_group") return ds.agData[value]?.total?.coverage;
  if (axis === a.primary)     return a.byPrimary[value]?.coverage;
  if (axis === "date")        return null;
  return null;
}

function shardCountFor({ ds, ag, axis, value, selections }) {
  // Synthesize a per-(axis-value, selection-context) shard count.
  const a = ds.agData[ag];
  if (axis === "asset_group") return ds.agData[value]?.total?.total || 0;
  if (axis === a.primary && !selections.date) return a.byPrimary[value]?.total || 0;
  if (axis === "date") {
    const pv = selections[a.primary];
    if (pv) return a.grid[pv]?.[value]?.total || 0;
    let t = 0;
    for (const p of a.primaryValues) t += a.grid[p]?.[value]?.total || 0;
    return t;
  }
  // Deeper / sub-axis: synthesize from cardinality of axis under pinned parent
  const total = a.byPrimary[selections[a.primary]]?.total || a.total.total || 100;
  const cardinality = Math.max(1, axisValuesFor(ds.service, ag, axis).length);
  return Math.round(total / cardinality);
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/* ────── column data ────── */

function buildPivotColumns(ds, ag, filters) {
  // Each column has: { axis, label, values: [...] }. Date is appended last
  // before the detail pane.
  const a = ds.agData[ag];
  const axes = ["asset_group", ...(getShardAxes(ds.service, ag) || [])];

  const cols = [];
  for (const axis of axes) {
    let values;
    if (axis === "asset_group") values = ds.ags;
    else if (axis === a.primary) values = a.primaryValues;
    else {
      values = axisValuesFor(ds.service, ag, axis);
      if (values.length === 0 && (axis === "fixture_id")) {
        values = Array.from({ length: 8 }, (_, i) => `fx_${1000 + i}`);
      }
    }
    cols.push({ axis, values });
  }

  // Date column — full filter window
  const dates = [];
  let d = parseYmd(filters.start);
  const ed = parseYmd(filters.end);
  while (d <= ed) { dates.push(ymd(d)); d = addDays(d, 1); }
  cols.push({ axis: "date", values: dates });

  return cols;
}

/* ────── component ────── */

function VisualColumns({ ds, filters, onCellClick }) {
  const initialAg = ds.ags[0];
  // Selections — { asset_group, venue, data_type, ..., date } — at least asset_group set.
  const [selections, setSelections] = useState({ asset_group: initialAg });

  // Reset on service change.
  useEffect(() => {
    setSelections({ asset_group: ds.ags[0] });
  }, [ds.service]);

  const ag = selections.asset_group || ds.ags[0];
  const cols = useMemo(() => buildPivotColumns(ds, ag, filters), [ds, ag, filters.start, filters.end]);

  // Visible-column control (let the user collapse a few to declutter)
  const [hiddenAxes, setHiddenAxes] = useState(new Set());
  const visibleCols = cols.filter(c => !hiddenAxes.has(c.axis));

  const setAxis = (axis, value) => {
    setSelections((s) => {
      const next = { ...s };
      if (next[axis] === value) {
        // Clicking already-selected clears it (except asset_group)
        if (axis !== "asset_group") delete next[axis];
      } else {
        next[axis] = value;
        // Changing asset_group invalidates downstream selections.
        if (axis === "asset_group") {
          for (const k of Object.keys(next)) if (k !== "asset_group") delete next[k];
        }
      }
      return next;
    });
  };

  const clearSelection = (axis) => {
    setSelections((s) => {
      const next = { ...s }; delete next[axis]; return next;
    });
  };

  return (
    <div className="card" style={{ overflow: "hidden", padding: 0 }}>
      <PivotHeader
        ds={ds}
        ag={ag}
        cols={cols}
        hiddenAxes={hiddenAxes}
        setHiddenAxes={setHiddenAxes}
        selections={selections}
        clearSelection={clearSelection}
      />

      <div className="cols-wrap">
        {visibleCols.map((col) => (
          <PivotColumnPanel
            key={col.axis}
            ds={ds}
            ag={ag}
            col={col}
            selections={selections}
            onSelect={(v) => setAxis(col.axis, v)}
            filters={filters}
          />
        ))}
        <PivotDetail
          ds={ds}
          ag={ag}
          selections={selections}
          cols={cols}
          filters={filters}
          onCellClick={onCellClick}
        />
      </div>
    </div>
  );
}

/* ────── header — selection chips + column visibility ────── */

function PivotHeader({ ds, ag, cols, hiddenAxes, setHiddenAxes, selections, clearSelection }) {
  const a = ds.agData[ag];
  // Selections in axis order
  const segments = cols.map((c) => ({ axis: c.axis, value: selections[c.axis] }))
                       .filter((s) => s.value);

  const toggleAxis = (axis) => {
    setHiddenAxes((s) => {
      const next = new Set(s);
      if (next.has(axis)) next.delete(axis); else next.add(axis);
      return next;
    });
  };

  return (
    <div style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div className="row" style={{ padding: "8px 14px", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="text-xs muted" style={{ fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>Query</span>
        {segments.length === 1 ? (
          <span className="text-xs muted">Pick a value in any column to pin it. Click a pinned value again to unpin.</span>
        ) : (
          segments.map((s) => (
            <span key={s.axis} className="chip chip-active">
              <span className="muted" style={{ marginRight: 2 }}>{s.axis}=</span>{s.value}
              {s.axis !== "asset_group" && (
                <span className="chip-x" onClick={() => clearSelection(s.axis)}>×</span>
              )}
            </span>
          ))
        )}
        <div style={{ flex: 1 }}/>
        <span className="text-xs muted font-mono">
          {fmtNumber(a.total.total)} shards · {cols.length - 1} axes + date
        </span>
      </div>

      {/* column visibility toggles */}
      <div className="row" style={{ padding: "6px 14px", gap: 4, flexWrap: "wrap", borderTop: "1px solid var(--color-border-subtle)", background: "var(--color-bg-tertiary)", alignItems: "center" }}>
        <span className="text-xs muted" style={{ marginRight: 4, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>Columns</span>
        {cols.map((c) => {
          const visible = !hiddenAxes.has(c.axis);
          const hasSelection = !!selections[c.axis];
          return (
            <button
              key={c.axis}
              className={cls("btn", "btn-xs", visible ? "btn-outline" : "btn-ghost")}
              onClick={() => toggleAxis(c.axis)}
              style={{
                borderColor: hasSelection ? "var(--color-accent-cyan)" : (visible ? "var(--color-border-default)" : "transparent"),
                color: hasSelection ? "var(--color-accent-cyan)" : (visible ? "var(--color-text-secondary)" : "var(--color-text-muted)"),
                opacity: visible ? 1 : 0.55,
              }}
              title={visible ? `Hide ${c.axis}` : `Show ${c.axis}`}
            >
              {visible ? <Icons.Eye size={11}/> : <Icons.X size={11}/>}
              <span className="font-mono">{c.axis}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────── one column ────── */

function PivotColumnPanel({ ds, ag, col, selections, onSelect, filters }) {
  const [filter, setFilter] = useState("");
  const items = useMemo(() => {
    return col.values.map((v) => ({
      value: v,
      coverage: coverageFor({ ds, ag, axis: col.axis, value: v, selections, filters }),
      count: shardCountFor({ ds, ag, axis: col.axis, value: v, selections }),
    }));
  }, [ds, ag, col, selections, filters]);

  // Keep rows in natural (insertion) order so pinning a value doesn't
  // reorder the column. Coverage % is the signal; row position stays stable.
  const sorted = items;

  const showSearch = sorted.length > 12 && col.axis !== "date";
  const filtered = filter
    ? sorted.filter((it) => String(it.value).toLowerCase().includes(filter.toLowerCase()))
    : sorted;

  const isDate = col.axis === "date";

  return (
    <div className={cls("cols-col", col.axis === "instrument_id" && "cols-col-wide", isDate && "cols-col-date")}>
      <div className="cols-col-header">
        <span>{axisLabel(col.axis)}</span>
        <span style={{ flex: 1 }}/>
        {selections[col.axis] && (
          <span className="badge badge-info badge-mono" style={{ padding: "0 5px", fontSize: 9.5 }}>
            PINNED
          </span>
        )}
        <span className="cols-row-count">{col.values.length}</span>
      </div>
      {showSearch && (
        <div className="cols-search">
          <Icons.Search size={11} className="muted"/>
          <input placeholder={`Filter…`} value={filter} onChange={(e) => setFilter(e.target.value)}/>
          {filter && (<span style={{ cursor: "pointer", color: "var(--color-text-muted)" }} onClick={() => setFilter("")}><Icons.X size={11}/></span>)}
        </div>
      )}
      <div className="cols-col-body">
        {filtered.length === 0 && (
          <div className="muted text-xs" style={{ padding: 14, textAlign: "center" }}>No matches</div>
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

function PivotRow({ item, isActive, axis, onClick }) {
  const pct = (item.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const toneColor = tone === "good" ? "var(--color-accent-green)" : tone === "warn" ? "var(--color-accent-amber)" : "var(--color-accent-red)";

  const isDate = axis === "date";

  return (
    <div
      className={cls("cols-row", isActive && "cols-row-active", isDate && "cols-row-date")}
      onClick={onClick}
      title={`${item.value}: ${pct.toFixed(1)}% coverage · ${fmtNumber(item.count)} shards`}
    >
      <span/>
      <span className="cols-row-name truncate">{isDate ? fmtDateFull(item.value) : item.value}</span>
      <span className={cls("cols-row-pct", tone)}>
        {axis === "asset_group" || axis === "date" ? `${pct.toFixed(0)}%` : fmtNumber(item.count || 0)}
      </span>
      <span className="cols-row-chev">
        {isActive ? <Icons.X size={11}/> : <Icons.ChevronRight size={12}/>}
      </span>
      <div className="cols-row-bar">
        <div className="cols-row-bar-fill" style={{ width: `${pct}%`, background: toneColor }}/>
      </div>
    </div>
  );
}

/* ────── detail pane ────── */

function PivotDetail({ ds, ag, selections, cols, filters, onCellClick }) {
  const a = ds.agData[ag];
  // List of axes still unpinned (excluding asset_group which is always set)
  const allAxes = cols.map(c => c.axis);
  const unpinned = allAxes.filter(x => !selections[x]);

  // Aggregate coverage given current selections (across unpinned axes).
  // For unpinned date: aggregate over the filter window.
  const summary = useMemo(() => {
    // Use pivot-coverage averaged over unpinned-axis cardinality? simpler:
    // if (ag, primary, date) all known → exact cell.
    // else use synthesized coverage for the deepest pinned axis as proxy.
    if (selections[a.primary] && selections.date) {
      const c = a.grid[selections[a.primary]]?.[selections.date];
      if (c) return { coverage: c.coverage, total: c.total, captured: c.captured + c.empty + c["known-empty"], failed: c.failed, unattempted: c.unattempted, status: c.status };
    }
    // Aggregate from rows of the latest-pinned column.
    let coverage = a.total.coverage;
    if (selections[a.primary]) {
      coverage = a.byPrimary[selections[a.primary]]?.coverage ?? coverage;
    }
    return { coverage, total: a.byPrimary[selections[a.primary]]?.total || a.total.total };
  }, [a, selections]);

  const pct = (summary.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const toneColor = tone === "good" ? "var(--color-accent-green)" : tone === "warn" ? "var(--color-accent-amber)" : "var(--color-accent-red)";

  // Visible-selection chain string for the title
  const pinnedSegments = cols.filter(c => selections[c.axis]).map(c => selections[c.axis]);

  return (
    <div className="cols-col cols-col-detail">
      <div className="cols-col-header">
        <span>Detail</span>
        <span style={{ flex: 1 }}/>
        <span className="text-xs muted font-mono">{pinnedSegments.length}/{allAxes.length} pinned</span>
      </div>

      <div className="cols-col-body" style={{ padding: 0 }}>

        {/* Selection summary */}
        <div className="cols-detail-section">
          <div className="cols-detail-label">Current query</div>
          <div className="font-mono text-sm" style={{ color: "var(--color-text-primary)", lineHeight: 1.55, wordBreak: "break-word" }}>
            {pinnedSegments.join(" · ")}
          </div>
          {unpinned.length > 0 && (
            <div className="text-xs muted" style={{ marginTop: 6 }}>
              <span className="font-mono">{unpinned.join(", ")}</span>: all
            </div>
          )}
        </div>

        {/* Coverage */}
        <div className="cols-detail-section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
            <span className="cols-detail-label">Coverage</span>
            <span className="font-mono" style={{ fontSize: 14, color: toneColor, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
          </div>
          <div className="stack stack-thick">
            <div className="stack-seg stack-seg-captured" style={{ width: `${pct}%` }}/>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 5, fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
            <span>{fmtNumber(summary.total || 0)} shards</span>
            {summary.failed > 0 && <span style={{ color: "var(--color-accent-red)" }}>{summary.failed} failed</span>}
          </div>
        </div>

        {/* Hint */}
        {unpinned.length > 1 && (
          <div className="cols-detail-section">
            <div className="text-xs muted">
              Pin {unpinned.filter(x => x !== "asset_group").slice(0, 2).join(" and ")} to see leaf-shard detail.
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="cols-detail-section">
          <div className="col" style={{ gap: 6 }}>
            <button className="btn btn-primary" style={{ width: "100%" }}
              onClick={() => selections[a.primary] && selections.date && onCellClick?.({ ag, primaryValue: selections[a.primary], date: selections.date })}>
              <Icons.Eye size={12}/> Inspect leaf shard
            </button>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-outline" style={{ flex: 1 }}>
                <Icons.Download size={12}/> Download
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }}>
                <Icons.Rocket size={12}/> Backfill
              </button>
            </div>
          </div>
        </div>

        {/* GCS path — only show keys that are pinned */}
        <div className="cols-detail-section">
          <div className="cols-detail-label">GCS path</div>
          <div className="font-mono text-xs" style={{ color: "var(--color-text-tertiary)", wordBreak: "break-all", lineHeight: 1.55 }}>
            gs://utd-{ag}/{ds.service}/v=2/<br/>
            {cols.filter(c => c.axis !== "asset_group").map(c => (
              <React.Fragment key={c.axis}>
                {c.axis}=
                <span style={{ color: selections[c.axis] ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
                  {selections[c.axis] || "*"}
                </span>
                /<br/>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VisualColumns });
