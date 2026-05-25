// Visual #1 — Heatmap calendar.
// Per asset-group, one mini-calendar with months across. Each cell's color
// aggregates ALL sub-shards on that date (worst-of). Click drills to a (date, ag) view.

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function MiniCalendar({ ag, byDate, startDate, endDate, onDayClick }) {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const months = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDow; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const key = ymd(dt);
      const meta = byDate[key];
      let status;
      if (dt > TODAY) status = "future";
      else if (dt < start || dt > end) status = "none";
      else if (!meta || meta.total === 0) status = "missing";
      else status = mapStatusToCell(meta.status);
      days.push({ date: key, status, coverage: meta?.coverage, dayNum: d, counts: meta });
    }
    while (days.length % 7 !== 0) days.push(null);
    months.push({ year: y, month: m, days });
    cursor = new Date(y, m + 1, 1);
  }

  return (
    <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
      {months.map(({ year, month, days }) => (
        <div key={`${year}-${month}`} style={{ flexShrink: 0 }}>
          <div className="cal-month-label">{MONTHS[month]} {year}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, var(--cell, 14px))", gap: "3px var(--gap-cell, 6px)", marginBottom: 4 }}>
            {DOW.map((d, i) => (
              <div key={i} className="cal-dow" style={{ width: "var(--cell, 14px)" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, var(--cell, 14px))", gap: "3px var(--gap-cell, 6px)" }}>
            {days.map((d, i) => {
              if (!d) return <span key={i} style={{ width: "var(--cell, 14px)", height: "var(--cell, 14px)" }}/>;
              const title = d.status === "future" ? `${d.date}: future`
                : d.status === "missing" ? `${d.date}: missing (not attempted)`
                : `${d.date}: ${d.status}${d.counts ? ` · ${d.counts.captured}/${d.counts.total} captured` : ""}`;
              return (
                <button
                  key={d.date}
                  className="cell cell-clickable"
                  data-status={d.status}
                  title={title}
                  onClick={() => onDayClick?.({ ag, date: d.date, status: d.status })}
                  style={{ border: 0, padding: 0, cursor: "pointer" }}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function mapStatusToCell(s) {
  if (s === "captured") return "captured";
  if (s === "empty" || s === "known-empty") return "empty";
  if (s === "partial") return "partial";
  if (s === "failed") return "failed";
  if (s === "missing" || s === "unattempted") return "missing";
  if (s === "future") return "future";
  return "none";
}

function VisualHeatmap({ ds, filters, onDayClick }) {
  const ags = filters.assetGroups.length ? filters.assetGroups.map(a => a.toLowerCase()) : ds.ags;
  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map(ag => ds.agData[ag] ? (
        <HeatmapAgCard key={ag} ds={ds} ag={ag} filters={filters} onDayClick={onDayClick}/>
      ) : null)}
    </div>
  );
}

function HeatmapAgCard({ ds, ag, filters, onDayClick }) {
  const byDate = useMemo(
    () => rollUpDates(ds, ag, filters.start, filters.end),
    [ds, ag, filters.start, filters.end]
  );
  const counts = useMemo(() => {
    const c = { captured: 0, partial: 0, failed: 0, missing: 0, empty: 0 };
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
        <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}>{ag.toUpperCase()}</span>
        <span className="text-xs muted" style={{ marginLeft: 8 }}>
          {a.primaryValues.length} {axisLabel(a.primary).toLowerCase()}s · {Object.keys(byDate).length} days · ~{fmtNumber(a.shardsPerCell)} shards/day
        </span>
        <div style={{ flex: 1 }}/>
        <span className="text-xs muted font-mono">
          {counts.captured} captured ·
          {counts.partial ? <> <span style={{ color: "var(--color-accent-amber)" }}>{counts.partial} partial</span> ·</> : null}
          {counts.failed ? <> <span style={{ color: "var(--color-accent-red)" }}>{counts.failed} failed</span> ·</> : null}
          {counts.missing ? <> <span className="muted">{counts.missing} missing</span></> : null}
        </span>
      </div>
      <div className="card-body" style={{ overflowX: "auto" }}>
        <MiniCalendar ag={ag} byDate={byDate} startDate={filters.start} endDate={filters.end} onDayClick={onDayClick}/>
      </div>
    </div>
  );
}

Object.assign(window, { VisualHeatmap, mapStatusToCell });
