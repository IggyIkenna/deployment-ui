import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, DollarSign, Lock, RefreshCw } from "lucide-react";
import {
  fetchCostBreakdown,
  fetchCostSummary,
  fetchCostTimeseries,
  type CloudFilter,
  type CloudSummary,
  type CostBreakdownResponse,
  type CostBreakdownRow,
  type CostCloud,
  type CostDimension,
  type CostSummaryResponse,
  type CostTimeseriesResponse,
} from "../api/deploymentApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";

// Cloud identity — colours are the app's own accent tokens (theme-aware, CVD-validated:
// GCP blue / AWS amber / GitHub purple), distinct from the cyan UI accent.
const CLOUDS: Record<CostCloud, { label: string; color: string }> = {
  gcp: { label: "GCP", color: "var(--color-accent-blue)" },
  aws: { label: "AWS", color: "var(--color-accent-amber)" },
  github: { label: "GitHub", color: "var(--color-accent-purple)" },
};
const CLOUD_ORDER: CostCloud[] = ["gcp", "aws", "github"];

const RANGES = [7, 30, 90] as const;
const CLOUD_FILTERS: { value: CloudFilter; label: string }[] = [
  { value: "all", label: "All clouds" },
  { value: "gcp", label: "GCP" },
  { value: "aws", label: "AWS" },
  { value: "github", label: "GitHub" },
];
const DIMENSIONS: { value: CostDimension; label: string }[] = [
  { value: "service", label: "By service" },
  { value: "resource", label: "By resource" },
  { value: "bucket", label: "By bucket" },
  { value: "region", label: "By region" },
  { value: "day", label: "By day" },
];

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function usdShort(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m)]} ${Number(d)}`;
}

// ---------- segmented control ----------
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- delta chip ----------
function Delta({ pct }: { pct: number | null }) {
  if (pct === null || !isFinite(pct)) return <span className="text-[var(--color-text-muted)]">—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  // Up = more spend = worse (red); down = less = good (green).
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono font-semibold ${
        up ? "text-[var(--color-accent-red)]" : "text-[var(--color-accent-green)]"
      }`}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ---------- sparkline (inline SVG) ----------
function Sparkline({ data, color, w = 96, h = 30 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pad = 2;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const [lx, ly] = pts.split(" ").slice(-1)[0].split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="opacity-90">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  );
}

// ---------- KPI band ----------
function KpiBand({ summary, cloud }: { summary: CostSummaryResponse; cloud: CloudFilter }) {
  const byCloud = new Map(summary.clouds.map((c) => [c.cloud, c]));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="lg:col-span-1">
        <CardContent className="p-4">
          <div className="text-xs text-[var(--color-text-secondary)]">Total spend · last {summary.days} days</div>
          <div data-testid="cost-total" className="mt-2 font-mono text-3xl font-bold tracking-tight">
            {usd(summary.total)}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <Delta pct={summary.delta_pct} />
            <span>vs prior {summary.days}d</span>
            <span className="font-mono">≈ {usd(summary.run_rate_daily)}/day</span>
          </div>
        </CardContent>
      </Card>
      {CLOUD_ORDER.map((c) => {
        const cs: CloudSummary = byCloud.get(c) ?? {
          cloud: c,
          total: 0,
          delta_pct: null,
          daily: [],
          is_placeholder: false,
        };
        const dim = cloud !== "all" && cloud !== c ? "opacity-40" : "";
        const share = summary.total ? ((cs.total / summary.total) * 100).toFixed(1) : "0.0";
        return (
          <Card key={c} className={dim}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS[c].color }} />
                {CLOUDS[c].label}
                {cs.is_placeholder && (
                  <span className="rounded border border-[var(--color-accent-purple)]/50 px-1 text-[9px] font-bold uppercase tracking-wide text-[var(--color-accent-purple)]">
                    mock
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div className="font-mono text-2xl font-bold tracking-tight">{usd(cs.total)}</div>
                <Sparkline data={cs.daily.length ? cs.daily : [0, 0]} color={CLOUDS[c].color} />
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <Delta pct={cs.delta_pct} />
                <span className="font-mono">{share}% of total</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- trend + donut ----------
interface TrendDatum {
  date: string;
  gcp: number;
  aws: number;
  github: number;
}
function TrendCard({ ts, clouds }: { ts: CostTimeseriesResponse; clouds: CostCloud[] }) {
  const data: TrendDatum[] = ts.points.map((p) => ({
    date: shortDate(p.date),
    gcp: p.values.gcp ?? 0,
    aws: p.values.aws ?? 0,
    github: p.values.github ?? 0,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Daily spend by cloud</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ width: "100%", height: 260 }} data-testid="cost-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <defs>
                {clouds.map((c) => (
                  <linearGradient key={c} id={`grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CLOUDS[c].color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CLOUDS[c].color} stopOpacity={0.04} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} minTickGap={24} />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
                tickFormatter={(v: number) => usdShort(v)}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-emphasis)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-text-secondary)" }}
                formatter={(v, name) => [usd(Number(v)), CLOUDS[name as CostCloud]?.label ?? String(name)]}
              />
              {clouds.map((c) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  stroke={CLOUDS[c].color}
                  strokeWidth={2}
                  fill={`url(#grad-${c})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {clouds.map((c) => (
            <span key={c} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS[c].color }} />
              {CLOUDS[c].label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DonutCard({ summary, clouds }: { summary: CostSummaryResponse; clouds: CostCloud[] }) {
  const data = clouds
    .map((c) => ({ cloud: c, value: summary.clouds.find((x) => x.cloud === c)?.total ?? 0 }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cloud share</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          <div className="relative" style={{ width: 150, height: 150 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="cloud"
                  innerRadius={46}
                  outerRadius={66}
                  paddingAngle={2}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                >
                  {data.map((d) => (
                    <Cell key={d.cloud} fill={CLOUDS[d.cloud].color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border-emphasis)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  formatter={(v, name) => [usd(Number(v)), CLOUDS[name as CostCloud]?.label ?? String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Total</div>
                <div className="font-mono text-lg font-bold">{usdShort(total)}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {data.map((d) => (
              <div key={d.cloud} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS[d.cloud].color }} />
                {CLOUDS[d.cloud].label}
                <span className="ml-auto font-mono font-semibold text-[var(--color-text-primary)]">
                  {((d.value / total) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- sortable helper ----------
type SortDir = "asc" | "desc";
function useSort<T>(rows: T[], initialKey: keyof T, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<keyof T>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, key, dir]);
  const toggle = useCallback(
    (k: keyof T) => {
      if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setKey(k);
        setDir(typeof rows[0]?.[k] === "number" ? "desc" : "asc");
      }
    },
    [key, rows],
  );
  return { sorted, key, dir, toggle };
}
function SortHead({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none border-b border-[var(--color-border)] py-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label}
      {active && <span className="ml-1 text-[9px] opacity-60">{dir === "desc" ? "▼" : "▲"}</span>}
    </th>
  );
}

// ---------- breakdown ----------
function BreakdownCard({
  dimension,
  onDimension,
  data,
}: {
  dimension: CostDimension;
  onDimension: (d: CostDimension) => void;
  data: CostBreakdownResponse;
}) {
  const { sorted, key, dir, toggle } = useSort<CostBreakdownRow>(data.rows, "cost");
  const max = Math.max(...data.rows.map((r) => r.cost), 1);
  const barRows = sorted.slice(0, 12);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Breakdown</CardTitle>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {data.cloud === "all" ? "all clouds" : CLOUDS[data.cloud as CostCloud]?.label} · {data.days}d ·{" "}
          {usd(data.total)}
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <Segmented options={DIMENSIONS} value={dimension} onChange={onDimension} label="Breakdown dimension" />
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* bars */}
          <div className="flex flex-col gap-2.5">
            {barRows.map((r) => {
              const col = r.cloud ? CLOUDS[r.cloud].color : "var(--color-accent-cyan)";
              return (
                <div key={`${r.cloud}-${r.label}`} className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
                  <span
                    className="flex items-center gap-1.5 truncate text-xs text-[var(--color-text-secondary)]"
                    title={r.label}
                  >
                    {r.cloud && <span className="h-2 w-2 flex-none rounded-sm" style={{ background: col }} />}
                    {r.label}
                  </span>
                  <div className="h-5 overflow-hidden rounded bg-[var(--color-bg-tertiary)]">
                    <div className="h-full rounded" style={{ width: `${(r.cost / max) * 100}%`, background: col }} />
                  </div>
                  <span className="text-right font-mono text-xs font-semibold">{usd(r.cost)}</span>
                </div>
              );
            })}
            {barRows.length === 0 && (
              <p className="py-4 text-sm text-[var(--color-text-muted)]">No spend in this window.</p>
            )}
          </div>
          {/* table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="cost-breakdown-table">
              <thead>
                <tr>
                  <SortHead label={dimension} active={key === "label"} dir={dir} onClick={() => toggle("label")} />
                  <th className="border-b border-[var(--color-border)] py-1.5 px-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Detail
                  </th>
                  <SortHead
                    label="Cost"
                    active={key === "cost"}
                    dir={dir}
                    onClick={() => toggle("cost")}
                    align="right"
                  />
                  <th className="border-b border-[var(--color-border)] py-1.5 px-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 15).map((r) => (
                  <tr key={`${r.cloud}-${r.label}`} className="hover:bg-[var(--color-bg-tertiary)]">
                    <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-[var(--color-text-primary)]">
                      {r.cloud && (
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                          style={{ background: CLOUDS[r.cloud].color }}
                        />
                      )}
                      {r.label}
                      {/* Provisional is meaningful per-day (recent, unreconciled) — an aggregate
                          that merely touches the last 2 days isn't usefully "provisional". */}
                      {dimension === "day" && r.is_provisional && (
                        <span className="ml-1.5 rounded border border-[var(--color-accent-amber)]/50 px-1 text-[9px] font-bold uppercase text-[var(--color-accent-amber)]">
                          prov
                        </span>
                      )}
                    </td>
                    <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-[var(--color-text-tertiary)]">
                      {r.detail}
                    </td>
                    <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-right font-mono text-[var(--color-text-primary)]">
                      {usd(r.cost)}
                    </td>
                    <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-right font-mono text-[var(--color-text-tertiary)]">
                      {r.share_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- leaf tables ----------
function LeafTable({ title, hint, rows }: { title: string; hint: string; rows: CostBreakdownRow[] }) {
  const { sorted, key, dir, toggle } = useSort<CostBreakdownRow>(rows, "cost");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        <span className="text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <SortHead label="Name" active={key === "label"} dir={dir} onClick={() => toggle("label")} />
              <th className="border-b border-[var(--color-border)] py-1.5 px-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Type
              </th>
              <SortHead label="Cost" active={key === "cost"} dir={dir} onClick={() => toggle("cost")} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 8).map((r) => (
              <tr key={`${r.cloud}-${r.label}`} className="hover:bg-[var(--color-bg-tertiary)]">
                <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5">
                  {r.cloud && (
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                      style={{ background: CLOUDS[r.cloud].color }}
                    />
                  )}
                  <span className="font-mono text-[var(--color-text-primary)]">{r.label}</span>
                </td>
                <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-[var(--color-text-tertiary)]">
                  {r.detail}
                </td>
                <td className="border-b border-[var(--color-border-subtle)] py-1.5 px-2.5 text-right font-mono text-[var(--color-text-primary)]">
                  {usd(r.cost)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-[var(--color-text-muted)]">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ---------- github card ----------
function GithubCard({ rows }: { rows: CostBreakdownRow[] }) {
  const max = Math.max(...rows.map((r) => r.cost), 1);
  return (
    <Card className="border-dashed border-[var(--color-accent-purple)]/40">
      <CardHeader className="flex-row items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS.github.color }} />
        <CardTitle className="text-sm">GitHub billing</CardTitle>
        <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]">placeholder</span>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-3 flex items-center gap-2 rounded-md bg-[var(--color-accent-purple)]/10 p-2.5 text-xs text-[var(--color-text-secondary)]">
          <Lock className="h-3.5 w-3.5 flex-none text-[var(--color-accent-purple)]" />
          <span>
            <b className="text-[var(--color-text-primary)]">Dummy data.</b> GitHub billing needs a classic PAT with{" "}
            <span className="font-mono">user</span> scope (not yet issued). This wires to the real Enhanced Billing API
            once the token lands — layout and shape won&apos;t change.
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
              <span className="truncate text-xs text-[var(--color-text-secondary)]" title={r.label}>
                {r.label}
              </span>
              <div className="h-5 overflow-hidden rounded bg-[var(--color-bg-tertiary)]">
                <div
                  className="h-full rounded opacity-70"
                  style={{ width: `${(r.cost / max) * 100}%`, background: CLOUDS.github.color }}
                />
              </div>
              <span className="text-right font-mono text-xs font-semibold">{usd(r.cost)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== page ====================
export function CostObservability() {
  const [days, setDays] = useState<number>(30);
  const [cloud, setCloud] = useState<CloudFilter>("all");
  const [dimension, setDimension] = useState<CostDimension>("service");

  const [summary, setSummary] = useState<CostSummaryResponse | null>(null);
  const [ts, setTs] = useState<CostTimeseriesResponse | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdownResponse | null>(null);
  const [resources, setResources] = useState<CostBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCore = useCallback(
    async (force: boolean) => {
      const [s, t, res] = await Promise.all([
        fetchCostSummary(days, force),
        fetchCostTimeseries(days, cloud, force),
        fetchCostBreakdown("resource", cloud, days, force),
      ]);
      setSummary(s);
      setTs(t);
      setResources(res.rows);
    },
    [days, cloud],
  );
  const loadBreakdown = useCallback(
    async (force: boolean) => {
      setBreakdown(await fetchCostBreakdown(dimension, cloud, days, force));
    },
    [dimension, cloud, days],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([loadCore(false), loadBreakdown(false)])
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load cost data");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, cloud]);

  useEffect(() => {
    loadBreakdown(false).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load breakdown"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadCore(true), loadBreakdown(true)])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Refresh failed"))
      .finally(() => setRefreshing(false));
  }, [loadCore, loadBreakdown]);

  const activeClouds: CostCloud[] = cloud === "all" ? CLOUD_ORDER : [cloud];
  const vmRows = useMemo(() => resources.filter((r) => r.resource_kind === "vm"), [resources]);
  const bucketRows = useMemo(() => resources.filter((r) => r.resource_kind === "bucket"), [resources]);
  const githubRows = useMemo(
    () => (breakdown?.dimension === "service" ? breakdown.rows.filter((r) => r.cloud === "github") : []),
    [breakdown],
  );

  return (
    <main data-testid="cost-observability-page" className="mx-auto max-w-[1440px] space-y-4 px-4 py-6 lg:px-6">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[var(--color-accent-green)]" />
          <div>
            <h1 className="text-xl font-semibold">Cost Observability</h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">GCP · AWS · GitHub cloud spend</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={RANGES.map((r) => ({ value: r, label: `${r}d` }))}
            value={days}
            onChange={setDays}
            label="Time range"
          />
          <Segmented options={CLOUD_FILTERS} value={cloud} onChange={setCloud} label="Cloud filter" />
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} aria-label="Refresh cost data">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* provisional notice */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-accent-amber)]/30 bg-[var(--color-accent-amber)]/10 p-2.5 text-xs text-[var(--color-text-secondary)]">
        <AlertTriangle className="h-3.5 w-3.5 flex-none text-[var(--color-accent-amber)]" />
        <span>
          Recent days are <b className="text-[var(--color-text-primary)]">provisional</b> — GCP reconciles credits for
          ~2 days; AWS re-trues the current month on the 6th–7th. Data refreshes daily from the billing exports.
        </span>
        {summary && summary.provisional_days > 0 && (
          <span className="ml-auto font-mono text-[var(--color-accent-amber)]">
            {summary.provisional_days} provisional day{summary.provisional_days !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-3 text-sm text-[var(--color-accent-red)]"
        >
          <AlertTriangle className="h-4 w-4 flex-none" />
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div role="status" aria-label="Loading cost data" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-[var(--color-bg-secondary)]" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-lg bg-[var(--color-bg-secondary)]" />
        </div>
      ) : (
        summary && (
          <>
            <KpiBand summary={summary} cloud={cloud} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">{ts && <TrendCard ts={ts} clouds={activeClouds} />}</div>
              <div>
                <DonutCard summary={summary} clouds={activeClouds} />
              </div>
            </div>
            {breakdown && <BreakdownCard dimension={dimension} onDimension={setDimension} data={breakdown} />}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LeafTable title="Top compute instances" hint="GCE + EC2" rows={vmRows} />
              <LeafTable title="Top storage buckets" hint="GCS + S3" rows={bucketRows} />
            </div>
            {(cloud === "all" || cloud === "github") && githubRows.length > 0 && <GithubCard rows={githubRows} />}
          </>
        )
      )}
    </main>
  );
}
