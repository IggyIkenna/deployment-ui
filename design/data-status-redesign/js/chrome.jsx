// Top-of-page chrome: brand header, service sidebar, service tabs.
// Trimmed-down faithful reproduction of src/components/Header.tsx +
// src/components/ServiceList.tsx + the per-service Tabs in App.tsx.

function TopHeader({ env = "staging" }) {
  return (
    <header style={{
      borderBottom: "1px solid var(--color-border-default)",
      background: "var(--color-bg-secondary)",
      padding: "10px 22px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
    }}>
      <div className="row" style={{ gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "color-mix(in srgb, var(--color-accent-cyan) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent)",
          color: "var(--color-accent-cyan)",
          display: "grid", placeItems: "center",
        }}>
          <Icons.Server size={16} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}>
            Unified Trading Deployment
          </div>
          <div className="font-mono text-xs muted">deployment monitoring &amp; orchestration</div>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <span className="badge badge-success badge-mono">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-accent-green)" }} />
          LIVE
        </span>

        {["VM Deployments", "Subscriptions", "Live Ops", "DART", "Safety Ops", "ML"].map(l => (
          <span key={l} className="hdr-link">{l}</span>
        ))}

        <span
          className="badge badge-mono"
          style={{
            background: env === "prod" ? "color-mix(in srgb, var(--color-accent-red) 12%, transparent)"
                       : env === "staging" ? "color-mix(in srgb, var(--color-accent-amber) 12%, transparent)"
                       : "color-mix(in srgb, var(--color-accent-green) 12%, transparent)",
            color: env === "prod" ? "var(--color-accent-red)"
                  : env === "staging" ? "var(--color-accent-amber)"
                  : "var(--color-accent-green)",
            borderColor: env === "prod" ? "color-mix(in srgb, var(--color-accent-red) 30%, transparent)"
                       : env === "staging" ? "color-mix(in srgb, var(--color-accent-amber) 30%, transparent)"
                       : "color-mix(in srgb, var(--color-accent-green) 30%, transparent)",
          }}
        >
          {env.toUpperCase()}
        </span>

        <div className="cloud-toggle">
          <button className="active"><Icons.Cloud size={11}/> GCP</button>
          <button>AWS</button>
        </div>

        <div className="row" style={{ gap: 6, paddingLeft: 6, borderLeft: "1px solid var(--color-border-default)", marginLeft: 4 }}>
          <Icons.Activity size={14} className="" style={{ color: "var(--color-accent-green)" }}/>
          <span className="text-xs sec">API</span>
          <span className="badge badge-success">Connected</span>
          <span className="badge badge-mono">v0.1.1</span>
        </div>
      </div>
    </header>
  );
}

function ServiceSidebar({ selected, onSelect }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const s of SERVICES) (g[s.layer] ||= []).push(s);
    return g;
  }, []);

  return (
    <aside className="sidebar">
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--color-bg-tertiary)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 6, padding: "5px 9px",
        }}>
          <Icons.Search size={12} style={{ color: "var(--color-text-muted)" }}/>
          <input
            placeholder="Find a service…"
            style={{
              flex: 1, background: "transparent", border: 0, outline: "none",
              color: "var(--color-text-primary)", fontSize: 12, minWidth: 0,
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
      </div>
      {Object.entries(grouped).map(([layer, items]) => (
        <div key={layer}>
          <div className="sidebar-section">{layer}</div>
          {items.map(s => (
            <div
              key={s.name}
              className={cls("nav-item", s.name === selected && "nav-item-active")}
              onClick={() => onSelect?.(s.name)}
            >
              <span
                className="dot"
                style={{
                  background: s.name === selected ? "var(--color-accent-cyan)" : "var(--color-border-emphasis)",
                }}
              />
              <span className="truncate" style={{ flex: 1 }}>{s.label}</span>
              {s.name === "market-tick-data-service" && (
                <span className="badge badge-warning badge-mono" style={{ padding: "1px 6px", fontSize: 10 }}>3</span>
              )}
              {s.name === "features-service" && (
                <span className="badge badge-error badge-mono" style={{ padding: "1px 6px", fontSize: 10 }}>!</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

const TAB_DEFS = [
  { id: "deploy",      label: "Deploy",      icon: Icons.Play     },
  { id: "monitor",     label: "Monitor",     icon: Icons.Eye      },
  { id: "builds",      label: "Builds",      icon: Icons.Wrench   },
  { id: "data-status", label: "Data Status", icon: Icons.Database },
  { id: "readiness",   label: "Readiness",   icon: Icons.Check    },
  { id: "config",      label: "Config",      icon: Icons.Settings },
];

function ServiceTabs({ active = "data-status", onSelect, serviceLabel, ds }) {
  const axisRows = ds?.ags?.map(ag => ({
    ag,
    primary: ds.agData[ag].primary,
    shardAxes: getShardAxes(ds.service, ag) || [],
    shardsPerCell: ds.agData[ag].shardsPerCell,
  })) || [];

  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="text-xs muted font-mono">{serviceLabel?.layer || "Service"}</span>
        <Icons.ChevronRight size={11} className="muted"/>
        <span className="text-sm" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
          {serviceLabel?.label || ""}
        </span>
        <span className="text-xs muted font-mono">· {serviceLabel?.name || ""}</span>
        <span className="badge badge-info badge-mono" style={{ marginLeft: 6 }}>MANIFEST</span>

        {/* Shard-shape tooltip — explicit multi-axis granularity, on hover. */}
        {axisRows.length > 0 && (
          <span className="tooltip-host" tabIndex={0}>
            <span className="hdr-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px" }}>
              <Icons.Layers size={11}/>
              <span className="font-mono" style={{ fontSize: 11 }}>shard shape</span>
              <Icons.Info size={11} className="muted"/>
            </span>
            <span className="tooltip-pop" role="tooltip">
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 }}>
                Shard granularity
              </span>
              <span style={{ display: "block", fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
                Authoritative axes from <code>SHARD_AXIS_MATRIX</code>. The <span style={{ color: "var(--color-accent-cyan)" }}>primary</span> axis drives the grid; sub-axes drill inside each cell.
              </span>
              <span className="col" style={{ gap: 7 }}>
                {axisRows.map(({ ag, primary, shardAxes, shardsPerCell }) => (
                  <span key={ag} className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge badge-outline badge-mono" style={{ background: "var(--color-bg-secondary)" }}>{ag.toUpperCase()}</span>
                    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      {shardAxes.map((axis, i) => (
                        <React.Fragment key={axis}>
                          {i > 0 && <span className="muted font-mono" style={{ fontSize: 11 }}>×</span>}
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 11,
                              color: axis === primary ? "var(--color-accent-cyan)" : "var(--color-text-secondary)",
                              fontWeight: axis === primary ? 600 : 400,
                            }}
                          >
                            {axis}
                          </span>
                        </React.Fragment>
                      ))}
                      <span className="muted font-mono" style={{ fontSize: 11 }}>× day</span>
                    </span>
                    {shardsPerCell > 1 && (
                      <span className="text-xs muted font-mono">≈{fmtNumber(shardsPerCell)}/cell</span>
                    )}
                  </span>
                ))}
              </span>
            </span>
          </span>
        )}
      </div>

      <div className="tabs">
        {TAB_DEFS.map(t => {
          const I = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              className={cls("tab", isActive && "tab-active")}
              onClick={() => onSelect?.(t.id)}
            >
              <I size={13}/>
              {t.label}
              {t.id === "data-status" && isActive && (
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: "var(--color-accent-cyan)", marginLeft: 2,
                }}/>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { TopHeader, ServiceSidebar, ServiceTabs });
