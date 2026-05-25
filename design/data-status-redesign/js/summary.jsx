// Summary hero — calm overview that auto-loads on tab open.

function CoverageStack({ counts, total, simplified, height = "thick" }) {
  const seg = (key) => total === 0 ? 0 : ((counts[key] || 0) / total) * 100;
  const segs = simplified
    ? [
        { key: "ok",      pct: seg("captured") + seg("empty") + seg("known-empty"), cls: "stack-seg-captured" },
        { key: "partial", pct: seg("partial"), cls: "stack-seg-partial" },
        { key: "failed",  pct: seg("failed"),  cls: "stack-seg-failed" },
        { key: "missing", pct: seg("unattempted"), cls: "stack-seg-missing" },
      ]
    : [
        { key: "captured",    pct: seg("captured"),    cls: "stack-seg-captured" },
        { key: "empty",       pct: seg("empty"),       cls: "stack-seg-empty" },
        { key: "known-empty", pct: seg("known-empty"), cls: "stack-seg-known-empty" },
        { key: "partial",     pct: seg("partial"),     cls: "stack-seg-partial" },
        { key: "failed",      pct: seg("failed"),      cls: "stack-seg-failed" },
        { key: "missing",     pct: seg("unattempted"), cls: "stack-seg-missing" },
      ];
  return (
    <div className={cls("stack", height === "thick" && "stack-thick")}>
      {segs.map(s => (
        <div key={s.key} className={cls("stack-seg", s.cls)} style={{ width: `${s.pct}%` }} title={`${s.key}: ${s.pct.toFixed(1)}%`}/>
      ))}
    </div>
  );
}

function AssetGroupTile({ ag, stats, simplified, onClick }) {
  const pct = (stats.honestCoverage || stats.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  return (
    <div className="ag-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="hd">
        <span className="ag-name">{ag.toUpperCase()}</span>
        <span className={cls("pct", tone)}>{pct.toFixed(1)}%</span>
      </div>
      <CoverageStack counts={stats} total={stats.total} simplified={simplified}/>
      <div className="ft">
        <span>{fmtNumber(stats.total)} shards</span>
        <span style={{ color: stats.failed > 0 ? "var(--color-accent-red)" : "var(--color-text-muted)" }}>
          {stats.failed > 0 ? `${fmtNumber(stats.failed)} failing` : "no failures"}
        </span>
      </div>
    </div>
  );
}

function KeyStats({ overall, lastRefreshed, mode }) {
  const captured = overall.captured + overall.empty + overall["known-empty"];
  const failing = overall.failed + overall.unattempted;
  const honestPct = (overall.honestCoverage * 100).toFixed(1);
  return (
    <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
      <div className="stat">
        <span className="stat-label">Honest coverage</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span className="stat-value" style={{ color: overall.honestCoverage >= 0.95 ? "var(--color-accent-green)"
            : overall.honestCoverage >= 0.85 ? "var(--color-accent-amber)" : "var(--color-accent-red)" }}>
            {honestPct}<span style={{ fontSize: 18, color: "var(--color-text-muted)" }}>%</span>
          </span>
          <span className="stat-delta stat-delta-good">+0.4% vs 7d</span>
        </div>
      </div>
      <div style={{ width: 1, alignSelf: "stretch", background: "var(--color-border-subtle)" }}/>
      <div className="stat">
        <span className="stat-label">Shards captured</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span className="stat-value">{fmtNumber(captured)}</span>
          <span className="stat-delta">of {fmtNumber(overall.total)}</span>
        </div>
      </div>
      <div style={{ width: 1, alignSelf: "stretch", background: "var(--color-border-subtle)" }}/>
      <div className="stat">
        <span className="stat-label">Needs attention</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span className="stat-value" style={{ color: failing > 0 ? "var(--color-accent-red)" : "var(--color-text-primary)" }}>
            {fmtNumber(failing)}
          </span>
          <span className="stat-delta">{fmtNumber(overall.failed)} failed · {fmtNumber(overall.unattempted)} missing</span>
        </div>
      </div>
      <div style={{ width: 1, alignSelf: "stretch", background: "var(--color-border-subtle)" }}/>
      <div className="stat">
        <span className="stat-label">As of</span>
        <span style={{ fontSize: 18, fontWeight: 500, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
          {lastRefreshed}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <Icons.Clock size={11} className="muted"/>
          <span className="text-xs muted">manifest · 4.2s scan · {mode}</span>
        </div>
      </div>
    </div>
  );
}

function ModeStrip({ value, onChange }) {
  const opts = [
    { id: "batch",     label: "Batch",         icon: Icons.Calendar, desc: "Historical backfills" },
    { id: "scheduled", label: "Scheduled",     icon: Icons.Clock,    desc: "Today's cron windows" },
    { id: "live",      label: "Live",          icon: Icons.Activity, desc: "Websocket pipelines" },
  ];
  return (
    <div className="row" style={{ gap: 8 }}>
      {opts.map(o => {
        const I = o.icon;
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange?.(o.id)}
            className={cls("btn", active ? "btn-outline" : "btn-ghost")}
            style={{
              borderColor: active ? "var(--color-accent-cyan)" : "var(--color-border-default)",
              color: active ? "var(--color-accent-cyan)" : "var(--color-text-secondary)",
              background: active ? "var(--color-accent-dim)" : "transparent",
              padding: "5px 12px",
            }}
            title={o.desc}
          >
            <I size={12}/>
            {o.label}
            {o.id === "live" && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--color-accent-green)",
                boxShadow: active ? "0 0 0 3px color-mix(in srgb, var(--color-accent-green) 30%, transparent)" : "none",
                marginLeft: 2,
              }}/>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SummaryHero({ ds, rollup, simplified, mode, setMode, onOpenAg }) {
  const ags = ds.ags;
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-body" style={{ paddingBottom: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <KeyStats overall={rollup.overall} lastRefreshed="13:42:18" mode={mode}/>
          <ModeStrip value={mode} onChange={setMode}/>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, ags.length)}, minmax(0, 1fr))`,
          gap: 10,
        }}>
          {ags.map(ag => (
            <AssetGroupTile
              key={ag}
              ag={ag}
              stats={rollup.byAg[ag] || { total: 0 }}
              simplified={simplified}
              onClick={() => onOpenAg?.(ag)}
            />
          ))}
        </div>

        <div className="row" style={{ gap: 14, marginTop: 14, fontSize: 11, color: "var(--color-text-muted)", flexWrap: "wrap" }}>
          {simplified ? (
            <>
              <LegendChip color="var(--color-accent-green)" label="OK (captured · honest empty)"/>
              <LegendChip color="var(--color-accent-amber)" label="Partial"/>
              <LegendChip color="var(--color-accent-red)" label="Failed"/>
              <LegendChip color="color-mix(in srgb, var(--color-accent-red) 50%, var(--color-bg-tertiary))" label="Missing (not attempted)"/>
            </>
          ) : (
            <>
              <LegendChip color="var(--color-accent-green)" label="Captured"/>
              <LegendChip color="var(--color-accent-teal)" label="Empty confirmed"/>
              <LegendChip color="var(--color-accent-sky)" label="Known-empty (expected)"/>
              <LegendChip color="var(--color-accent-amber)" label="Partial"/>
              <LegendChip color="var(--color-accent-red)" label="Attempted, failed"/>
              <LegendChip color="color-mix(in srgb, var(--color-accent-red) 50%, var(--color-bg-tertiary))" label="Pending (not yet attempted)"/>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function LegendChip({ color, label }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }}/>
      <span>{label}</span>
    </span>
  );
}

Object.assign(window, { SummaryHero, AssetGroupTile, KeyStats, CoverageStack, ModeStrip, LegendChip });
