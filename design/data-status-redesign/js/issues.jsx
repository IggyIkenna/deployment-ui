// Needs-attention panel — failures / missing date ranges / stale capture.

function NeedsAttention({ ds, onOpenFailure, onOpenMissing }) {
  const failures = useMemo(() => recentFailures(ds, { limit: 5 }), [ds]);
  const missing = useMemo(() => recentMissing(ds, { limit: 4 }), [ds]);
  const stale = useMemo(() => staleCapture(ds, { limit: 3 }), [ds]);
  const total = failures.length + missing.length + stale.length;

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <Icons.AlertTri size={14} style={{ color: "var(--color-accent-amber)" }}/>
        <h3>Needs attention</h3>
        <span className="text-xs muted">last 14 days</span>
        <div style={{ flex: 1 }}/>
        <span className="badge badge-outline badge-mono">{total} items</span>
        <button className="btn btn-ghost btn-xs"><Icons.Refresh size={11}/>Recheck</button>
      </div>

      <div className="card-body" style={{ padding: 0, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: 0 }}>
        {/* Failures */}
        <Column color="var(--color-accent-red)" label="Failures" count={failures.length}>
          {failures.length === 0 && <Empty label="No failures"/>}
          {failures.map((f, i) => (
            <div key={i} className="attn-row" onClick={() => onOpenFailure?.(f)}>
              <span className="attn-dot attn-dot-error"/>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="font-mono text-xs truncate" style={{ color: "var(--color-text-primary)" }}>{f.ag.toUpperCase()}/{f.primaryValue}</span>
                  <span className="text-xs muted font-mono">· {f.date}</span>
                </div>
                <span className="text-xs muted truncate">
                  {f.failed}/{f.total} shards · {f.reason?.label || "—"}
                </span>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={(e) => e.stopPropagation()}>
                <Icons.Refresh size={11}/>Retry
              </button>
            </div>
          ))}
        </Column>

        {/* Missing */}
        <Column color="var(--color-accent-amber)" label="Missing dates" count={missing.length}>
          {missing.length === 0 && <Empty label="No gaps detected"/>}
          {missing.map((m, i) => (
            <div key={i} className="attn-row" onClick={() => onOpenMissing?.(m)}>
              <span className="attn-dot attn-dot-warn"/>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="font-mono text-xs truncate" style={{ color: "var(--color-text-primary)" }}>{m.ag.toUpperCase()}/{m.primaryValue}</span>
                  <span className="text-xs muted font-mono">· {m.count}d gap</span>
                </div>
                <span className="text-xs muted font-mono">{m.start === m.end ? m.start : `${m.start} → ${m.end}`}</span>
              </div>
              <button className="btn btn-primary btn-xs" onClick={(e) => e.stopPropagation()}>
                <Icons.Rocket size={11}/>Deploy
              </button>
            </div>
          ))}
        </Column>

        {/* Stale */}
        <Column color="var(--color-accent-blue)" label="Stale capture" count={stale.length} last>
          {stale.length === 0 && <Empty label="All current"/>}
          {stale.map((s, i) => (
            <div key={i} className="attn-row" onClick={() => onOpenMissing?.({ ag: s.ag, primaryValue: s.primaryValue, start: s.lastCaptured, end: s.lastCaptured, count: s.gap })}>
              <span className="attn-dot attn-dot-info"/>
              <div className="col" style={{ gap: 2, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="font-mono text-xs truncate" style={{ color: "var(--color-text-primary)" }}>{s.ag.toUpperCase()}/{s.primaryValue}</span>
                  <span className="text-xs muted font-mono">· {s.gap}d behind</span>
                </div>
                <span className="text-xs muted">Last captured {s.lastCaptured}</span>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={(e) => e.stopPropagation()}>
                <Icons.Eye size={11}/>Inspect
              </button>
            </div>
          ))}
        </Column>
      </div>
    </section>
  );
}

function Column({ color, label, count, last, children }) {
  return (
    <div style={{ borderRight: last ? 0 : "1px solid var(--color-border-subtle)" }}>
      <div style={{
        padding: "10px 14px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }}/>
        {label}
        <span className="text-xs muted" style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ label }) {
  return (
    <div className="row" style={{ justifyContent: "center", padding: "20px 14px", color: "var(--color-text-muted)", fontSize: 12, gap: 6 }}>
      <Icons.Check size={12}/>{label}
    </div>
  );
}

Object.assign(window, { NeedsAttention });
