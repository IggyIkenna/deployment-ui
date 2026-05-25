// Refined filter bar — date range + asset groups + venues, plus a popover for
// the advanced toggles (freshness gating, first-day-of-month, show-only-failures,
// region warning, etc.) that used to crowd the original page.

function PillToggleGroup({ options, value = [], onChange, allowAll = true, label }) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {label && <span className="text-xs muted" style={{ marginRight: 4 }}>{label}</span>}
      {allowAll && (
        <button
          onClick={() => onChange?.([])}
          className={cls("chip", value.length === 0 && "chip-active")}
          style={{ cursor: "pointer", border: "1px solid var(--color-border-default)" }}
        >
          All
        </button>
      )}
      {options.map(o => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            onClick={() => {
              if (active) onChange?.(value.filter(v => v !== o));
              else onChange?.([...value, o]);
            }}
            className={cls("chip", active && "chip-active")}
            style={{ cursor: "pointer", border: "1px solid var(--color-border-default)" }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function DateRangePicker({ start, end, onChange }) {
  // Quick presets — common operator queries.
  const presets = [
    { id: "7d",  label: "7d",     days: 7 },
    { id: "30d", label: "30d",    days: 30 },
    { id: "90d", label: "90d",    days: 90 },
    { id: "ytd", label: "YTD",    days: null },
    { id: "all", label: "All",    days: null },
  ];

  const apply = (days) => {
    const e = ymd(TODAY);
    const s = days ? ymd(addDays(TODAY, -days + 1)) : "2018-01-01";
    onChange?.({ start: s, end: e });
  };

  return (
    <div className="row" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 4, padding: "4px 6px 4px 10px", border: "1px solid var(--color-border-default)", borderRadius: 6, background: "var(--color-bg-tertiary)" }}>
        <Icons.Calendar size={12} className="muted"/>
        <input
          type="date"
          value={start}
          onChange={(e) => onChange?.({ start: e.target.value, end })}
          style={{ background: "transparent", border: 0, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", fontSize: 11.5, width: 110, outline: "none", padding: 0 }}
        />
        <span className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>→</span>
        <input
          type="date"
          value={end}
          onChange={(e) => onChange?.({ start, end: e.target.value })}
          style={{ background: "transparent", border: 0, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", fontSize: 11.5, width: 110, outline: "none", padding: 0 }}
        />
      </div>
      <div className="tabs" style={{ padding: 2 }}>
        {presets.map(p => (
          <button key={p.id} className="tab" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => p.days ? apply(p.days) : apply(p.id === "ytd" ? 150 : 9999)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdvancedPopover({ open, onClose, advanced, setAdvanced }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 40 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-in"
        style={{
          position: "absolute", top: 158, right: 32, width: 340,
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 10, padding: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,.5)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
            Advanced
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><Icons.X size={13}/></button>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <ToggleRow
            label="Show only failures"
            help="Scopes the breakdown to shards with failure_rate > 0."
            value={advanced.onlyFailures}
            onChange={(v) => setAdvanced({ ...advanced, onlyFailures: v })}
          />
          <ToggleRow
            label="First day of month only"
            help="TARDIS free-tier — sample first-of-month shards only."
            value={advanced.firstDayOnly}
            onChange={(v) => setAdvanced({ ...advanced, firstDayOnly: v })}
          />
          <ToggleRow
            label="Require freshness"
            help="Only count data as 'captured' if updated on/after the freshness date."
            value={advanced.requireFreshness}
            onChange={(v) => setAdvanced({ ...advanced, requireFreshness: v })}
          />
          {advanced.requireFreshness && (
            <div className="row" style={{ gap: 6, marginLeft: 22 }}>
              <span className="text-xs muted">on/after</span>
              <input type="date" className="field field-mono" defaultValue="2026-05-20"/>
            </div>
          )}
          <div className="divider"/>
          <div className="col" style={{ gap: 4 }}>
            <span className="text-xs muted">Region</span>
            <div className="row">
              <select className="field field-mono" defaultValue="asia-northeast1" style={{ flex: 1 }}>
                <option>asia-northeast1</option>
                <option>us-central1</option>
                <option>europe-west4</option>
              </select>
            </div>
          </div>
          <div className="divider"/>
          <button className="btn btn-ghost" style={{ justifyContent: "flex-start", padding: "6px 0" }}>
            <Icons.Refresh size={12}/> Clear data-status cache
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, help, value, onChange }) {
  return (
    <label className="row" style={{ cursor: "pointer", gap: 10, alignItems: "flex-start" }}>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange?.(!value)}
        style={{
          width: 30, height: 17, borderRadius: 999, padding: 0, marginTop: 2,
          background: value ? "var(--color-accent-cyan)" : "var(--color-bg-tertiary)",
          border: "1px solid " + (value ? "var(--color-accent-cyan)" : "var(--color-border-emphasis)"),
          position: "relative", cursor: "pointer", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 1, left: value ? 14 : 1,
          width: 13, height: 13, borderRadius: "50%",
          background: value ? "var(--color-bg-primary)" : "var(--color-text-muted)",
          transition: "left .15s",
        }}/>
      </button>
      <div className="col" style={{ gap: 2, flex: 1 }}>
        <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{label}</span>
        {help && <span className="text-xs muted" style={{ lineHeight: 1.4 }}>{help}</span>}
      </div>
    </label>
  );
}

function FilterBar({ filters, setFilters, ds }) {
  const [openAdvanced, setOpenAdvanced] = useState(false);
  const advancedCount = (filters.advanced.onlyFailures ? 1 : 0)
    + (filters.advanced.firstDayOnly ? 1 : 0)
    + (filters.advanced.requireFreshness ? 1 : 0);

  const agOptions = (ds?.ags || []).map(a => a.toUpperCase());

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-body" style={{ padding: "12px 16px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <DateRangePicker
          start={filters.start}
          end={filters.end}
          onChange={(r) => setFilters({ ...filters, ...r })}
        />

        <div style={{ width: 1, height: 22, background: "var(--color-border-subtle)" }}/>

        <PillToggleGroup
          label="Asset groups"
          options={agOptions}
          value={filters.assetGroups}
          onChange={(v) => setFilters({ ...filters, assetGroups: v })}
        />

        <div style={{ flex: 1 }}/>

        <button className="btn btn-outline" onClick={() => setOpenAdvanced(true)}>
          <Icons.ListFilter size={12}/>
          More filters
          {advancedCount > 0 && (
            <span className="badge badge-info badge-mono" style={{ padding: "0 6px", fontSize: 10 }}>{advancedCount}</span>
          )}
        </button>

        <button className="btn btn-primary">
          <Icons.Refresh size={12}/>
          Refresh
        </button>
      </div>

      {filters.assetGroups.length > 0 && (
        <div className="row" style={{ padding: "8px 16px", borderTop: "1px solid var(--color-border-subtle)", gap: 6, flexWrap: "wrap", background: "var(--color-bg-tertiary)" }}>
          <Icons.Filter size={11} className="muted"/>
          <span className="text-xs muted">Filtered to</span>
          {filters.assetGroups.map(ag => (
            <span key={ag} className="chip chip-active">
              {ag}
              <span className="chip-x" onClick={() => setFilters({ ...filters, assetGroups: filters.assetGroups.filter(g => g !== ag) })}>×</span>
            </span>
          ))}
          <button className="btn btn-xs btn-ghost" onClick={() => setFilters({ ...filters, assetGroups: [] })}>Clear</button>
        </div>
      )}

      <AdvancedPopover
        open={openAdvanced}
        onClose={() => setOpenAdvanced(false)}
        advanced={filters.advanced}
        setAdvanced={(adv) => setFilters({ ...filters, advanced: adv })}
      />
    </section>
  );
}

Object.assign(window, { FilterBar, DateRangePicker, PillToggleGroup });
