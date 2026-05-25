// App composition. Wires up state, the Tweaks panel, the visual switcher,
// and the drawer.

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [service, setService] = useState("market-tick-data-service");
  const [tab, setTab] = useState("data-status");
  const [mode, setMode] = useState("batch");

  const [filters, setFilters] = useState({
    start: ymd(addDays(TODAY, -29)),
    end: DATE_END,
    assetGroups: [],   // empty = all
    advanced: { onlyFailures: false, firstDayOnly: false, requireFreshness: false },
  });

  const ds = useMemo(() => buildServiceDataset({ service, seed: 42, shardCap: t.shardCap || 400 }), [service, t.shardCap]);

  const rollup = useMemo(() => rollupService(ds, {
    ags: filters.assetGroups.length ? filters.assetGroups : null,
    startDate: filters.start, endDate: filters.end,
  }), [ds, filters]);

  const drill = useDrillStack();

  // Click handlers — all paths route to the drawer
  const onDayClick   = useCallback((p) => drill.open({ kind: "date", ag: p.ag, date: p.date }), [drill]);
  const onVenueClick = useCallback((p) => drill.open({ kind: "primary", ag: p.ag, primaryValue: p.primaryValue }), [drill]);
  const onCellClick  = useCallback((p) => drill.open({ kind: "cell", ag: p.ag, primaryValue: p.primaryValue, date: p.date }), [drill]);
  const onOpenAg     = useCallback((ag) => drill.open({ kind: "ag", ag }), [drill]);
  const onOpenFailure = useCallback((f) => drill.open({ kind: "cell", ag: f.ag, primaryValue: f.primaryValue, date: f.date }), [drill]);
  const onOpenMissing = useCallback((m) => drill.open({ kind: "cell", ag: m.ag, primaryValue: m.primaryValue, date: m.start }), [drill]);

  const selectedService = SERVICES.find(s => s.name === service);
  const simplified = t.honestCoverage === "simplified";

  return (
    <div className="app-shell" data-density={t.density}>
      <TopHeader env="staging"/>

      <div className="app-body" data-no-sidebar={!t.showServiceSidebar}>
        {t.showServiceSidebar && <ServiceSidebar selected={service} onSelect={setService}/>}

        <main className="app-main" style={{ position: "relative" }}>
          <ServiceTabs active={tab} onSelect={setTab} serviceLabel={selectedService} ds={ds}/>

          {tab !== "data-status" ? (
            <PlaceholderTab tab={tab}/>
          ) : (
            <>
              <SummaryHero
                ds={ds}
                rollup={rollup}
                simplified={simplified}
                mode={mode}
                setMode={setMode}
                onOpenAg={onOpenAg}
              />

              <FilterBar filters={filters} setFilters={setFilters} ds={ds}/>

              {t.showNeedsAttention && (
                <NeedsAttention
                  ds={ds}
                  onOpenFailure={onOpenFailure}
                  onOpenMissing={onOpenMissing}
                />
              )}

              <VisualSwitcher
                value={t.primaryVisual}
                onChange={(v) => setTweak("primaryVisual", v)}
              />

              <div key={t.primaryVisual}>
                {t.primaryVisual === "heatmap" && <VisualHeatmap ds={ds} filters={filters} onDayClick={onDayClick}/>}
                {t.primaryVisual === "stacked" && <VisualStacked ds={ds} filters={filters} simplified={simplified} onVenueClick={onVenueClick}/>}
                {t.primaryVisual === "matrix"  && <VisualMatrix  ds={ds} filters={filters} onCellClick={onCellClick}/>}
                {t.primaryVisual === "columns" && <VisualColumns ds={ds} filters={filters} onCellClick={onCellClick}/>}
              </div>
            </>
          )}
        </main>
      </div>

      <Drawer drill={drill} ds={ds}/>

      <TweaksPanel>
        <TweakSection label="Primary visual"/>
        <TweakSelect label="Layout"          value={t.primaryVisual}     options={[
          {value: "heatmap", label: "Heatmap calendar"},
          {value: "stacked", label: "Stacked coverage"},
          {value: "matrix",  label: "Date matrix"},
          {value: "columns", label: "Columns (Finder)"},
        ]} onChange={(v) => setTweak("primaryVisual", v)}/>
        <TweakSection label="Density"/>
        <TweakRadio  label="Spacing"         value={t.density}           options={["comfy", "compact"]}             onChange={(v) => setTweak("density", v)}/>
        <TweakSection label="Honest coverage"/>
        <TweakRadio  label="Detail"          value={t.honestCoverage}    options={["simplified", "full"]}           onChange={(v) => setTweak("honestCoverage", v)}/>
        <TweakSection label="Stress test"/>
        <TweakSlider label="Shards/cell cap" value={t.shardCap || 400}   min={50} max={3000} step={50}              onChange={(v) => setTweak("shardCap", v)}/>
        <TweakSection label="Chrome"/>
        <TweakToggle label="Service sidebar"        value={t.showServiceSidebar} onChange={(v) => setTweak("showServiceSidebar", v)}/>
        <TweakToggle label="Needs-attention panel"  value={t.showNeedsAttention} onChange={(v) => setTweak("showNeedsAttention", v)}/>
      </TweaksPanel>
    </div>
  );
}

function VisualSwitcher({ value, onChange }) {
  const opts = [
    { id: "heatmap", label: "Heatmap",   icon: Icons.Grid,      desc: "By date, color-coded" },
    { id: "stacked", label: "Stacked",   icon: Icons.BarChart,  desc: "By primary axis, % healthy" },
    { id: "matrix",  label: "Matrix",    icon: Icons.ChartCal,  desc: "Primary × day grid" },
    { id: "columns", label: "Columns",   icon: Icons.Layers,    desc: "Finder-style cascade" },
  ];
  return (
    <div className="row" style={{ justifyContent: "space-between", margin: "8px 0 14px" }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="text-xs muted" style={{ fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" }}>Coverage</span>
        <div className="tabs">
          {opts.map(o => {
            const I = o.icon;
            const active = o.id === value;
            return (
              <button key={o.id} className={cls("tab", active && "tab-active")} onClick={() => onChange?.(o.id)} title={o.desc}>
                <I size={12}/>
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-outline btn-sm"><Icons.Search size={12}/>Find shard</button>
        <button className="btn btn-outline btn-sm"><Icons.Download size={12}/>Export</button>
      </div>
    </div>
  );
}

function PlaceholderTab({ tab }) {
  return (
    <div className="card" style={{ padding: 60, textAlign: "center" }}>
      <div className="muted" style={{ fontSize: 14 }}>
        <Icons.Sparkles size={20} style={{ marginBottom: 8, opacity: .5 }}/>
        <div style={{ marginBottom: 4 }}>The <b>{tab}</b> tab is outside the scope of this redesign.</div>
        <div className="text-xs">Switch back to <b>Data Status</b> to see the prototype.</div>
      </div>
    </div>
  );
}

Object.assign(window, { App });
