import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Database, DollarSign, Lock, RefreshCw } from "lucide-react";
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
  type CostTimeseriesPoint,
  type CostTimeseriesResponse,
} from "../api/deploymentApi";

// Cloud identity — the app's own accent tokens (theme-aware, CVD-validated categorical trio:
// GCP blue / AWS amber / GitHub purple), deliberately distinct from the cyan UI-chrome accent
// which stays reserved from the data (dataviz rule).
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
  { value: "sku", label: "By SKU" },
];
const DIM_NOTE: Record<CostDimension, string> = {
  service: "Google / AWS service · GitHub product",
  resource: "individual VMs, buckets & build workers",
  bucket: "GCS + S3 · cost split into storage / operations / egress",
  region: "billing location",
  day: "daily totals across selected clouds",
  sku: "Google/AWS SKU",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function usdShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${n.toFixed(0)}`;
}
// Bucket storage is already backend-derived to GB (never bytes) — format with thousands
// separators only, no unit-magnitude conversion (so the label stays legible as "GB").
function formatGb(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 })} GB`;
}
function costPerGb(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}/GB`;
}
function storageClassSplit(classes: Record<string, number>): string {
  return Object.entries(classes)
    .filter(([, gb]) => gb > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cls, gb]) => `${cls} ${formatGb(gb)}`)
    .join(" · ");
}
// VM rows only — machine_type is "" when unset (AWS has no system_labels equivalent).
function formatMachine(r: CostBreakdownRow): string {
  if (!r.machine_type) return "—";
  const specs = [r.vcpu != null ? `${r.vcpu} vCPU` : null, r.memory_gb != null ? `${r.memory_gb} GB` : null].filter(
    Boolean,
  );
  return specs.length ? `${r.machine_type} · ${specs.join(" · ")}` : r.machine_type;
}
const WASTE_LABEL: Record<string, string> = {
  idle_static_ip: "idle IP",
  idle_elastic_ip: "idle IP",
  orphaned_disk: "orphaned",
};
// Resource rows only — a row IS the idle/orphaned resource, and its own GROSS cost is the waste
// amount: what the idle thing actually costs, pre-credit. NET can round to ~$0 when a promo credit
// masks it (an idle IP is ~$2/mo gross, fully credited today), which would read as "not waste" —
// the gross is the honest "what you'd save / will pay when the promo ends". Shared by the breakdown
// table's resource column and the leaf "Top compute instances" table so both render waste identically.
function WasteCell({ r }: { r: CostBreakdownRow }) {
  if (!r.is_idle) return <span className="text-[var(--color-text-tertiary)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded border px-1 text-[9px] font-bold uppercase ${
          r.waste_kind === "orphaned_disk"
            ? "border-[var(--color-accent-red)]/50 text-[var(--color-accent-red)]"
            : "border-[var(--color-accent-amber)]/50 text-[var(--color-accent-amber)]"
        }`}
      >
        {WASTE_LABEL[r.waste_kind ?? ""] ?? "waste"}
      </span>
      <span className="font-mono text-[var(--color-text-primary)]">{usd(r.gross)}</span>
    </span>
  );
}
// Bucket cost-component cell (storage / operations / egress / other $). A component is present
// only when it rounds to non-zero, so an absent one dashes rather than showing a false $0.00.
function CompCell({ v, testId }: { v: number | undefined; testId: string }) {
  return (
    <td
      data-testid={testId}
      className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]"
    >
      {v != null ? usd(v) : <span className="text-[var(--color-text-muted)]">—</span>}
    </td>
  );
}
function isoParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}
function shortDate(iso: string): string {
  const { m, d } = isoParts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}
function prettyDate(iso: string): string {
  const { y, m, d } = isoParts(iso);
  const wd = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[wd]}, ${MONTHS[m - 1]} ${d}`;
}

// ---------- panel primitives (mockup density: tighter than the app's airy Card p-6) ----------
function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] shadow ${className}`}
    >
      {children}
    </section>
  );
}
function PanelHeader({
  title,
  hint,
  icon,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3.5">
      {icon}
      <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {hint != null && <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>}
    </div>
  );
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
      className="inline-flex items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            // Mock-faithful segmented control (`.seg` in cost-observability-mockup.html): flush pills
            // in a 2px-padded track — the separation is the filled accent active pill, NOT a gap
            // between buttons. Hover brightens the text only (no grey box), matching the mock.
            className={`rounded-md px-[11px] py-[5px] text-[12.5px] font-medium transition-colors ${
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

// ---------- delta chip (up = more spend = worse/red; down = less = good/green) ----------
function Delta({ pct }: { pct: number | null }) {
  if (pct === null || !isFinite(pct)) return <span className="text-[var(--color-text-muted)]">—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
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

// ---------- net → (gross − credits) derivation ----------
// The headline number is NET — what actually gets invoiced. When credits apply (GCP promotions /
// CUD / SUD), show how it's derived so the subsidy is visible: net = gross − credits. This
// doubles as a run-rate signal — when promo credits run out, net rises toward gross. Clouds with
// no credits (AWS / GitHub) render nothing. `credit` is ≤ 0; we show its magnitude after the minus.
function GrossCredit({
  gross,
  credit,
  compact = false,
  testId,
}: {
  gross: number;
  credit: number;
  compact?: boolean;
  testId?: string;
}) {
  if (!(credit < 0)) return null;
  return (
    <div
      data-testid={testId}
      className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--color-text-tertiary)]"
    >
      <span className="font-mono">({usd(gross)}</span>
      {!compact && <span>gross</span>}
      <span aria-hidden="true">−</span>
      <span className="font-mono text-[var(--color-accent-green)]">{usd(Math.abs(credit))}</span>
      <span>credits)</span>
    </div>
  );
}

// ---------- sparkline (KPI corner flourish) ----------
function Sparkline({ data, color, w = 92, h = 30 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  // Anchor to a $0 baseline (magnitude-from-zero), NOT to the series min: a near-flat
  // series (e.g. GitHub ~$9.7/day) must read flat, not as a full-height zig-zag that
  // amplifies cents of noise into fake volatility. Real spikes (GCP) still tower.
  const max = Math.max(...data, 0);
  const pad = 2;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
      const y = h - pad - (max > 0 ? v / max : 0) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = pts.split(" ").slice(-1)[0].split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="opacity-80">
      <polyline
        points={pts}
        fill="none"
        style={{ stroke: color }}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" style={{ fill: color }} />
    </svg>
  );
}

// ---------- KPI band ----------
function KpiBand({ summary, cloud }: { summary: CostSummaryResponse; cloud: CloudFilter }) {
  const byCloud = new Map(summary.clouds.map((c) => [c.cloud, c]));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
      {/* total */}
      <Panel className="relative overflow-hidden">
        <div className="p-4">
          <div className="text-xs text-[var(--color-text-secondary)]">Total spend · last {summary.days} days</div>
          <div data-testid="cost-total" className="mt-2 font-mono text-[34px] font-bold leading-none tracking-tight">
            {usd(summary.total)}
          </div>
          <GrossCredit gross={summary.gross} credit={summary.credit} testId="cost-total-breakdown" />
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
            <Delta pct={summary.delta_pct} />
            <span>vs prior {summary.days}d</span>
            <span className="font-mono text-[var(--color-text-tertiary)]">≈ {usd(summary.run_rate_daily)}/day</span>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3">
          <Sparkline
            data={summary.dates.length ? mergeDaily(summary) : [0, 0]}
            color="var(--color-accent)"
            w={132}
            h={34}
          />
        </div>
      </Panel>
      {CLOUD_ORDER.map((c) => {
        const cs: CloudSummary = byCloud.get(c) ?? {
          cloud: c,
          total: 0,
          gross: 0,
          credit: 0,
          delta_pct: null,
          daily: [],
          is_placeholder: false,
        };
        const dim = cloud !== "all" && cloud !== c ? "opacity-40" : "";
        const share = summary.total ? ((cs.total / summary.total) * 100).toFixed(1) : "0.0";
        return (
          <Panel key={c} className={`relative overflow-hidden ${dim}`}>
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS[c].color }} />
                {CLOUDS[c].label}
                {cs.is_placeholder && (
                  <span className="rounded border border-[var(--color-accent-purple)]/50 px-1 text-[9px] font-bold uppercase tracking-wide text-[var(--color-accent-purple)]">
                    mock
                  </span>
                )}
              </div>
              <div className="mt-2 font-mono text-2xl font-bold leading-none tracking-tight">{usd(cs.total)}</div>
              <GrossCredit gross={cs.gross} credit={cs.credit} compact testId={`cost-cloud-breakdown-${c}`} />
              <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                <Delta pct={cs.delta_pct} />
                <span className="font-mono">{share}% of total</span>
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 right-3">
              <Sparkline data={cs.daily.length ? cs.daily : [0, 0]} color={CLOUDS[c].color} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
function mergeDaily(summary: CostSummaryResponse): number[] {
  const n = summary.dates.length;
  const out = new Array(n).fill(0) as number[];
  for (const c of summary.clouds) {
    for (let i = 0; i < n; i++) out[i] += c.daily[i] ?? 0;
  }
  return out;
}

// ---------- floating chart tooltip ----------
function ChartTooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  const flip = typeof window !== "undefined" && x > window.innerWidth * 0.62;
  return (
    <div
      role="status"
      className="pointer-events-none fixed z-50 max-w-[260px] rounded-md border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-xs shadow-xl"
      style={{ left: x, top: y, transform: flip ? "translate(-110%, 14px)" : "translate(14px, 14px)" }}
    >
      {children}
    </div>
  );
}

// ---------- stacked-area trend (custom SVG, crisp via ResizeObserver — no glyph stretch) ----------
function TrendPanel({
  points,
  clouds,
  provisionalDays,
  rangeDays,
}: {
  points: CostTimeseriesPoint[];
  clouds: CostCloud[];
  provisionalDays: number;
  rangeDays: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.max(320, Math.floor(cw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const padL = 46;
  const padR = 14;
  const padT = 12;
  const padB = 26;
  const iw = w - padL - padR;
  const ih = H - padT - padB;
  const n = points.length;

  const stacks = points.map((p) => {
    let acc = 0;
    const col = {} as Record<CostCloud, [number, number]>;
    for (const c of clouds) {
      const v = p.values[c] ?? 0;
      col[c] = [acc, acc + v];
      acc += v;
    }
    return { col, total: acc };
  });
  const maxY = Math.max(...stacks.map((s) => s.total), 1) * 1.08;
  const X = (i: number) => (n <= 1 ? padL + iw / 2 : padL + (i / (n - 1)) * iw);
  const Y = (v: number) => padT + ih - (v / maxY) * ih;

  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, g) => (maxY / ticks) * g);
  const xStep = Math.max(1, Math.floor(n / 6));

  const totalOfActive = stacks.reduce((s, st) => s + st.total, 0);

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const r = svg.getBoundingClientRect();
    const vbX = ((e.clientX - r.left) / r.width) * w;
    let i = Math.round(((vbX - padL) / iw) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setHover({ i, x: e.clientX, y: e.clientY });
  };

  // trailing unreconciled days → faint provisional band so the honest low/zero tail
  // reads as "not yet reported", not "spend crashed".
  const provFromX = provisionalDays > 0 && n > provisionalDays ? X(n - provisionalDays - 0.5) : null;

  return (
    <Panel>
      <PanelHeader title="Daily spend by cloud" hint={`stacked · ${n} day${n === 1 ? "" : "s"} · USD/day`} />
      <div className="p-4 pt-3">
        <div ref={wrapRef} className="relative w-full" data-testid="cost-trend-chart">
          {totalOfActive <= 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-[var(--color-text-muted)]">
              No spend in this window.
            </div>
          ) : (
            <svg
              ref={svgRef}
              width="100%"
              height={H}
              viewBox={`0 0 ${w} ${H}`}
              style={{ display: "block" }}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              {/* gridlines + Y labels */}
              {gridVals.map((val, gi) => (
                <g key={gi}>
                  <line
                    x1={padL}
                    y1={Y(val)}
                    x2={w - padR}
                    y2={Y(val)}
                    style={{ stroke: "var(--color-border-subtle)" }}
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 8}
                    y={Y(val) + 3.5}
                    textAnchor="end"
                    className="font-mono"
                    style={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  >
                    {usdShort(val)}
                  </text>
                </g>
              ))}
              {/* provisional band */}
              {provFromX != null && (
                <rect
                  x={provFromX}
                  y={padT}
                  width={w - padR - provFromX}
                  height={ih}
                  style={{ fill: "var(--color-accent-amber)", fillOpacity: 0.07 }}
                />
              )}
              {/* stacked areas */}
              {clouds.map((c) => {
                const top = stacks.map((s, i) => `${X(i).toFixed(1)},${Y(s.col[c][1]).toFixed(1)}`);
                const bottom = stacks.map((s, i) => `${X(i).toFixed(1)},${Y(s.col[c][0]).toFixed(1)}`).reverse();
                return (
                  <g key={c}>
                    <polygon
                      points={top.concat(bottom).join(" ")}
                      style={{ fill: CLOUDS[c].color, fillOpacity: 0.2 }}
                    />
                    <polyline
                      points={top.join(" ")}
                      fill="none"
                      style={{ stroke: CLOUDS[c].color }}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </g>
                );
              })}
              {/* x labels */}
              {points.map((p, i) =>
                i % xStep === 0 || i === n - 1 ? (
                  <text
                    key={p.date}
                    x={X(i)}
                    y={H - 8}
                    textAnchor="middle"
                    style={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  >
                    {shortDate(p.date)}
                  </text>
                ) : null,
              )}
              {/* crosshair */}
              {hover && (
                <line
                  x1={X(hover.i)}
                  y1={padT}
                  x2={X(hover.i)}
                  y2={padT + ih}
                  style={{ stroke: "var(--color-border-emphasis)" }}
                  strokeWidth={1}
                />
              )}
            </svg>
          )}
          {hover && points[hover.i] && (
            <ChartTooltip x={hover.x} y={hover.y}>
              <div className="mb-1 font-semibold text-[var(--color-text-primary)]">
                {prettyDate(points[hover.i].date)}
              </div>
              {clouds.map((c) => (
                <div key={c} className="flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <span className="h-2 w-2 rounded-sm" style={{ background: CLOUDS[c].color }} />
                  {CLOUDS[c].label}
                  <span className="ml-auto font-mono font-semibold text-[var(--color-text-primary)]">
                    {usd(points[hover.i].values[c] ?? 0)}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-2 border-t border-[var(--color-border-default)] pt-1 text-[var(--color-text-secondary)]">
                Total
                <span className="ml-auto font-mono font-semibold text-[var(--color-text-primary)]">
                  {usd(clouds.reduce((s, c) => s + (points[hover.i].values[c] ?? 0), 0))}
                </span>
              </div>
            </ChartTooltip>
          )}
        </div>
        {/* legend */}
        <div className="mt-3 flex flex-wrap gap-4">
          {clouds.map((c) => {
            const tot = points.reduce((s, p) => s + (p.values[c] ?? 0), 0);
            return (
              <span key={c} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS[c].color }} />
                {CLOUDS[c].label}
                <span className="font-mono font-semibold text-[var(--color-text-primary)]">{usd(tot)}</span>
              </span>
            );
          })}
          {provisionalDays > 0 && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
              <span
                className="h-2.5 w-4 rounded-sm"
                style={{ background: "var(--color-accent-amber)", opacity: 0.25 }}
              />
              provisional ({provisionalDays}d) · {rangeDays}d window
            </span>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ---------- donut (cloud share) ----------
function DonutPanel({ summary, clouds }: { summary: CostSummaryResponse; clouds: CostCloud[] }) {
  const [hover, setHover] = useState<{ c: CostCloud; x: number; y: number } | null>(null);
  const data = clouds
    .map((c) => ({ cloud: c, value: summary.clouds.find((x) => x.cloud === c)?.total ?? 0 }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  const R = 62;
  const r = 42;
  const cx = 70;
  const cy = 70;
  const TAU = Math.PI * 2;
  let ang = -Math.PI / 2;
  const segs = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const a2 = ang + frac * TAU;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + R * Math.cos(ang);
    const y1 = cy + R * Math.sin(ang);
    const x2 = cx + R * Math.cos(a2);
    const y2 = cy + R * Math.sin(a2);
    const xi2 = cx + r * Math.cos(a2);
    const yi2 = cy + r * Math.sin(a2);
    const xi1 = cx + r * Math.cos(ang);
    const yi1 = cy + r * Math.sin(ang);
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`;
    ang = a2;
    return { cloud: d.cloud, value: d.value, frac, path };
  });

  return (
    <Panel>
      <PanelHeader title="Cloud share" hint="of total" />
      <div className="p-4">
        <div className="flex items-center gap-5">
          <div className="relative flex-none" style={{ width: 140, height: 140 }}>
            <svg width={140} height={140} viewBox="0 0 140 140">
              {segs.map((s) => (
                <path
                  key={s.cloud}
                  d={s.path}
                  style={{ fill: CLOUDS[s.cloud].color, cursor: "pointer" }}
                  stroke="var(--color-bg-secondary)"
                  strokeWidth={2}
                  onMouseMove={(e) => setHover({ c: s.cloud, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </svg>
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
                  {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            ))}
            {data.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">No spend in window.</span>}
          </div>
        </div>
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div className="mb-1 font-semibold text-[var(--color-text-primary)]">{CLOUDS[hover.c].label}</div>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <span className="h-2 w-2 rounded-sm" style={{ background: CLOUDS[hover.c].color }} />
            {usd(summary.clouds.find((x) => x.cloud === hover.c)?.total ?? 0)}
            <span className="ml-auto font-mono font-semibold text-[var(--color-text-primary)]">
              {total > 0
                ? (((summary.clouds.find((x) => x.cloud === hover.c)?.total ?? 0) / total) * 100).toFixed(1)
                : "0.0"}
              %
            </span>
          </div>
        </ChartTooltip>
      )}
    </Panel>
  );
}

// ---------- sortable helper ----------
// EVERY breakdown/leaf column is sortable. A column maps to a string sort key — either a real
// CostBreakdownRow field, or a VIRTUAL key for a derived column: "storage_class" sorts by the
// rendered class-split string; "waste" sorts by the waste amount (an idle row's gross), non-idle
// rows sinking to -1. `sortValue` resolves a key to a comparable value so one comparator serves
// both tables; missing numeric values sink via -1 so populated rows lead on a descending sort.
type SortDir = "asc" | "desc";
function sortValue(r: CostBreakdownRow, key: string): number | string {
  switch (key) {
    case "detail":
      return r.detail;
    case "purchase_option":
      return r.purchase_option ?? "";
    case "machine_type":
      return r.machine_type ?? "";
    case "storage_gb":
      return r.storage_gb ?? -1;
    case "storage_class":
      return r.storage_class_gb ? storageClassSplit(r.storage_class_gb) : "";
    case "cost_per_gb":
      return r.cost_per_gb ?? -1;
    case "comp_storage":
      return r.cost_by_component?.storage ?? -1;
    case "comp_operations":
      return r.cost_by_component?.operations ?? -1;
    case "comp_egress":
      return r.cost_by_component?.egress ?? -1;
    case "comp_other":
      return r.cost_by_component?.other ?? -1;
    case "waste":
      return r.is_idle ? r.gross : -1;
    case "gross":
      return r.gross;
    case "credit":
      return r.credit;
    case "share_pct":
      return r.share_pct;
    case "label":
      return r.label;
    case "cost":
    default:
      return r.cost;
  }
}
function useSort(rows: CostBreakdownRow[], initialKey: string, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<string>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = sortValue(a, key);
      const bv = sortValue(b, key);
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, key, dir]);
  const toggle = useCallback(
    (k: string) => {
      if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setKey(k);
        // Default direction on a fresh column: numeric → desc (biggest first), text → asc (A→Z).
        setDir(typeof (rows[0] ? sortValue(rows[0], k) : "") === "number" ? "desc" : "asc");
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
  sticky = false,
  testId,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  sticky?: boolean;
  testId?: string;
}) {
  return (
    <th
      onClick={onClick}
      data-testid={testId}
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
      // `sticky` keeps the header visible while a long breakdown (up to 90 daily rows) scrolls
      // inside its max-height container; the opaque panel bg hides rows sliding underneath.
      className={`cursor-pointer select-none whitespace-nowrap border-b border-[var(--color-border-default)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] ${
        sticky ? "sticky top-0 z-10 bg-[var(--color-bg-secondary)]" : ""
      } ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label}
      {active && <span className="ml-1 text-[9px] opacity-60">{dir === "desc" ? "▼" : "▲"}</span>}
    </th>
  );
}

// ---------- breakdown (single sortable table, bar-in-cell) ----------
function BreakdownPanel({
  dimension,
  onDimension,
  data,
  stale,
}: {
  dimension: CostDimension;
  onDimension: (d: CostDimension) => void;
  data: CostBreakdownResponse;
  // True while `data` is still the PRIOR fetch's response (dimension/cloud/range just changed and
  // the new request hasn't resolved yet) — gates the body so the old rows never render under the
  // new column header. See CostObservability() `breakdownFresh`.
  stale: boolean;
}) {
  const { sorted, key, dir, toggle } = useSort(data.rows, "cost");
  const max = Math.max(...data.rows.map((r) => r.cost), 1);
  const dimLabel = DIMENSIONS.find((d) => d.value === dimension)?.label.replace("By ", "") ?? dimension;
  // Gross/credit columns mirror the KPI band's net-primary treatment down into the table, but only
  // when something in the current view actually carries a credit (GCP) — an AWS/GitHub-only filter
  // would otherwise show two columns of "—" for no reason.
  const hasCredits = data.rows.some((r) => r.credit < 0);
  // Bucket rows carry a net cost split {storage, operations, egress[, other]}. "Other" is rare
  // (retrieval/misc) — show its column only when something in view actually has it, so the split
  // always reconciles to Cost without a permanent all-dash column (mirrors the hasCredits pattern).
  const hasOther = data.rows.some((r) => (r.cost_by_component?.other ?? 0) !== 0);
  // Spot/on-demand only applies to compute SKUs — the backend folds it onto resource + service
  // rows (spot wins if any underlying line is spot-priced); other dimensions never carry it.
  const showPurchase = dimension === "resource" || dimension === "service";
  const colCount =
    4 +
    (dimension === "bucket" ? 6 + (hasOther ? 1 : 0) : 0) +
    (dimension === "resource" ? 2 : 0) +
    (hasCredits ? 2 : 0) +
    (showPurchase ? 1 : 0);
  return (
    <Panel>
      <PanelHeader
        title="Breakdown"
        hint={`${data.cloud === "all" ? "all clouds" : CLOUDS[data.cloud as CostCloud]?.label} · ${data.days}d · ${usd(
          data.total,
        )} · ${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"}`}
      />
      <div className="p-4 pt-3">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented options={DIMENSIONS} value={dimension} onChange={onDimension} label="Breakdown dimension" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {DIM_NOTE[dimension]}
          </span>
        </div>
        {/* single table — every row the backend returned (up to 90 daily / 50 grouped), inside a
            fixed-height scroll region. The Cost column carries an inline proportional bar (width =
            cost / max across the full dataset) instead of a separate top-12 bar chart, freeing
            horizontal space for detail columns and removing the label+cost duplication. */}
        {/* tabIndex + role make the scroll region keyboard-reachable (axe scrollable-region-focusable) */}
        <div
          className="max-h-[400px] overflow-auto"
          data-testid="cost-breakdown-scroll"
          role="region"
          aria-label="Cost breakdown table, scrollable"
          tabIndex={0}
        >
          <table className="w-full text-xs" data-testid="cost-breakdown-table">
            <thead>
              <tr>
                <SortHead label={dimLabel} active={key === "label"} dir={dir} onClick={() => toggle("label")} sticky />
                <SortHead label="Detail" active={key === "detail"} dir={dir} onClick={() => toggle("detail")} sticky />
                {showPurchase && (
                  <SortHead
                    label="Purchase"
                    active={key === "purchase_option"}
                    dir={dir}
                    onClick={() => toggle("purchase_option")}
                    sticky
                    testId="cost-col-purchase"
                  />
                )}
                {dimension === "bucket" && (
                  <>
                    <SortHead
                      label="Storage"
                      active={key === "storage_gb"}
                      dir={dir}
                      onClick={() => toggle("storage_gb")}
                      align="right"
                      sticky
                    />
                    <SortHead
                      label="Storage class"
                      active={key === "storage_class"}
                      dir={dir}
                      onClick={() => toggle("storage_class")}
                      sticky
                    />
                    <SortHead
                      label="$/GB"
                      active={key === "cost_per_gb"}
                      dir={dir}
                      onClick={() => toggle("cost_per_gb")}
                      align="right"
                      sticky
                    />
                    <SortHead
                      label="Storage $"
                      active={key === "comp_storage"}
                      dir={dir}
                      onClick={() => toggle("comp_storage")}
                      align="right"
                      sticky
                    />
                    <SortHead
                      label="Ops $"
                      active={key === "comp_operations"}
                      dir={dir}
                      onClick={() => toggle("comp_operations")}
                      align="right"
                      sticky
                    />
                    <SortHead
                      label="Egress $"
                      active={key === "comp_egress"}
                      dir={dir}
                      onClick={() => toggle("comp_egress")}
                      align="right"
                      sticky
                    />
                    {hasOther && (
                      <SortHead
                        label="Other $"
                        active={key === "comp_other"}
                        dir={dir}
                        onClick={() => toggle("comp_other")}
                        align="right"
                        sticky
                      />
                    )}
                  </>
                )}
                {dimension === "resource" && (
                  <>
                    <SortHead
                      label="Machine"
                      active={key === "machine_type"}
                      dir={dir}
                      onClick={() => toggle("machine_type")}
                      sticky
                    />
                    <SortHead
                      label="Waste"
                      active={key === "waste"}
                      dir={dir}
                      onClick={() => toggle("waste")}
                      align="right"
                      sticky
                    />
                  </>
                )}
                <SortHead
                  label="Cost"
                  active={key === "cost"}
                  dir={dir}
                  onClick={() => toggle("cost")}
                  align="right"
                  sticky
                />
                {hasCredits && (
                  <SortHead
                    label="Gross"
                    active={key === "gross"}
                    dir={dir}
                    onClick={() => toggle("gross")}
                    align="right"
                    sticky
                    testId="cost-col-gross"
                  />
                )}
                {hasCredits && (
                  <SortHead
                    label="Credit"
                    active={key === "credit"}
                    dir={dir}
                    onClick={() => toggle("credit")}
                    align="right"
                    sticky
                    testId="cost-col-credit"
                  />
                )}
                <SortHead
                  label="Share"
                  active={key === "share_pct"}
                  dir={dir}
                  onClick={() => toggle("share_pct")}
                  align="right"
                  sticky
                />
              </tr>
            </thead>
            <tbody>
              {stale && (
                <tr>
                  <td
                    colSpan={colCount}
                    className="py-4 text-center text-[var(--color-text-muted)]"
                    data-testid="cost-breakdown-loading"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!stale &&
                sorted.map((r) => {
                  const col = r.cloud ? CLOUDS[r.cloud].color : "var(--color-accent-cyan)";
                  return (
                    <tr key={`${r.cloud}-${r.label}`} className="hover:bg-[var(--color-bg-tertiary)]">
                      <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-primary)]">
                        {r.cloud && (
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                            style={{ background: CLOUDS[r.cloud].color }}
                          />
                        )}
                        {r.label}
                        {/* provisional is meaningful per-day (recent, unreconciled); an aggregate that
                          merely touches the last days isn't usefully "provisional". */}
                        {dimension === "day" && r.is_provisional && (
                          <span className="ml-1.5 rounded border border-[var(--color-accent-amber)]/50 px-1 text-[9px] font-bold uppercase text-[var(--color-accent-amber)]">
                            prov
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]">
                        {r.detail}
                      </td>
                      {showPurchase && (
                        <td
                          className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px]"
                          data-testid="cost-row-purchase"
                        >
                          {r.purchase_option === "spot" ? (
                            <span className="rounded border border-[var(--color-accent-green)]/50 px-1 text-[9px] font-bold uppercase tracking-wide text-[var(--color-accent-green)]">
                              spot
                            </span>
                          ) : r.purchase_option === "on-demand" ? (
                            <span className="text-[var(--color-text-tertiary)]">on-demand</span>
                          ) : (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          )}
                        </td>
                      )}
                      {dimension === "bucket" && (
                        <>
                          <td
                            className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-primary)]"
                            data-testid="cost-bucket-storage-gb"
                          >
                            {r.storage_gb != null ? formatGb(r.storage_gb) : "—"}
                          </td>
                          <td
                            className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]"
                            data-testid="cost-bucket-storage-class"
                          >
                            {r.storage_class_gb ? storageClassSplit(r.storage_class_gb) : "—"}
                          </td>
                          <td
                            className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]"
                            data-testid="cost-bucket-cost-per-gb"
                          >
                            {r.cost_per_gb != null ? costPerGb(r.cost_per_gb) : "—"}
                          </td>
                          <CompCell v={r.cost_by_component?.storage} testId="cost-bucket-comp-storage" />
                          <CompCell v={r.cost_by_component?.operations} testId="cost-bucket-comp-operations" />
                          <CompCell v={r.cost_by_component?.egress} testId="cost-bucket-comp-egress" />
                          {hasOther && <CompCell v={r.cost_by_component?.other} testId="cost-bucket-comp-other" />}
                        </>
                      )}
                      {dimension === "resource" && (
                        <>
                          <td
                            className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]"
                            data-testid="cost-resource-machine"
                          >
                            {formatMachine(r)}
                          </td>
                          <td
                            className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right"
                            data-testid="cost-resource-waste"
                          >
                            <WasteCell r={r} />
                          </td>
                        </>
                      )}
                      <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px]">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="relative h-[18px] w-24 shrink-0 overflow-hidden rounded-sm bg-[var(--color-bg-tertiary)]"
                            data-testid="cost-bar-track"
                          >
                            <div
                              className="h-full rounded-sm transition-[width] duration-500"
                              style={{ width: `${(r.cost / max) * 100}%`, background: col, minWidth: 2 }}
                              data-testid="cost-bar-fill"
                            />
                          </div>
                          <span className="w-[74px] text-right font-mono font-semibold text-[var(--color-text-primary)]">
                            {usd(r.cost)}
                          </span>
                        </div>
                      </td>
                      {hasCredits && (
                        <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                          {usd(r.gross)}
                        </td>
                      )}
                      {hasCredits && (
                        <td
                          className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-accent-green)]"
                          data-testid="cost-row-credit"
                        >
                          {r.credit < 0 ? `−${usd(Math.abs(r.credit))}` : "—"}
                        </td>
                      )}
                      <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                        {r.share_pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              {!stale && sorted.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-4 text-center text-[var(--color-text-muted)]">
                    No spend in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

// ---------- leaf tables (top VMs / buckets) ----------
// Dimension-aware: these are each pinned to one resource_kind (their "natural home"), so they
// carry the SAME detail columns as the breakdown table's resource/bucket dimension views
// (same helpers, same data-testids) rather than inventing a parallel column set.
function LeafPanel({
  title,
  hint,
  rows,
  kind,
}: {
  title: string;
  hint: string;
  rows: CostBreakdownRow[];
  kind: "vm" | "bucket";
}) {
  const { sorted, key, dir, toggle } = useSort(rows, "cost");
  const colCount = 3 + (kind === "vm" ? 2 : 3);
  return (
    <Panel>
      <PanelHeader title={title} hint={hint} />
      {/* horizontal scroll on narrow widths — the detail columns push past the card width there */}
      {/* tabIndex + role make the scroll region keyboard-reachable (axe scrollable-region-focusable) */}
      <div
        className="overflow-x-auto p-4 pt-3"
        data-testid={`leaf-${kind}-scroll`}
        role="region"
        aria-label={`${title}, scrollable`}
        tabIndex={0}
      >
        <table className="w-full text-xs" data-testid={`leaf-${kind}-table`}>
          <thead>
            <tr>
              <SortHead label="Name" active={key === "label"} dir={dir} onClick={() => toggle("label")} />
              <SortHead label="Type" active={key === "detail"} dir={dir} onClick={() => toggle("detail")} />
              {kind === "vm" && (
                <SortHead
                  label="Machine"
                  active={key === "machine_type"}
                  dir={dir}
                  onClick={() => toggle("machine_type")}
                />
              )}
              {kind === "vm" && (
                <SortHead
                  label="Waste"
                  active={key === "waste"}
                  dir={dir}
                  onClick={() => toggle("waste")}
                  align="right"
                />
              )}
              {kind === "bucket" && (
                <SortHead
                  label="Storage"
                  active={key === "storage_gb"}
                  dir={dir}
                  onClick={() => toggle("storage_gb")}
                  align="right"
                />
              )}
              {kind === "bucket" && (
                <SortHead
                  label="Storage class"
                  active={key === "storage_class"}
                  dir={dir}
                  onClick={() => toggle("storage_class")}
                />
              )}
              {kind === "bucket" && (
                <SortHead
                  label="$/GB"
                  active={key === "cost_per_gb"}
                  dir={dir}
                  onClick={() => toggle("cost_per_gb")}
                  align="right"
                />
              )}
              <SortHead label="Cost" active={key === "cost"} dir={dir} onClick={() => toggle("cost")} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 8).map((r) => (
              <tr key={`${r.cloud}-${r.label}`} className="hover:bg-[var(--color-bg-tertiary)]">
                <td className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px]">
                  {r.cloud && (
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                      style={{ background: CLOUDS[r.cloud].color }}
                    />
                  )}
                  <span className="font-mono text-[var(--color-text-primary)]">{r.label}</span>
                </td>
                <td className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]">
                  {r.detail}
                </td>
                {kind === "vm" && (
                  <td
                    className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]"
                    data-testid="cost-resource-machine"
                  >
                    {formatMachine(r)}
                  </td>
                )}
                {kind === "vm" && (
                  <td
                    className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right"
                    data-testid="cost-resource-waste"
                  >
                    <WasteCell r={r} />
                  </td>
                )}
                {kind === "bucket" && (
                  <td
                    className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-primary)]"
                    data-testid="cost-bucket-storage-gb"
                  >
                    {r.storage_gb != null ? formatGb(r.storage_gb) : "—"}
                  </td>
                )}
                {kind === "bucket" && (
                  <td
                    className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-[var(--color-text-tertiary)]"
                    data-testid="cost-bucket-storage-class"
                  >
                    {r.storage_class_gb ? storageClassSplit(r.storage_class_gb) : "—"}
                  </td>
                )}
                {kind === "bucket" && (
                  <td
                    className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]"
                    data-testid="cost-bucket-cost-per-gb"
                  >
                    {r.cost_per_gb != null ? costPerGb(r.cost_per_gb) : "—"}
                  </td>
                )}
                <td className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-primary)]">
                  {usd(r.cost)}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-4 text-center text-[var(--color-text-muted)]">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------- github placeholder ----------
function GithubPanel({ rows }: { rows: CostBreakdownRow[] }) {
  const max = Math.max(...rows.map((r) => r.cost), 1);
  return (
    <Panel className="border-dashed border-[var(--color-accent-purple)]/40">
      <PanelHeader
        title="GitHub billing"
        icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS.github.color }} />}
        hint="placeholder"
      />
      <div className="p-4 pt-3">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              By product (dummy)
            </div>
            <div className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <div key={r.label} className="grid grid-cols-[150px_1fr_auto] items-center gap-3">
                  <span className="truncate text-xs text-[var(--color-text-secondary)]" title={r.label}>
                    {r.label}
                  </span>
                  <div className="h-[22px] overflow-hidden rounded-md bg-[var(--color-bg-tertiary)]">
                    <div
                      className="h-full rounded-md opacity-70"
                      style={{ width: `${(r.cost / max) * 100}%`, background: CLOUDS.github.color, minWidth: 2 }}
                    />
                  </div>
                  <span className="text-right font-mono text-xs font-semibold text-[var(--color-text-primary)]">
                    {usd(r.cost)}
                  </span>
                </div>
              ))}
              {rows.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No GitHub products.</p>}
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-[var(--color-accent-purple)]/10 p-3 text-xs text-[var(--color-text-secondary)]">
            <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-[var(--color-accent-purple)]" />
            <span>
              <b className="text-[var(--color-text-primary)]">Dummy data.</b> Org/user billing (and repo-level Actions
              minutes) needs a classic PAT with <span className="font-mono">user</span> scope — not yet issued. This
              panel wires to the real Enhanced Billing API the moment the token lands; the layout and shape won&apos;t
              change.
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---------- source-attribution footer ----------
function SourceFooter({ generatedAt }: { generatedAt: string | undefined }) {
  const sources: { cloud: CostCloud; label: string; code: string }[] = [
    { cloud: "gcp", label: "GCP — BigQuery", code: "billing_export.gcp_billing_export_resource_v1" },
    { cloud: "aws", label: "AWS — Athena", code: "aws_billing.cur_uts_cost_usage" },
    { cloud: "github", label: "GitHub — dummy (pending PAT)", code: "" },
  ];
  let updated = "";
  if (generatedAt) {
    const d = new Date(generatedAt);
    if (!isNaN(d.getTime()))
      updated = d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  return (
    <footer className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border-default)] pt-4 text-[11px] text-[var(--color-text-tertiary)]">
      {sources.map((s) => (
        <span key={s.cloud} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: CLOUDS[s.cloud].color }} />
          {s.label}
          {s.code && <code className="font-mono text-[var(--color-text-secondary)]">{s.code}</code>}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1.5">
        <Database className="h-3 w-3" />
        {updated ? `Updated ${updated} · next billing-export refresh ~24h` : "billing exports refresh ~24h"}
      </span>
    </footer>
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
  // Guards against an in-flight, slower request (e.g. a dimension switched away from) resolving
  // AFTER a newer one and clobbering fresher state with stale rows — only the latest-issued
  // request's response is ever applied.
  const breakdownReqId = useRef(0);
  const loadBreakdown = useCallback(
    async (force: boolean) => {
      const reqId = ++breakdownReqId.current;
      const result = await fetchCostBreakdown(dimension, cloud, days, force);
      if (reqId === breakdownReqId.current) setBreakdown(result);
    },
    [dimension, cloud, days],
  );
  // True once `breakdown` actually reflects the CURRENTLY selected dimension/cloud/range — false
  // during the gap between changing a filter and its fetch resolving, so the table body never
  // renders the prior fetch's rows under the new column header (see BreakdownPanel `stale`).
  const breakdownFresh =
    breakdown != null && breakdown.dimension === dimension && breakdown.cloud === cloud && breakdown.days === days;

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

  const activeClouds = useMemo<CostCloud[]>(() => (cloud === "all" ? CLOUD_ORDER : [cloud]), [cloud]);
  const trendClouds = useMemo<CostCloud[]>(
    () => (ts ? CLOUD_ORDER.filter((c) => ts.clouds.includes(c)) : activeClouds),
    [ts, activeClouds],
  );
  const vmRows = useMemo(() => resources.filter((r) => r.resource_kind === "vm"), [resources]);
  const bucketRows = useMemo(() => resources.filter((r) => r.resource_kind === "bucket"), [resources]);
  const githubRows = useMemo(
    () => (breakdown?.dimension === "service" ? breakdown.rows.filter((r) => r.cloud === "github") : []),
    [breakdown],
  );

  return (
    /* Full-width — adapt to the monitor, no fixed max-w cap (matches the App.tsx `*` shell decision,
       operator 2026-06-22: a 1440/1920px cap wasted the right third of a >=2560px monitor). Every
       panel inside is already fluid (responsive card grids, w-full tables, a ResizeObserver-driven
       chart), so dropping the page cap makes the whole page adapt. The two leaf tables keep their
       own `overflow-x-auto`, so their horizontal scrollbars still appear when NOT full-screen. */
    <main data-testid="cost-observability-page" className="w-full space-y-4 px-4 py-6 lg:px-6">
      {/* page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-purple)] text-white">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Cost Observability</h1>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              GCP · AWS · GitHub&nbsp;&nbsp;/&nbsp;&nbsp;<span className="font-mono">/ops/costs</span>
            </p>
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
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh cost data"
            className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* provisional notice */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-accent-amber)]/30 bg-[var(--color-accent-amber)]/10 px-3 py-2.5 text-xs text-[var(--color-text-secondary)]">
        <AlertTriangle className="h-3.5 w-3.5 flex-none text-[var(--color-accent-amber)]" />
        <span>
          Recent days are <b className="text-[var(--color-text-primary)]">provisional</b> — GCP reconciles credits for
          ~2 days and today&apos;s export lands overnight; AWS re-trues the current month on the 6th–7th. Figures update
          daily from the billing exports.
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
              <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--color-bg-secondary)]" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-[var(--color-bg-secondary)]" />
        </div>
      ) : (
        summary && (
          <>
            <KpiBand summary={summary} cloud={cloud} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                {ts && (
                  <TrendPanel
                    points={ts.points}
                    clouds={trendClouds}
                    provisionalDays={summary.provisional_days}
                    rangeDays={summary.days}
                  />
                )}
              </div>
              <div>
                <DonutPanel summary={summary} clouds={activeClouds} />
              </div>
            </div>
            {breakdown && (
              <BreakdownPanel
                dimension={dimension}
                onDimension={setDimension}
                data={breakdown}
                stale={!breakdownFresh}
              />
            )}
            {/* Two-up ONLY when each half is wide enough to show every column of the wider (bucket)
                table without a scrollbar (~1020px inner ⇒ ~2200px viewport, e.g. a full-screen 2560px
                monitor). Below that they stack full-width so all columns stay visible — e.g. at half
                of a 2560px monitor. Each still keeps its own overflow-x-auto for genuinely narrow widths. */}
            <div className="grid grid-cols-1 gap-4 min-[2200px]:grid-cols-2">
              <LeafPanel title="Top compute instances" hint="GCE + EC2" rows={vmRows} kind="vm" />
              <LeafPanel title="Top storage buckets" hint="GCS + S3" rows={bucketRows} kind="bucket" />
            </div>
            {(cloud === "all" || cloud === "github") && githubRows.length > 0 && <GithubPanel rows={githubRows} />}
            <SourceFooter generatedAt={summary.generated_at} />
          </>
        )
      )}
    </main>
  );
}
