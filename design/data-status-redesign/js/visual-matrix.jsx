// Visual #3 — Primary-axis × date matrix.
// Rows are primary-axis values (venue / data_type / feature_group / strategy_id …).
// Columns are dates. Each cell color reflects worst-of across all sub-shards
// for that (primary, date). For deep services (MTDS, MDPS, features-*) the
// cell represents the rollup of N sub-shards — N shown as a header chip.

function VisualMatrix({ ds, filters, onCellClick }) {
  const ags = filters.assetGroups.length ? filters.assetGroups.map(a => a.toLowerCase()) : ds.ags;

  const dates = useMemo(() => {
    const out = []; let d = parseYmd(filters.start); const end = parseYmd(filters.end);
    while (d <= end) { out.push(ymd(d)); d = addDays(d, 1); }
    return out;
  }, [filters.start, filters.end]);

  const monthTicks = useMemo(() => {
    const ticks = []; let lastMonth = -1;
    for (let i = 0; i < dates.length; i++) {
      const d = parseYmd(dates[i]);
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        ticks.push({ idx: i, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
      }
    }
    return ticks;
  }, [dates]);

  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map(ag => {
        const a = ds.agData[ag];
        if (!a || !a.primaryValues.length) return null;
        return (
          <div key={ag} className="card">
            <div className="card-head" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}>{ag.toUpperCase()}</span>
              <span className="text-xs muted" style={{ marginLeft: 8 }}>
                {a.primaryValues.length} {axisLabel(a.primary).toLowerCase()}s · {dates.length} days
              </span>
              <div style={{ flex: 1 }}/>
              {a.subAxes.length > 0 && (
                <span className="badge badge-outline badge-mono" title={`Each cell aggregates ~${a.shardsPerCell} sub-shards: ${a.subAxes.join(' × ')}`}>
                  ~{a.shardsPerCell}/cell · {a.subAxes.join(' × ')}
                </span>
              )}
            </div>
            <div className="card-body" style={{ overflowX: "auto", padding: 16 }}>
              <MatrixBody ag={ag} agData={a} dates={dates} monthTicks={monthTicks} onCellClick={onCellClick}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatrixBody({ ag, agData, dates, monthTicks, onCellClick }) {
  return (
    <div className="col" style={{ gap: 6, minWidth: 0 }}>
      {/* Month axis */}
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14 }}>
        <div/>
        <div style={{ position: "relative", height: 16 }}>
          {monthTicks.map(t => (
            <span
              key={t.idx}
              className="text-xs muted font-mono"
              style={{
                position: "absolute",
                left: `calc(${(t.idx / dates.length) * 100}% )`,
                whiteSpace: "nowrap", fontSize: 10.5,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      {agData.primaryValues.map(pv => {
        const days = agData.grid[pv] || {};
        return (
          <div key={pv} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 14, alignItems: "center" }}>
            <div className="font-mono text-xs truncate" style={{ color: "var(--color-text-secondary)", textAlign: "right" }} title={pv}>
              {pv}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))`, gap: 1, minWidth: 0 }}>
              {dates.map(date => {
                const cell = days[date];
                const status = cell ? mapStatusToCell(cell.status) : "missing";
                const title = cell
                  ? `${pv} · ${date}: ${cell.status} · ${cell.captured}/${cell.total} captured` +
                    (cell.failed > 0 ? ` · ${cell.failed} failed` : "") +
                    (cell.unattempted > 0 ? ` · ${cell.unattempted} pending` : "")
                  : `${pv} · ${date}: missing`;
                return (
                  <button
                    key={date}
                    className="cell cell-clickable"
                    data-status={status}
                    title={title}
                    onClick={() => onCellClick?.({ ag, primaryValue: pv, date, cell })}
                    style={{ width: "100%", height: "calc(var(--cell, 14px) * 0.95)", border: 0, padding: 0, borderRadius: 1.5, cursor: "pointer" }}
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

Object.assign(window, { VisualMatrix });
