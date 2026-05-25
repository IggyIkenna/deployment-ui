// Side drawer drill-down with breadcrumbs — axis-aware.
// Stack entries:
//   { kind: "ag", ag }
//   { kind: "primary", ag, primaryValue }
//   { kind: "date", ag, date }
//   { kind: "cell", ag, primaryValue, date }
//   { kind: "shard", ag, primaryValue, date, subAxisValues }

function useDrillStack() {
  const [stack, setStack] = useState([]);
  const open = (entry) => setStack([entry]);
  const push = (entry) => setStack((s) => [...s, entry]);
  const pop  = () => setStack((s) => s.slice(0, -1));
  const popTo = (i) => setStack((s) => s.slice(0, i + 1));
  const close = () => setStack([]);
  return { stack, open, push, pop, popTo, close, isOpen: stack.length > 0 };
}

function Crumbs({ stack, onClick, onClose }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <div className="crumbs">
        {stack.map((entry, i) => {
          const isLast = i === stack.length - 1;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span className="crumb-sep">/</span>}
              <span
                className={cls("crumb", isLast && "crumb-active")}
                onClick={() => !isLast && onClick?.(i)}
              >
                {crumbLabel(entry)}
              </span>
            </React.Fragment>
          );
        })}
      </div>
      <button className="btn btn-icon btn-ghost" onClick={onClose} title="Close (Esc)">
        <Icons.X size={14}/>
      </button>
    </div>
  );
}

function crumbLabel(e) {
  if (e.kind === "ag")      return e.ag.toUpperCase();
  if (e.kind === "primary") return `${e.ag.toUpperCase()}/${e.primaryValue}`;
  if (e.kind === "date")    return e.date;
  if (e.kind === "cell")    return `${e.primaryValue} · ${e.date}`;
  if (e.kind === "shard")   return (e.subAxisValues || []).join(" · ");
  return "?";
}

function Drawer({ drill, ds }) {
  const { stack, isOpen, popTo, close, push } = drill;
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const top = stack[stack.length - 1];
  return (
    <>
      <div className={cls("drawer-scrim", isOpen && "open")} onClick={close}/>
      <aside className={cls("drawer", isOpen && "open")} role="dialog" aria-label="Shard drilldown">
        {top && (
          <>
            <div className="drawer-head">
              <Crumbs stack={stack} onClick={popTo} onClose={close}/>
              <DrawerTitle entry={top} ds={ds}/>
            </div>
            <div className="drawer-body">
              <DrawerContent entry={top} ds={ds} onPush={push}/>
            </div>
            <DrawerFooter entry={top}/>
          </>
        )}
      </aside>
    </>
  );
}

function DrawerTitle({ entry, ds }) {
  const a = ds.agData[entry.ag];
  if (entry.kind === "ag") {
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-info badge-mono">ASSET GROUP</span>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>{entry.ag.toUpperCase()}</h2>
        </div>
        <AxisChainLabel a={a}/>
      </div>
    );
  }
  if (entry.kind === "primary") {
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-info badge-mono">{entry.ag.toUpperCase()}</span>
          <span className="text-xs muted font-mono">{axisLabel(a.primary)}</span>
          <h2 className="font-mono" style={{ fontSize: 16, fontWeight: 600 }}>{entry.primaryValue}</h2>
        </div>
        <AxisChainLabel a={a} value={entry.primaryValue}/>
      </div>
    );
  }
  if (entry.kind === "date") {
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-info badge-mono">{entry.ag.toUpperCase()}</span>
          <h2 className="font-mono" style={{ fontSize: 16, fontWeight: 600 }}>{entry.date}</h2>
        </div>
        <span className="text-xs muted">Per-{axisLabel(a.primary).toLowerCase()} status</span>
      </div>
    );
  }
  if (entry.kind === "cell") {
    const cell = a.grid[entry.primaryValue]?.[entry.date];
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-info badge-mono">{entry.ag.toUpperCase()}</span>
          <span className="text-xs muted font-mono">{entry.primaryValue} · {entry.date}</span>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>
            {cell ? `${cell.captured}/${cell.total} captured` : "no shards"}
          </h2>
          {cell?.failed > 0 && <span className="badge badge-error badge-mono">{cell.failed} failed</span>}
          {cell?.unattempted > 0 && <span className="badge badge-warning badge-mono">{cell.unattempted} pending</span>}
        </div>
      </div>
    );
  }
  if (entry.kind === "shard") {
    return (
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="badge badge-info badge-mono">{entry.ag.toUpperCase()}</span>
          <h2 className="font-mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {entry.primaryValue} · {entry.date}
          </h2>
        </div>
        <span className="text-xs muted font-mono">{(entry.subAxisValues || []).join(" · ")}</span>
      </div>
    );
  }
  return null;
}

function AxisChainLabel({ a, value }) {
  const axes = [a.primary, ...a.subAxes];
  return (
    <div className="row" style={{ gap: 4, fontSize: 11 }}>
      {axes.map((ax, i) => (
        <React.Fragment key={ax}>
          {i > 0 && <span className="muted font-mono">×</span>}
          <span className="font-mono" style={{ color: i === 0 ? "var(--color-accent-cyan)" : "var(--color-text-tertiary)" }}>
            {ax}
          </span>
        </React.Fragment>
      ))}
      <span className="muted font-mono">× day</span>
    </div>
  );
}

/* ─────────────── content per view ─────────────── */

function DrawerContent({ entry, ds, onPush }) {
  if (entry.kind === "ag")      return <AgDetail entry={entry} ds={ds} onPush={onPush}/>;
  if (entry.kind === "primary") return <PrimaryDetail entry={entry} ds={ds} onPush={onPush}/>;
  if (entry.kind === "date")    return <DateDetail entry={entry} ds={ds} onPush={onPush}/>;
  if (entry.kind === "cell")    return <CellDetail entry={entry} ds={ds} onPush={onPush}/>;
  if (entry.kind === "shard")   return <ShardDetail entry={entry}/>;
  return null;
}

function StatRow({ label, value, color }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <span className="text-xs muted">{label}</span>
      <span className="font-mono text-sm" style={{ color: color || "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}
function StatGroup({ label, value, tone }) {
  const color = tone === "good" ? "var(--color-accent-green)" :
                tone === "warn" ? "var(--color-accent-amber)" :
                tone === "bad" ? "var(--color-accent-red)" : "var(--color-text-primary)";
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="text-xs muted">{label}</span>
      <span className="font-mono" style={{ fontSize: 16, fontWeight: 500, color }}>{value}</span>
    </div>
  );
}

function AgDetail({ entry, ds, onPush }) {
  const a = ds.agData[entry.ag];
  const rows = a.primaryValues
    .map(pv => ({ pv, stats: a.byPrimary[pv] || { total: 0 } }))
    .sort((x, y) => (x.stats.coverage || 0) - (y.stats.coverage || 0));
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card">
        <div className="card-body" style={{ padding: 14 }}>
          <div className="text-xs muted" style={{ marginBottom: 6 }}>By {axisLabel(a.primary).toLowerCase()} (sorted worst first)</div>
          {rows.map(({ pv, stats }) => (
            <div
              key={pv}
              onClick={() => onPush({ kind: "primary", ag: entry.ag, primaryValue: pv })}
              style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px", gap: 10, padding: "7px 0", alignItems: "center", cursor: "pointer" }}
            >
              <span className="font-mono text-xs truncate">{pv}</span>
              <CoverageStack counts={stats} total={stats.total} simplified={true}/>
              <span className="font-mono text-xs" style={{ textAlign: "right", color: (stats.coverage || 0) >= .95 ? "var(--color-accent-green)" : (stats.coverage || 0) >= .85 ? "var(--color-accent-amber)" : "var(--color-accent-red)" }}>
                {((stats.coverage || 0) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrimaryDetail({ entry, ds, onPush }) {
  const a = ds.agData[entry.ag];
  const stats = a.byPrimary[entry.primaryValue] || { total: 0 };
  const days = a.grid[entry.primaryValue] || {};
  const recent14 = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = ymd(addDays(TODAY, -i));
      out.push({ date: d, cell: days[d] });
    }
    return out;
  }, [days]);

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-body">
          <CoverageStack counts={stats} total={stats.total} simplified={false}/>
          <div className="row" style={{ marginTop: 10, gap: 18, flexWrap: "wrap" }}>
            <StatGroup label="Coverage" value={`${((stats.coverage || 0) * 100).toFixed(1)}%`} tone={(stats.coverage || 0) >= .95 ? "good" : (stats.coverage || 0) >= .85 ? "warn" : "bad"}/>
            <StatGroup label="Captured" value={fmtNumber(stats.captured)}/>
            <StatGroup label="Failed" value={fmtNumber(stats.failed)} tone={stats.failed > 0 ? "bad" : null}/>
            <StatGroup label="Pending" value={fmtNumber(stats.unattempted)}/>
            <StatGroup label="Total" value={fmtNumber(stats.total)}/>
            <StatGroup label="Rows" value={fmtNumber(stats.rows)}/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Last 14 days</h3><span className="text-xs muted" style={{ marginLeft: "auto" }}>click a day to drill into sub-shards</span></div>
        <div className="card-body" style={{ padding: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {recent14.map(({ date, cell }) => {
              const status = cell ? mapStatusToCell(cell.status) : "missing";
              return (
                <button
                  key={date}
                  onClick={() => onPush({ kind: "cell", ag: entry.ag, primaryValue: entry.primaryValue, date })}
                  style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
                  title={`${date}: ${cell ? `${cell.captured}/${cell.total}` : "missing"}`}
                >
                  <span className="cell cell-lg" data-status={status}/>
                  <div className="font-mono" style={{ fontSize: 9.5, color: "var(--color-text-muted)", textAlign: "center", marginTop: 4 }}>
                    {fmtDateShort(date)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Breakdown by next sub-axis */}
      {a.subAxes.length > 0 && (
        <SubAxisBreakdown
          ds={ds}
          ag={entry.ag}
          primaryValue={entry.primaryValue}
          subAxis={a.subAxes[0]}
          onPush={(child) => onPush({ kind: "shard", ag: entry.ag, primaryValue: entry.primaryValue, date: ymd(addDays(TODAY, -1)), subAxisValues: [child] })}
        />
      )}
    </div>
  );
}

function SubAxisBreakdown({ ds, ag, primaryValue, subAxis, onPush }) {
  // Show distribution across the next sub-axis. Use illustrative values.
  const values = axisValues(subAxis, ag, { venue: primaryValue });
  const rng = mulberry32(hashStr(`${ds.service}|${ag}|${primaryValue}|${subAxis}`));
  const items = values.slice(0, 12).map(v => {
    const captured = Math.floor(80 + rng() * 200);
    const failed = Math.floor(rng() * 4);
    const pending = Math.floor(rng() * 6);
    const total = captured + failed + pending;
    return { value: v, captured, failed, pending, total };
  });
  return (
    <div className="card">
      <div className="card-head"><h3>By {axisLabel(subAxis).toLowerCase()}</h3><span className="text-xs muted" style={{ marginLeft: "auto" }}>{values.length} total</span></div>
      <div>
        {items.map(it => (
          <div
            key={it.value}
            onClick={() => onPush?.(it.value)}
            style={{
              display: "grid", gridTemplateColumns: "1fr 70px 70px 14px",
              gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--color-border-subtle)",
              alignItems: "center", cursor: "pointer", fontSize: 12.5,
            }}
          >
            <span className="font-mono">{it.value}</span>
            <span className="text-xs muted font-mono" style={{ textAlign: "right" }}>{fmtNumber(it.captured)}</span>
            {it.failed > 0 ? (
              <span className="badge badge-error badge-mono" style={{ justifySelf: "end" }}>{it.failed} fail</span>
            ) : it.pending > 0 ? (
              <span className="badge badge-warning badge-mono" style={{ justifySelf: "end" }}>{it.pending} pend</span>
            ) : (
              <span className="badge badge-success badge-mono" style={{ justifySelf: "end" }}>OK</span>
            )}
            <Icons.ChevronRight size={13} className="muted"/>
          </div>
        ))}
      </div>
    </div>
  );
}

function DateDetail({ entry, ds, onPush }) {
  const a = ds.agData[entry.ag];
  const rows = a.primaryValues.map(pv => ({ pv, cell: a.grid[pv]?.[entry.date] }));
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="text-xs muted">Per-{axisLabel(a.primary).toLowerCase()} status on {entry.date}</div>
      <div className="card">
        {rows.map(({ pv, cell }) => {
          const status = cell ? mapStatusToCell(cell.status) : "missing";
          return (
            <div
              key={pv}
              onClick={() => onPush({ kind: "cell", ag: entry.ag, primaryValue: pv, date: entry.date })}
              style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto 14px",
                gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--color-border-subtle)",
                alignItems: "center", cursor: "pointer", fontSize: 12.5,
              }}
            >
              <span className="cell" data-status={status}/>
              <span className="font-mono text-sm">{pv}</span>
              <span className="text-xs muted font-mono">
                {cell ? `${cell.captured}/${cell.total}` : "—"}
              </span>
              <span className="text-xs muted font-mono">
                {cell?.failed > 0 ? `${cell.failed} fail` : cell?.unattempted > 0 ? `${cell.unattempted} pend` : ""}
              </span>
              <Icons.ChevronRight size={13} className="muted"/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CellDetail({ entry, ds, onPush }) {
  const a = ds.agData[entry.ag];
  const cell = a.grid[entry.primaryValue]?.[entry.date];
  if (!cell) return <div className="muted">No data for this cell.</div>;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-body">
          <CoverageStack counts={cell} total={cell.total} simplified={false}/>
          <div className="row" style={{ marginTop: 10, gap: 18, flexWrap: "wrap" }}>
            <StatGroup label="Captured" value={fmtNumber(cell.captured)} tone="good"/>
            <StatGroup label="Failed"   value={fmtNumber(cell.failed)}   tone={cell.failed > 0 ? "bad" : null}/>
            <StatGroup label="Pending"  value={fmtNumber(cell.unattempted)}/>
            <StatGroup label="Empty"    value={fmtNumber(cell.empty + cell["known-empty"])}/>
            <StatGroup label="Total"    value={fmtNumber(cell.total)}/>
            <StatGroup label="Rows"     value={fmtNumber(cell.rows)}/>
          </div>
        </div>
      </div>

      {/* Drill down through the sub-axes */}
      {a.subAxes.length > 0 && (
        <SubAxisBreakdown
          ds={ds}
          ag={entry.ag}
          primaryValue={entry.primaryValue}
          subAxis={a.subAxes[0]}
          onPush={(child) => onPush({ kind: "shard", ag: entry.ag, primaryValue: entry.primaryValue, date: entry.date, subAxisValues: [child] })}
        />
      )}
    </div>
  );
}

function ShardDetail({ entry }) {
  const schema = [
    { name: "ts_ns",          dtype: "int64",   nullable: false, desc: "Event timestamp (ns)" },
    { name: "instrument_id",  dtype: "string",  nullable: false, desc: "Canonical instrument ID" },
    { name: "price",          dtype: "float64", nullable: false, desc: "Trade price" },
    { name: "size",           dtype: "float64", nullable: false, desc: "Trade size (base ccy)" },
    { name: "side",           dtype: "string",  nullable: true,  desc: "buy|sell" },
    { name: "trade_id",       dtype: "string",  nullable: true,  desc: "Venue trade id" },
  ];
  const subVals = (entry.subAxisValues || []).join("/");
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-body">
          <div className="row" style={{ gap: 10, marginBottom: 12 }}>
            <span className="badge badge-success">captured</span>
            <span className="text-xs muted font-mono">attempted_at: {entry.date}T08:14:22Z</span>
          </div>
          <div className="col">
            <StatRow label="rows"             value="1.24M"/>
            <StatRow label="bytes"            value="486 MiB"/>
            <StatRow label="symbol_column"    value="instrument_id"/>
            <StatRow label="capture_status"   value="captured" color="var(--color-accent-green)"/>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Schema</h3><span className="text-xs muted">UAC contract · projected</span></div>
        <table className="tbl">
          <thead>
            <tr><th>name</th><th>dtype</th><th>nullable</th><th>description</th></tr>
          </thead>
          <tbody>
            {schema.map(c => (
              <tr key={c.name}>
                <td className="mono-id">{c.name}</td>
                <td className="font-mono text-xs">{c.dtype}</td>
                <td className="font-mono text-xs">{c.nullable ? "yes" : "no"}</td>
                <td className="text-xs muted">{c.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="card-head"><h3>Sample (head 5)</h3></div>
        <div className="card-body">
          <pre style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.55, color: "var(--color-text-secondary)", whiteSpace: "pre", overflowX: "auto" }}>
{`ts_ns                instrument_id    price       size       side
1747000000123456789  BTC-USDT         110421.50   0.0034     buy
1747000000124003122  BTC-USDT         110421.40   0.0117     sell
1747000000124559811  ETH-USDT          3621.84    0.4128     buy
1747000000125028110  BTC-USDT         110421.30   0.0061     sell
1747000000125512904  SOL-USDT           174.92    1.0500     buy`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DrawerFooter({ entry }) {
  if (entry.kind === "shard") {
    return (
      <div className="drawer-foot">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-outline btn-sm"><Icons.Download size={12}/> CSV</button>
          <button className="btn btn-ghost btn-sm"><Icons.Hash size={12}/> Schema</button>
          <button className="btn btn-ghost btn-sm"><Icons.Layers size={12}/> Instruments</button>
        </div>
        <button className="btn btn-primary btn-sm"><Icons.Rocket size={12}/> Backfill</button>
      </div>
    );
  }
  return (
    <div className="drawer-foot">
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm"><Icons.Eye size={12}/> Open in matrix</button>
      </div>
      <button className="btn btn-primary btn-sm"><Icons.Rocket size={12}/> Deploy missing</button>
    </div>
  );
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

Object.assign(window, { Drawer, useDrillStack });
