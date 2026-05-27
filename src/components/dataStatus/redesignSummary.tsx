/**
 * Summary hero + filter bar + needs-attention panel for the redesigned Data
 * Status tab. Ported from the prototype's `summary.jsx` / `filters.jsx` /
 * `issues.jsx`; classNames preserved verbatim so `redesign.css` applies.
 */

import { useMemo, useState } from "react";
import type { CoverageSummaryResponse } from "../../api/client";
import {
  recentFailures,
  recentMissing,
  staleCapture,
  type AgRollup,
  type CellStats,
  type FailureItem,
  type MissingItem,
  type ServiceDataset,
  type ServiceRollup,
} from "./redesignData";
import { Icons } from "./redesignIcons";
import { cls, fmtNumber, ymd, parseYmd, addDays } from "./redesignUtil";

export interface Filters {
  start: string;
  end: string;
  assetGroups: string[];
}

// ───────────── Coverage stack ─────────────

export function CoverageStack({
  counts,
  total,
  simplified,
  height = "thick",
}: {
  counts: CellStats;
  total: number;
  simplified: boolean;
  height?: "thick" | "thin";
}) {
  const seg = (key: keyof CellStats): number =>
    total === 0 ? 0 : (((counts[key] as number) || 0) / total) * 100;
  const segs = simplified
    ? [
        {
          key: "ok",
          pct: seg("captured") + seg("empty") + seg("known-empty"),
          cls: "stack-seg-captured",
        },
        { key: "partial", pct: seg("partial"), cls: "stack-seg-partial" },
        { key: "failed", pct: seg("failed"), cls: "stack-seg-failed" },
        { key: "missing", pct: seg("unattempted"), cls: "stack-seg-missing" },
      ]
    : [
        { key: "captured", pct: seg("captured"), cls: "stack-seg-captured" },
        { key: "empty", pct: seg("empty"), cls: "stack-seg-empty" },
        {
          key: "known-empty",
          pct: seg("known-empty"),
          cls: "stack-seg-known-empty",
        },
        { key: "partial", pct: seg("partial"), cls: "stack-seg-partial" },
        { key: "failed", pct: seg("failed"), cls: "stack-seg-failed" },
        { key: "missing", pct: seg("unattempted"), cls: "stack-seg-missing" },
      ];
  return (
    <div className={cls("stack", height === "thick" && "stack-thick")}>
      {segs.map((s) => (
        <div
          key={s.key}
          className={cls("stack-seg", s.cls)}
          style={{ width: `${s.pct}%` }}
          title={`${s.key}: ${s.pct.toFixed(1)}%`}
        />
      ))}
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </span>
  );
}

function AssetGroupTile({
  ag,
  stats,
  simplified,
  onClick,
}: {
  ag: string;
  stats: AgRollup;
  simplified: boolean;
  onClick?: () => void;
}) {
  const pct = (stats.honestCoverage || stats.coverage || 0) * 100;
  const tone = pct >= 95 ? "good" : pct >= 80 ? "warn" : "bad";
  return (
    <div
      className="ag-card"
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <div className="hd">
        <span className="ag-name">{ag.toUpperCase()}</span>
        <span className={cls("pct", tone)}>{pct.toFixed(1)}%</span>
      </div>
      <CoverageStack
        counts={stats}
        total={stats.total}
        simplified={simplified}
      />
      <div className="ft">
        <span>{fmtNumber(stats.total)} shards</span>
        <span
          style={{
            color:
              stats.failed > 0
                ? "var(--color-accent-red)"
                : "var(--color-text-muted)",
          }}
        >
          {stats.failed > 0
            ? `${fmtNumber(stats.failed)} failing`
            : "no failures"}
        </span>
      </div>
    </div>
  );
}

function KeyStats({
  overall,
  lastRefreshed,
  mode,
}: {
  overall: AgRollup;
  lastRefreshed: string;
  mode: string;
}) {
  const captured = overall.captured + overall.empty + overall["known-empty"];
  const failing = overall.failed + overall.unattempted;
  const honestPct = (overall.honestCoverage * 100).toFixed(1);
  return (
    <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
      <div className="stat">
        <span className="stat-label">Honest coverage</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span
            className="stat-value"
            style={{
              color:
                overall.honestCoverage >= 0.95
                  ? "var(--color-accent-green)"
                  : overall.honestCoverage >= 0.85
                    ? "var(--color-accent-amber)"
                    : "var(--color-accent-red)",
            }}
          >
            {honestPct}
            <span style={{ fontSize: 18, color: "var(--color-text-muted)" }}>
              %
            </span>
          </span>
          <span className="stat-delta stat-delta-good">+0.4% vs 7d</span>
        </div>
      </div>
      <div
        style={{
          width: 1,
          alignSelf: "stretch",
          background: "var(--color-border-subtle)",
        }}
      />
      <div className="stat">
        <span className="stat-label">Shards captured</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span className="stat-value">{fmtNumber(captured)}</span>
          <span className="stat-delta">of {fmtNumber(overall.total)}</span>
        </div>
      </div>
      <div
        style={{
          width: 1,
          alignSelf: "stretch",
          background: "var(--color-border-subtle)",
        }}
      />
      <div className="stat">
        <span className="stat-label">Needs attention</span>
        <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
          <span
            className="stat-value"
            style={{
              color:
                failing > 0
                  ? "var(--color-accent-red)"
                  : "var(--color-text-primary)",
            }}
          >
            {fmtNumber(failing)}
          </span>
          <span className="stat-delta">
            {fmtNumber(overall.failed)} failed ·{" "}
            {fmtNumber(overall.unattempted)} missing
          </span>
        </div>
      </div>
      <div
        style={{
          width: 1,
          alignSelf: "stretch",
          background: "var(--color-border-subtle)",
        }}
      />
      <div className="stat">
        <span className="stat-label">As of</span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
            color: "var(--color-text-primary)",
          }}
        >
          {lastRefreshed}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <Icons.Clock size={11} className="muted" />
          <span className="text-xs muted">manifest · 4.2s scan · {mode}</span>
        </div>
      </div>
    </div>
  );
}

function ModeStrip({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const opts = [
    {
      id: "batch",
      label: "Batch",
      icon: Icons.Calendar,
      desc: "Historical backfills",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      icon: Icons.Clock,
      desc: "Today's cron windows",
    },
    {
      id: "live",
      label: "Live",
      icon: Icons.Activity,
      desc: "Websocket pipelines",
    },
  ];
  return (
    <div className="row" style={{ gap: 8 }}>
      {opts.map((o) => {
        const I = o.icon;
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cls("btn", active ? "btn-outline" : "btn-ghost")}
            style={{
              borderColor: active
                ? "var(--color-accent-cyan)"
                : "var(--color-border-default)",
              color: active
                ? "var(--color-accent-cyan)"
                : "var(--color-text-secondary)",
              background: active ? "var(--color-accent-dim)" : "transparent",
              padding: "5px 12px",
            }}
            title={o.desc}
          >
            <I size={12} />
            {o.label}
            {o.id === "live" && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--color-accent-green)",
                  marginLeft: 2,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SummaryHero({
  ds,
  rollup,
  simplified,
  mode,
  setMode,
  onOpenAg,
}: {
  ds: ServiceDataset;
  rollup: ServiceRollup;
  simplified: boolean;
  mode: string;
  setMode: (v: string) => void;
  onOpenAg: (ag: string) => void;
}) {
  const ags = ds.ags;
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div className="card-body" style={{ paddingBottom: 8 }}>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <KeyStats
            overall={rollup.overall}
            lastRefreshed="13:42:18"
            mode={mode}
          />
          <ModeStrip value={mode} onChange={setMode} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.max(1, ags.length)}, minmax(0, 1fr))`,
            gap: 10,
          }}
        >
          {ags.map((ag) => (
            <AssetGroupTile
              key={ag}
              ag={ag}
              stats={rollup.byAg[ag] ?? { ...rollup.overall, total: 0 }}
              simplified={simplified}
              onClick={() => onOpenAg(ag)}
            />
          ))}
        </div>

        <div
          className="row"
          style={{
            gap: 14,
            marginTop: 14,
            fontSize: 11,
            color: "var(--color-text-muted)",
            flexWrap: "wrap",
          }}
        >
          {simplified ? (
            <>
              <LegendChip
                color="var(--color-accent-green)"
                label="OK (captured · honest empty)"
              />
              <LegendChip color="var(--color-accent-amber)" label="Partial" />
              <LegendChip color="var(--color-accent-red)" label="Failed" />
              <LegendChip
                color="color-mix(in srgb, var(--color-accent-red) 50%, var(--color-bg-tertiary))"
                label="Missing (not attempted)"
              />
            </>
          ) : (
            <>
              <LegendChip color="var(--color-accent-green)" label="Captured" />
              <LegendChip
                color="var(--color-accent-teal)"
                label="Empty confirmed"
              />
              <LegendChip
                color="var(--color-accent-sky)"
                label="Known-empty (expected)"
              />
              <LegendChip color="var(--color-accent-amber)" label="Partial" />
              <LegendChip
                color="var(--color-accent-red)"
                label="Attempted, failed"
              />
              <LegendChip
                color="color-mix(in srgb, var(--color-accent-red) 50%, var(--color-bg-tertiary))"
                label="Pending (not yet attempted)"
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ───────────── Filter bar ─────────────

function PillToggleGroup({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
}) {
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {label && (
        <span className="text-xs muted" style={{ marginRight: 4 }}>
          {label}
        </span>
      )}
      <button
        onClick={() => onChange([])}
        className={cls("chip", value.length === 0 && "chip-active")}
        style={{
          cursor: "pointer",
          border: "1px solid var(--color-border-default)",
        }}
      >
        All
      </button>
      {options.map((o) => {
        const active = value.includes(o);
        return (
          <button
            key={o}
            onClick={() =>
              active
                ? onChange(value.filter((v) => v !== o))
                : onChange([...value, o])
            }
            className={cls("chip", active && "chip-active")}
            style={{
              cursor: "pointer",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function DateRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (r: { start: string; end: string }) => void;
}) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <div
        className="row"
        style={{
          gap: 4,
          padding: "4px 6px 4px 10px",
          border: "1px solid var(--color-border-default)",
          borderRadius: 6,
          background: "var(--color-bg-tertiary)",
        }}
      >
        <Icons.Calendar size={12} className="muted" />
        <input
          type="date"
          value={start}
          onChange={(e) => onChange({ start: e.target.value, end })}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            width: 110,
            outline: "none",
            padding: 0,
          }}
        />
        <span
          className="muted"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
        >
          →
        </span>
        <input
          type="date"
          value={end}
          onChange={(e) => onChange({ start, end: e.target.value })}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            width: 110,
            outline: "none",
            padding: 0,
          }}
        />
      </div>
      {/* Quick-range presets — set start relative to the current end date. */}
      <div className="row" style={{ gap: 4 }}>
        {(
          [
            { label: "30d", days: 30 },
            { label: "60d", days: 60 },
            { label: "90d", days: 90 },
            { label: "All", days: null },
          ] as const
        ).map((p) => {
          const applyPreset = () => {
            if (p.days === null) {
              onChange({ start: "2018-01-01", end });
            } else {
              onChange({
                start: ymd(addDays(parseYmd(end), -(p.days - 1))),
                end,
              });
            }
          };
          return (
            <button
              key={p.label}
              onClick={applyPreset}
              className="btn btn-xs btn-ghost"
              style={{
                border: "1px solid var(--color-border-default)",
                padding: "3px 9px",
              }}
              title={p.days === null ? "Full history" : `Last ${p.days} days`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterBar({
  filters,
  setFilters,
  ds,
  onRefresh,
  onClearCache,
  clearing,
  refreshing,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  ds: ServiceDataset;
  onRefresh?: () => void;
  onClearCache?: () => void;
  clearing?: boolean;
  refreshing?: boolean;
}) {
  const agOptions = ds.ags.map((a) => a.toUpperCase());
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div
        className="card-body"
        style={{
          padding: "12px 16px",
          display: "flex",
          gap: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <DateRangePicker
          start={filters.start}
          end={filters.end}
          onChange={(r) => setFilters({ ...filters, ...r })}
        />
        <div
          style={{
            width: 1,
            height: 22,
            background: "var(--color-border-subtle)",
          }}
        />
        <PillToggleGroup
          label="Asset groups"
          options={agOptions}
          value={filters.assetGroups}
          onChange={(v) => setFilters({ ...filters, assetGroups: v })}
        />
        <div style={{ flex: 1 }} />
        <button className="btn btn-outline">
          <Icons.ListFilter size={12} />
          More filters
        </button>
        <button
          className="btn btn-outline"
          onClick={onClearCache}
          disabled={clearing}
          data-testid="data-status-clear-cache"
          title="Clear the data-status cache, then re-check"
        >
          <Icons.Trash size={12} />
          {clearing ? "Clearing…" : "Clear cache"}
        </button>
        <button
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={refreshing}
          data-testid="data-status-refresh"
          title="Re-check status (re-fetch turbo + coverage summary)"
        >
          <Icons.Refresh size={12} />
          {refreshing ? "Checking…" : "Check status"}
        </button>
      </div>
      {filters.assetGroups.length > 0 && (
        <div
          className="row"
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--color-border-subtle)",
            gap: 6,
            flexWrap: "wrap",
            background: "var(--color-bg-tertiary)",
          }}
        >
          <Icons.Filter size={11} className="muted" />
          <span className="text-xs muted">Filtered to</span>
          {filters.assetGroups.map((ag) => (
            <span key={ag} className="chip chip-active">
              {ag}
              <span
                className="chip-x"
                onClick={() =>
                  setFilters({
                    ...filters,
                    assetGroups: filters.assetGroups.filter((g) => g !== ag),
                  })
                }
              >
                ×
              </span>
            </span>
          ))}
          <button
            className="btn btn-xs btn-ghost"
            onClick={() => setFilters({ ...filters, assetGroups: [] })}
          >
            Clear
          </button>
        </div>
      )}
    </section>
  );
}

// ───────────── Needs attention ─────────────

function Column({
  color,
  label,
  count,
  last,
  children,
}: {
  color: string;
  label: string;
  count: number;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ borderRight: last ? 0 : "1px solid var(--color-border-subtle)" }}
    >
      <div
        style={{
          padding: "10px 14px 8px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: color,
          }}
        />
        {label}
        <span
          className="text-xs muted"
          style={{
            marginLeft: "auto",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "center",
        padding: "20px 14px",
        color: "var(--color-text-muted)",
        fontSize: 12,
        gap: 6,
      }}
    >
      <Icons.Check size={12} />
      {label}
    </div>
  );
}

export function NeedsAttention({
  ds,
  onOpenFailure,
  onOpenMissing,
  onRecheck,
}: {
  ds: ServiceDataset;
  onOpenFailure: (f: FailureItem) => void;
  onOpenMissing: (m: MissingItem) => void;
  onRecheck?: () => void;
}) {
  const failures = useMemo(() => recentFailures(ds, { limit: 5 }), [ds]);
  const missing = useMemo(() => recentMissing(ds, { limit: 4 }), [ds]);
  const stale = useMemo(() => staleCapture(ds, { limit: 3 }), [ds]);
  const total = failures.length + missing.length + stale.length;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div
        className="card-head"
        style={{ cursor: "pointer" }}
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <Icons.ChevronRight
          size={14}
          style={{
            transform: collapsed ? "none" : "rotate(90deg)",
            transition: "transform 0.15s",
            color: "var(--color-text-muted)",
          }}
        />
        <Icons.AlertTri
          size={14}
          style={{ color: "var(--color-accent-amber)" }}
        />
        <h3>Needs attention</h3>
        <span className="text-xs muted">last 14 days</span>
        <div style={{ flex: 1 }} />
        <span className="badge badge-outline badge-mono">{total} items</span>
        <button
          className="btn btn-ghost btn-xs"
          data-testid="needs-attention-recheck"
          onClick={(e) => {
            e.stopPropagation();
            onRecheck?.();
          }}
        >
          <Icons.Refresh size={11} />
          Recheck
        </button>
      </div>

      {!collapsed && (
        <div
          className="card-body"
          style={{
            padding: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            borderBottom: 0,
          }}
        >
          <Column
            color="var(--color-accent-red)"
            label="Failures"
            count={failures.length}
          >
            {failures.length === 0 && <EmptyRow label="No failures" />}
            {failures.map((f, i) => (
              <div
                key={i}
                className="attn-row"
                onClick={() => onOpenFailure(f)}
              >
                <span className="attn-dot attn-dot-error" />
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {f.ag.toUpperCase()}/{f.primaryValue}
                    </span>
                    <span className="text-xs muted font-mono">· {f.date}</span>
                  </div>
                  <span className="text-xs muted truncate">
                    {f.failed}/{f.total} shards
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icons.Refresh size={11} />
                  Retry
                </button>
              </div>
            ))}
          </Column>

          <Column
            color="var(--color-accent-amber)"
            label="Missing dates"
            count={missing.length}
          >
            {missing.length === 0 && <EmptyRow label="No gaps detected" />}
            {missing.map((m, i) => (
              <div
                key={i}
                className="attn-row"
                onClick={() => onOpenMissing(m)}
              >
                <span className="attn-dot attn-dot-warn" />
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {m.ag.toUpperCase()}/{m.primaryValue}
                    </span>
                    <span className="text-xs muted font-mono">
                      · {m.count}d gap
                    </span>
                  </div>
                  <span className="text-xs muted font-mono">
                    {m.start === m.end ? m.start : `${m.start} → ${m.end}`}
                  </span>
                </div>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icons.Rocket size={11} />
                  Deploy
                </button>
              </div>
            ))}
          </Column>

          <Column
            color="var(--color-accent-blue)"
            label="Stale capture"
            count={stale.length}
            last
          >
            {stale.length === 0 && <EmptyRow label="All current" />}
            {stale.map((s, i) => (
              <div
                key={i}
                className="attn-row"
                onClick={() =>
                  onOpenMissing({
                    ag: s.ag,
                    primary: s.primary,
                    primaryValue: s.primaryValue,
                    start: s.lastCaptured,
                    end: s.lastCaptured,
                    count: s.gap,
                  })
                }
              >
                <span className="attn-dot attn-dot-info" />
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span
                      className="font-mono text-xs truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {s.ag.toUpperCase()}/{s.primaryValue}
                    </span>
                    <span className="text-xs muted font-mono">
                      · {s.gap}d behind
                    </span>
                  </div>
                  <span className="text-xs muted">
                    Last captured {s.lastCaptured}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Icons.Eye size={11} />
                  Inspect
                </button>
              </div>
            ))}
          </Column>
        </div>
      )}
    </section>
  );
}

const fmtCompact = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(n);

/**
 * Inventory / volume stat row — the metrics the old "Instrument Coverage
 * Summary" carried (Total shards, Instrument rows, Dates, Asset groups, Unique
 * venues, Instruments latest day). Sourced from /data-status/coverage-summary
 * (the same endpoint the old card used); fresh from the manifest, not enums.
 */
export function InventoryStats({
  summary,
}: {
  summary: CoverageSummaryResponse | null;
}) {
  if (!summary) return null;
  const t = summary.totals;
  const ags = Object.keys(summary.asset_groups ?? {});
  const uniqueVenues = ags.reduce(
    (s, ag) => s + (summary.asset_groups[ag]?.unique_venues ?? 0),
    0,
  );
  const cards: { label: string; value: string }[] = [
    { label: "Total shards", value: fmtNumber(t.shards) },
    { label: "Instrument rows", value: fmtCompact(t.instrument_rows) },
    {
      label: "Dates (all groups)",
      value: fmtNumber(
        t.dates_across_asset_groups ?? t.dates_across_categories ?? 0,
      ),
    },
    { label: "Asset groups", value: String(ags.length) },
    { label: "Unique venues", value: fmtNumber(uniqueVenues) },
    {
      label: "Instruments (latest)",
      value: fmtNumber(t.latest_day_instruments),
    },
  ];
  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <div
        className="card-body"
        style={{
          padding: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`,
          borderBottom: 0,
        }}
      >
        {cards.map((c, i) => (
          <div
            key={c.label}
            style={{
              padding: "14px 18px",
              borderRight:
                i < cards.length - 1
                  ? "1px solid var(--color-border-subtle)"
                  : 0,
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                color: "var(--color-text-primary)",
                lineHeight: 1.1,
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginTop: 4,
              }}
            >
              {c.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
