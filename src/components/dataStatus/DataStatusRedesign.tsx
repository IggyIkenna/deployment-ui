/**
 * DataStatusRedesign — the redesigned Data Status tab body.
 *
 * Faithful port of the prototype's `App` (`design/data-status-redesign/`),
 * minus the global chrome (header / service sidebar / service tab strip), all
 * of which the real deployment-ui already provides. Renders, for the selected
 * service: SummaryHero + FilterBar + NeedsAttention + the COVERAGE visual
 * switcher (Heatmap / Stacked / Matrix / Columns) + the drilldown drawer.
 *
 * Wired to the live `/api/data-status/grid` endpoint via `buildServiceDataset`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./redesign.css";
import {
  buildServiceDataset,
  loadAgGrid,
  rollupService,
  type FailureItem,
  type MissingItem,
  type ServiceDataset,
} from "./redesignData";
import { Drawer, useDrillStack, type DrillEntry } from "./redesignDrawer";
import { Icons } from "./redesignIcons";
import { addDays, cls, ymd } from "./redesignUtil";
import {
  FilterBar,
  InventoryStats,
  NeedsAttention,
  SummaryHero,
  type Filters,
} from "./redesignSummary";
import {
  clearDataStatusCache,
  getDataCoverageSummary,
  type CoverageSummaryResponse,
} from "../../api/client";
import {
  VisualColumns,
  VisualHeatmap,
  VisualMatrix,
  VisualStacked,
} from "./redesignVisuals";

type VisualId = "heatmap" | "stacked" | "matrix" | "columns";

/** Visuals that need the slow per-day `/grid` data. */
const GRID_VISUALS: ReadonlySet<VisualId> = new Set(["heatmap", "matrix"]);

function VisualSwitcher({
  value,
  onChange,
}: {
  value: VisualId;
  onChange: (v: VisualId) => void;
}) {
  const opts: {
    id: VisualId;
    label: string;
    icon: (typeof Icons)[keyof typeof Icons];
    desc: string;
  }[] = [
    {
      id: "heatmap",
      label: "Heatmap",
      icon: Icons.Grid,
      desc: "By date, color-coded",
    },
    {
      id: "stacked",
      label: "Stacked",
      icon: Icons.BarChart,
      desc: "By primary axis, % healthy",
    },
    {
      id: "matrix",
      label: "Matrix",
      icon: Icons.ChartCal,
      desc: "Primary × day grid",
    },
    {
      id: "columns",
      label: "Columns",
      icon: Icons.Layers,
      desc: "Finder-style cascade",
    },
  ];
  return (
    <div
      className="row"
      style={{ justifyContent: "space-between", margin: "8px 0 14px" }}
    >
      <div className="row" style={{ gap: 8 }}>
        <span
          className="text-xs muted"
          style={{
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Coverage
        </span>
        <div className="tabs">
          {opts.map((o) => {
            const I = o.icon;
            const active = o.id === value;
            return (
              <button
                key={o.id}
                className={cls("tab", active && "tab-active")}
                onClick={() => onChange(o.id)}
                title={o.desc}
              >
                <I size={12} />
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DataStatusRedesign({ service }: { service: string }) {
  // Default 30-day window ending today (matches the prototype + screenshots).
  const [filters, setFilters] = useState<Filters>(() => {
    const today = new Date();
    return {
      start: ymd(addDays(today, -29)),
      end: ymd(today),
      assetGroups: [],
    };
  });
  const [mode, setMode] = useState("batch");
  const [visual, setVisual] = useState<VisualId>("stacked");
  // Hardcoded prototype defaults (tweaks panel dropped — dev-only).
  const simplified = true;

  const [ds, setDs] = useState<ServiceDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverageSummary, setCoverageSummary] =
    useState<CoverageSummaryResponse | null>(null);
  // Bumped to force a re-fetch of turbo + coverage-summary (Refresh / Clear Cache).
  const [reloadToken, setReloadToken] = useState(0);
  const [clearing, setClearing] = useState(false);
  // Lazy per-day grid load state (Heatmap / Matrix only — slow on real data).
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const gridAbortRef = useRef<AbortController | null>(null);

  // Inventory/volume metrics (Total shards, Instrument rows, Dates, Asset
  // groups, Unique venues) — the old "Instrument Coverage Summary" stats.
  useEffect(() => {
    const controller = new AbortController();
    getDataCoverageSummary({ service, signal: controller.signal })
      .then((s) => setCoverageSummary(s))
      .catch(() => {
        /* non-fatal — inventory row just hides */
      });
    return () => controller.abort();
  }, [service, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setGridError(null);
    buildServiceDataset({
      service,
      start: filters.start,
      end: filters.end,
      mode,
      signal: controller.signal,
    })
      .then((built) => setDs(built))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : "Failed to load coverage data",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [service, filters.start, filters.end, mode, reloadToken]);

  const needsGrid = GRID_VISUALS.has(visual);
  const gridReady = !!ds && ds.ags.every((ag) => ds.agData[ag]?.gridLoaded);

  // Lazily fetch the slow per-day grid the first time a grid visual is shown.
  useEffect(() => {
    if (!ds || !needsGrid || gridReady || gridLoading) return;
    const controller = new AbortController();
    gridAbortRef.current = controller;
    setGridLoading(true);
    setGridError(null);
    loadAgGrid({ ds, signal: controller.signal })
      .then((merged) => {
        if (!controller.signal.aborted) setDs(merged);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setGridError(
          e instanceof Error ? e.message : "Failed to load per-day grid",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setGridLoading(false);
      });
    return () => controller.abort();
  }, [ds, needsGrid, gridReady, gridLoading]);

  const onRefresh = useCallback(() => {
    setReloadToken((t) => t + 1);
  }, []);

  const onClearCache = useCallback(() => {
    setClearing(true);
    clearDataStatusCache()
      .catch(() => {
        /* non-fatal — still re-fetch below */
      })
      .finally(() => {
        setClearing(false);
        setReloadToken((t) => t + 1);
      });
  }, []);

  // Scheduled mode === today's cron window; live/batch keep the chosen range.
  const onModeChange = useCallback((next: string) => {
    setMode(next);
    if (next === "scheduled") {
      const t = ymd(new Date());
      setFilters((f) => ({ ...f, start: t, end: t }));
    }
  }, []);

  const drill = useDrillStack();
  const rollup = useMemo(
    () =>
      ds
        ? rollupService(ds, {
            ags: filters.assetGroups.length
              ? filters.assetGroups.map((a) => a.toLowerCase())
              : null,
            startDate: filters.start,
            endDate: filters.end,
          })
        : null,
    [ds, filters.assetGroups, filters.start, filters.end],
  );

  const onOpenFailure = (f: FailureItem): void =>
    drill.open({
      kind: "cell",
      ag: f.ag,
      primaryValue: f.primaryValue,
      date: f.date,
    });
  const onOpenMissing = (m: MissingItem): void =>
    drill.open({
      kind: "cell",
      ag: m.ag,
      primaryValue: m.primaryValue,
      date: m.start,
    });
  const onOpenAg = (ag: string): void => drill.open({ kind: "ag", ag });
  const onVenue = (p: { ag: string; primaryValue: string }): void =>
    drill.open({ kind: "primary", ag: p.ag, primaryValue: p.primaryValue });
  const onCell = (p: {
    ag: string;
    primaryValue: string;
    date: string;
  }): void =>
    drill.open({
      kind: "cell",
      ag: p.ag,
      primaryValue: p.primaryValue,
      date: p.date,
    });
  const onDay = (p: { ag: string; date: string }): void =>
    drill.open({ kind: "date", ag: p.ag, date: p.date });

  if (loading && !ds) {
    return (
      <div className="data-status-redesign">
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <span className="muted text-sm">Loading data status…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-status-redesign">
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icons.AlertTri
            size={18}
            style={{ color: "var(--color-accent-amber)" }}
          />
          <div
            className="text-sm"
            style={{ marginTop: 8, color: "var(--color-text-secondary)" }}
          >
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!ds || ds.ags.length === 0) {
    return (
      <div className="data-status-redesign">
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <Icons.Info size={18} className="muted" />
          <div className="text-sm muted" style={{ marginTop: 8 }}>
            No coverage data for <b>{service}</b> in this window.
          </div>
        </div>
      </div>
    );
  }

  const activeDrillEntry: DrillEntry | undefined =
    drill.stack[drill.stack.length - 1];
  void activeDrillEntry;

  return (
    <div className="data-status-redesign app-shell" data-density="comfy">
      {rollup && (
        <SummaryHero
          ds={ds}
          rollup={rollup}
          simplified={simplified}
          mode={mode}
          setMode={onModeChange}
          onOpenAg={onOpenAg}
        />
      )}

      <InventoryStats summary={coverageSummary} />

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        ds={ds}
        onRefresh={onRefresh}
        onClearCache={onClearCache}
        clearing={clearing}
        refreshing={loading}
      />

      <NeedsAttention
        ds={ds}
        onOpenFailure={onOpenFailure}
        onOpenMissing={onOpenMissing}
        onRecheck={onRefresh}
      />

      <VisualSwitcher value={visual} onChange={setVisual} />

      <div key={visual}>
        {needsGrid && !gridReady && (
          <div
            className="card"
            style={{ padding: 40, textAlign: "center" }}
            data-testid="grid-lazy-state"
          >
            {gridError ? (
              <>
                <Icons.AlertTri
                  size={16}
                  style={{ color: "var(--color-accent-amber)" }}
                />
                <div
                  className="text-sm"
                  style={{
                    marginTop: 8,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {gridError}
                </div>
              </>
            ) : (
              <>
                <span className="muted text-sm">Loading per-day grid…</span>
                <div className="text-xs muted" style={{ marginTop: 8 }}>
                  The per-day grid is slow on live data (large manifest index) —
                  the overview above is already up to date.
                </div>
              </>
            )}
          </div>
        )}
        {visual === "heatmap" && gridReady && (
          <VisualHeatmap ds={ds} filters={filters} onDayClick={onDay} />
        )}
        {visual === "stacked" && (
          <VisualStacked
            ds={ds}
            filters={filters}
            simplified={simplified}
            onVenueClick={onVenue}
          />
        )}
        {visual === "matrix" && gridReady && (
          <VisualMatrix ds={ds} filters={filters} onCellClick={onCell} />
        )}
        {visual === "columns" && (
          <VisualColumns ds={ds} filters={filters} onCellClick={onCell} />
        )}
      </div>

      <Drawer drill={drill} ds={ds} />
    </div>
  );
}
