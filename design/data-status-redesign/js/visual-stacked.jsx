// Visual #2 — Stacked coverage bars per primary axis value.
// For each (asset_group), each row is one primary-axis value
// (venue / data_type / feature_group / strategy_id depending on service+ag).
// The bar shows the proportion of captured / empty / failed / unattempted
// across the date range, aggregated over ALL sub-shards.

function VenueBarRow({ ag, primary, primaryValue, stats, simplified, onClick }) {
  const pct = (stats.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  const toneColor =
    tone === "good" ? "var(--color-accent-green)" :
    tone === "warn" ? "var(--color-accent-amber)" :
                      "var(--color-accent-red)";
  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr 70px 90px 36px",
        gap: 14, alignItems: "center",
        padding: "9px 14px",
        borderBottom: "1px solid var(--color-border-subtle)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-bg-tertiary)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div className="row" style={{ gap: 8, minWidth: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: toneColor, flexShrink: 0 }}/>
        <span className="mono-id text-sm truncate" title={primaryValue}>{primaryValue}</span>
      </div>
      <CoverageStack counts={stats} total={stats.total} simplified={simplified} height="thick"/>
      <span className="font-mono text-xs" style={{ color: toneColor, fontWeight: 600, textAlign: "right" }}>{pct.toFixed(1)}%</span>
      <div className="text-xs muted font-mono" style={{ textAlign: "right" }}>
        {fmtNumber(stats.total)} shards
      </div>
      <Icons.ChevronRight size={14} className="muted"/>
    </div>
  );
}

function VisualStacked({ ds, filters, simplified, onVenueClick }) {
  const ags = filters.assetGroups.length ? filters.assetGroups.map(a => a.toLowerCase()) : ds.ags;
  return (
    <div className="col" style={{ gap: 12 }}>
      {ags.map(ag => {
        const a = ds.agData[ag];
        if (!a || !a.primaryValues.length) return null;
        const rows = a.primaryValues.map(pv => ({ primaryValue: pv, stats: a.byPrimary[pv] || { total: 0 } }));
        rows.sort((x, y) => (x.stats.coverage || 0) - (y.stats.coverage || 0));
        const agStats = a.total || { total: 0 };
        const agPct = (agStats.honestCoverage || agStats.coverage || 0) * 100;

        return (
          <div key={ag} className="card">
            <div className="card-head" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <span className="font-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}>{ag.toUpperCase()}</span>
              <div style={{ flex: 1 }}/>
              <span className="text-xs muted">{rows.length} {axisLabel(a.primary).toLowerCase()}s</span>
              <span className="font-mono text-xs" style={{ color: agPct >= 95 ? "var(--color-accent-green)" : agPct >= 85 ? "var(--color-accent-amber)" : "var(--color-accent-red)", fontWeight: 600 }}>
                {agPct.toFixed(1)}%
              </span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr 70px 90px 36px",
              gap: 14, padding: "6px 14px",
              borderBottom: "1px solid var(--color-border-subtle)",
              background: "var(--color-bg-tertiary)",
              fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--color-text-muted)",
            }}>
              <span>{axisLabel(a.primary)}</span>
              <span>Coverage</span>
              <span style={{ textAlign: "right" }}>%</span>
              <span style={{ textAlign: "right" }}>Shards</span>
              <span/>
            </div>
            <div>
              {rows.map(({ primaryValue, stats }) => (
                <VenueBarRow
                  key={primaryValue}
                  ag={ag}
                  primary={a.primary}
                  primaryValue={primaryValue}
                  stats={stats}
                  simplified={simplified}
                  onClick={() => onVenueClick?.({ ag, primaryValue, stats })}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { VisualStacked });
