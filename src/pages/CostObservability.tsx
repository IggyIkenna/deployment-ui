import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  DollarSign,
  HelpCircle,
  Info,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  fetchCostBreakdown,
  fetchCostSummary,
  fetchCostTimeseries,
  type CloudFilter,
  type CloudSummary,
  type CostBreakdownResponse,
  type CostBreakdownRow,
  type CostCloud,
  type CostDateRange,
  type CostDimension,
  type CostLabelKey,
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
// The preset pills are shortcuts that POPULATE the always-visible date range, not a separate mode.
// `""` = no preset is active because the operator edited the dates directly — the pills simply
// deselect rather than lying about which window is on screen.
type WindowSel = "7" | "30" | "90" | "";
const WINDOW_OPTIONS: { value: WindowSel; label: string }[] = RANGES.map((r) => ({
  value: String(r) as WindowSel,
  label: `${r}d`,
}));
// Longest selectable span — mirrors the API's own 366-day cap (routes/costs.py MAX_RANGE_DAYS), so
// the picker can't offer a range the backend will 400 on.
const MAX_RANGE_DAYS = 366;

/** Local-calendar ISO `YYYY-MM-DD` — `toISOString()` would shift the day for anyone behind UTC. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToday(): string {
  return isoDay(new Date());
}
function isoDaysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

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
  { value: "label", label: "By label" },
  { value: "waste", label: "Waste" },
];
const DIM_NOTE: Record<CostDimension, string> = {
  service: "Google / AWS service · GitHub product",
  resource: "individual VMs, buckets & build workers",
  bucket: "GCS + S3 · cost split into storage / operations / egress",
  region: "billing location",
  day: "daily totals across selected clouds",
  sku: "Google/AWS SKU",
  label: "GCP business label · pick a key → (AWS/GitHub have no labels)",
  waste:
    "idle IPs · orphaned disks/images · stale backups · VMs billed past when their job finished — money paid for nothing running",
};
// The GCP labels the "By label" dimension can group by (matches the backend LabelKey).
const LABEL_KEYS: { value: CostLabelKey; label: string }[] = [
  { value: "purpose", label: "purpose" },
  { value: "category", label: "category" },
  { value: "venue", label: "venue" },
  { value: "asset_group", label: "asset_group" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function usd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function usdShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${n.toFixed(0)}`;
}
function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// Currency toggle. USD is the default cross-cloud view (GCP already converted from GBP; AWS native
// USD). "GBP" is a per-cloud invoice-tally view: it re-denominates GBP-native rows (GCP) to their
// raw £ while everything else — USD-native clouds (AWS/GitHub) and cross-cloud aggregates — stays
// USD, because no GBP figure exists for it. So it's most useful paired with the GCP cloud filter.
type Ccy = "USD" | "GBP";
const CURRENCIES: { value: Ccy; label: string }[] = [
  { value: "USD", label: "USD" },
  { value: "GBP", label: "GBP" },
];
function money(mode: Ccy, usdVal: number, nativeVal: number | null | undefined, rowCcy: string | undefined): string {
  return mode === "GBP" && rowCcy === "GBP" ? gbp(nativeVal ?? usdVal) : usd(usdVal);
}
// Bucket storage is already backend-derived to GB (never bytes) — format with thousands
// separators only, no unit-magnitude conversion (so the label stays legible as "GB").
function formatGb(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 0 })} GB`;
}
function costPerGb(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}/GB`;
}
// $/GB (or £/GB in GBP mode for a GBP-native bucket, re-denominated at the row's own billed rate).
function perGb(mode: Ccy, r: CostBreakdownRow): string {
  const n = r.cost_per_gb ?? 0;
  if (mode === "GBP" && r.currency === "GBP") {
    const v = n * nativeFactor(r);
    return `£${v.toFixed(v < 1 ? 4 : 2)}/GB`;
  }
  return costPerGb(n);
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
  orphaned_image: "orphaned",
  orphaned_machine_image: "stale backup",
  orphaned_snapshot: "stale backup",
  stopped_vm_disk: "idle since stop",
};
// Red = a live resource, proven (not heuristic) to trace back to nothing running — reclaim it now.
// Amber = everything else: idle-IP SKUs (definitive but a config toggle, not a delete), age-heuristic
// backup artifacts (might be a deliberate retention window), and stopped_vm_disk (historical — the
// $ already happened, possibly on a resource already deleted; nothing to click today).
const WASTE_RED_KINDS = new Set(["orphaned_disk", "orphaned_image"]);
// Resource rows only — a row IS the idle/orphaned resource, and its own GROSS cost is the waste
// amount: what the idle thing actually costs, pre-credit. NET can round to ~$0 when a promo credit
// masks it (an idle IP is ~$2/mo gross, fully credited today), which would read as "not waste" —
// the gross is the honest "what you'd save / will pay when the promo ends". Shared by the breakdown
// table's resource column and the leaf "Top compute instances" table so both render waste identically.
function WasteCell({ r, currency }: { r: CostBreakdownRow; currency: Ccy }) {
  if (!r.is_idle) return <span className="text-[var(--color-text-tertiary)]">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded border px-1 text-[9px] font-bold uppercase ${
          WASTE_RED_KINDS.has(r.waste_kind ?? "")
            ? "border-[var(--color-accent-red)]/50 text-[var(--color-accent-red)]"
            : "border-[var(--color-accent-amber)]/50 text-[var(--color-accent-amber)]"
        }`}
      >
        {WASTE_LABEL[r.waste_kind ?? ""] ?? "waste"}
      </span>
      <span className="font-mono text-[var(--color-text-primary)]">
        {money(currency, r.gross, r.gross_native, r.currency)}
      </span>
    </span>
  );
}
// Effective native/USD factor for a row (its own billed FX rate); 1 for USD-native rows. Used to
// re-denominate derived figures (component split, $/GB) that have no separate native field.
function nativeFactor(r: CostBreakdownRow): number {
  return r.currency === "GBP" && r.cost ? (r.cost_native ?? r.cost) / r.cost : 1;
}
// Bucket cost-component cell (storage / operations / egress / other). A component is present
// only when it rounds to non-zero, so an absent one dashes rather than showing a false 0.00.
function CompCell({
  v,
  r,
  currency,
  testId,
}: {
  v: number | undefined;
  r: CostBreakdownRow;
  currency: Ccy;
  testId: string;
}) {
  return (
    <td
      data-testid={testId}
      className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]"
    >
      {v != null ? (
        money(currency, v, v * nativeFactor(r), r.currency)
      ) : (
        <span className="text-[var(--color-text-muted)]">—</span>
      )}
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
  center,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  // Optional middle slot (e.g. the breakdown's dimension tabs) placed between title and the
  // right-aligned hint, so controls share the title row instead of taking their own. flex-wrap keeps
  // it from overflowing on a narrow panel.
  center?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 pt-3.5">
      {icon}
      <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {center}
      {hint != null && <span className="ml-auto text-[11px] text-[var(--color-text-tertiary)]">{hint}</span>}
    </div>
  );
}

// ---------- inline help tooltip (hover/focus reveals a readable explanation) ----------
function InfoTip({ text, testId }: { text: string; testId?: string }) {
  return (
    <span
      role="button"
      className="group relative inline-flex focus:outline-none"
      data-testid={testId}
      tabIndex={0}
      aria-label={text}
    >
      <Info
        aria-hidden="true"
        className="h-3.5 w-3.5 cursor-help text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-30 mt-1.5 hidden w-64 rounded-md border border-[var(--color-border-emphasis)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-relaxed text-[var(--color-text-secondary)] shadow-xl group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
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

// ---------- date-range picker ----------
/**
 * Two native date inputs bounding an INCLUSIVE `[start, end]` window — always visible, and always
 * showing the window currently on screen (a preset click repopulates it from the API's echoed
 * bounds; editing a field selects that exact range instead).
 *
 * Native `<input type="date">` on purpose: it's keyboard- and screen-reader-accessible, localizes
 * its own display, and adds no dependency. The `min`/`max` attributes do the real work — they make
 * the three windows the API rejects (inverted, >366 days, ending in the future) unreachable from
 * the UI rather than merely error-handled, so the operator never sees a 400 for a range the
 * control itself offered. `onCommit` only fires for a value that passes those bounds, so a
 * half-typed date can never be sent as a query.
 */
function DateRangePicker({ range, onCommit }: { range: CostDateRange; onCommit: (r: CostDateRange) => void }) {
  const today = isoToday();
  // Keep the span inside the API cap from BOTH ends, so whichever field the operator moves first
  // stays legal without silently rewriting the other one.
  const earliestStart = isoDaysBefore(range.end, MAX_RANGE_DAYS - 1);
  const latestEnd = (() => {
    const cap = isoDaysBefore(today, 0);
    const spanCap = isoDaysBefore(range.start, -(MAX_RANGE_DAYS - 1));
    return spanCap < cap ? spanCap : cap;
  })();

  // No wrapper chrome: each input carries its own border so it sits flush with the Segmented pills
  // and the icon buttons. A bordered box AROUND bordered-looking inputs read as a second, taller
  // control next to the pills.
  // h-[34px] matches the Segmented pills (34.25px) and the icon buttons (34px) — measured, not
  // guessed; a native date input's intrinsic height is ~30px and read as a shorter, misaligned box.
  const field =
    "h-[34px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 " +
    "font-mono text-[12.5px] leading-none text-[var(--color-text-primary)] outline-none transition-colors " +
    "hover:border-[var(--color-border-emphasis)] focus:border-[var(--color-accent)]";

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="cost-date-range">
      <input
        type="date"
        aria-label="Range start date"
        data-testid="cost-range-start"
        value={range.start}
        min={earliestStart}
        max={range.end}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v <= range.end && v >= earliestStart) onCommit({ ...range, start: v });
        }}
        className={field}
      />
      <span className="text-[12.5px] text-[var(--color-text-tertiary)]">→</span>
      <input
        type="date"
        aria-label="Range end date"
        data-testid="cost-range-end"
        value={range.end}
        min={range.start}
        max={latestEnd}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v >= range.start && v <= latestEnd) onCommit({ ...range, end: v });
        }}
        className={field}
      />
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
  grossNative,
  creditNative,
  ccy,
  mode = "USD",
  compact = false,
  testId,
}: {
  gross: number;
  credit: number;
  grossNative?: number;
  creditNative?: number;
  ccy?: string;
  mode?: Ccy;
  compact?: boolean;
  testId?: string;
}) {
  if (!(credit < 0)) return null;
  return (
    <div
      data-testid={testId}
      className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--color-text-tertiary)]"
    >
      <span className="font-mono">({money(mode, gross, grossNative, ccy)}</span>
      {!compact && <span>gross</span>}
      <span aria-hidden="true">−</span>
      <span className="font-mono text-[var(--color-accent-green)]">
        {money(mode, Math.abs(credit), creditNative != null ? Math.abs(creditNative) : undefined, ccy)}
      </span>
      <span>credits)</span>
    </div>
  );
}

// ---------- KPI band ----------
function KpiBand({
  summary,
  cloud,
  currency,
  clouds,
}: {
  summary: CostSummaryResponse;
  cloud: CloudFilter;
  currency: Ccy;
  clouds: CostCloud[];
}) {
  const byCloud = new Map(summary.clouds.map((c) => [c.cloud, c]));
  return (
    <div className="flex flex-col gap-4">
      {/* total — the cloud-share donut folds in here (its own "Cloud share" card was removed) */}
      <Panel className="relative overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
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
          <CloudDonut summary={summary} clouds={clouds} size={112} />
        </div>
      </Panel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CLOUD_ORDER.map((c) => {
          const cs: CloudSummary = byCloud.get(c) ?? {
            cloud: c,
            total: 0,
            gross: 0,
            credit: 0,
            delta_pct: null,
            daily: [],
            is_placeholder: false,
            currency: "USD",
            total_native: 0,
            gross_native: 0,
            credit_native: 0,
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
                <div
                  data-testid={`cost-cloud-total-${c}`}
                  className="mt-2 font-mono text-2xl font-bold leading-none tracking-tight"
                >
                  {money(currency, cs.total, cs.total_native, cs.currency)}
                </div>
                <GrossCredit
                  gross={cs.gross}
                  credit={cs.credit}
                  grossNative={cs.gross_native}
                  creditNative={cs.credit_native}
                  ccy={cs.currency}
                  mode={currency}
                  compact
                  testId={`cost-cloud-breakdown-${c}`}
                />
                <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                  <Delta pct={cs.delta_pct} />
                  <span className="font-mono">{share}% of total</span>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
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

// ---------- cloud-share donut (folded into the Total-spend card; no longer its own panel) ----------
function CloudDonut({
  summary,
  clouds,
  size = 120,
}: {
  summary: CostSummaryResponse;
  clouds: CostCloud[];
  size?: number;
}) {
  const [hover, setHover] = useState<{ c: CostCloud; x: number; y: number } | null>(null);
  const data = clouds
    .map((c) => ({ cloud: c, value: summary.clouds.find((x) => x.cloud === c)?.total ?? 0 }))
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 4;
  const r = R - 16;
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
    <div className="flex flex-none items-center gap-3">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
          <div className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-[var(--color-text-muted)]">
            cloud
            <br />
            share
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.cloud} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
            <span className="h-2 w-2 rounded-sm" style={{ background: CLOUDS[d.cloud].color }} />
            <span className="whitespace-nowrap">{CLOUDS[d.cloud].label}</span>
            <span className="ml-auto pl-2 font-mono font-semibold text-[var(--color-text-primary)]">
              {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0"}%
            </span>
          </div>
        ))}
        {data.length === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">No spend in window.</span>}
      </div>
      {hover && (
        <ChartTooltip x={hover.x} y={hover.y}>
          <div className="mb-1 font-semibold text-[var(--color-text-primary)]">{CLOUDS[hover.c].label}</div>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <span className="h-2 w-2 rounded-sm" style={{ background: CLOUDS[hover.c].color }} />
            {usd(summary.clouds.find((x) => x.cloud === hover.c)?.total ?? 0)}
            <span className="ml-auto pl-2 font-mono font-semibold text-[var(--color-text-primary)]">
              {total > 0
                ? (((summary.clouds.find((x) => x.cloud === hover.c)?.total ?? 0) / total) * 100).toFixed(1)
                : "0.0"}
              %
            </span>
          </div>
        </ChartTooltip>
      )}
    </div>
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
  filter,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  sticky?: boolean;
  testId?: string;
  // Optional per-column filter control rendered UNDER the sort label, in the same header cell — so
  // categorical columns carry their dropdown inline instead of needing a second (data-hiding) row.
  filter?: React.ReactNode;
}) {
  return (
    <th
      onClick={onClick}
      data-testid={testId}
      aria-sort={active ? (dir === "desc" ? "descending" : "ascending") : "none"}
      // `sticky` keeps the header visible while a long breakdown (up to 90 daily rows) scrolls
      // inside its max-height container; the opaque panel bg hides rows sliding underneath. Only ONE
      // sticky row now (label + optional filter stacked), so nothing pins mid-table over the data.
      className={`cursor-pointer select-none border-b border-[var(--color-border-default)] px-2.5 py-1.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] ${
        sticky ? "sticky top-0 z-10 bg-[var(--color-bg-secondary)]" : ""
      } ${align === "right" ? "text-right" : "text-left"}`}
    >
      <div className={`flex items-center gap-1.5 ${align === "right" ? "justify-end" : "justify-start"}`}>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {label}
          {active && <span className="text-[9px] opacity-60">{dir === "desc" ? "▼" : "▲"}</span>}
        </span>
        {/* Filter sits BESIDE the label (same line) so it adds no header height. stopPropagation so
            opening/using it never triggers this column's sort. */}
        {filter != null && (
          <div onClick={(e) => e.stopPropagation()} className="font-normal normal-case tracking-normal">
            {filter}
          </div>
        )}
      </div>
    </th>
  );
}

// ---------- breakdown (single sortable table, bar-in-cell) ----------
function BreakdownPanel({
  dimension,
  onDimension,
  labelKey,
  onLabelKey,
  data,
  stale,
  currency,
}: {
  dimension: CostDimension;
  onDimension: (d: CostDimension) => void;
  labelKey: CostLabelKey;
  onLabelKey: (k: CostLabelKey) => void;
  data: CostBreakdownResponse;
  // True while `data` is still the PRIOR fetch's response (dimension/cloud/range just changed and
  // the new request hasn't resolved yet) — gates the body so the old rows never render under the
  // new column header. See CostObservability() `breakdownFresh`.
  stale: boolean;
  currency: Ccy;
}) {
  // Synthetic roll-up rows ("Other (N more)", "Unattributed") are pinned to the bottom and excluded
  // from sort — they're summaries, not comparable groups; sorting them into the middle by cost would
  // be wrong. Only the real groups are sortable / bar-scaled.
  const realRows = useMemo(() => data.rows.filter((r) => !r.is_aggregate), [data.rows]);
  const aggRows = useMemo(() => data.rows.filter((r) => r.is_aggregate), [data.rows]);
  // Which categorical columns exist depends on the dimension (mirrors the <thead> below). Compute the
  // credit/other/purchase flags first — both the column model and those columns key off them.
  const hasCredits = data.rows.some((r) => r.credit < 0);
  const hasOther = data.rows.some((r) => (r.cost_by_component?.other ?? 0) !== 0);
  const showPurchase = dimension === "resource" || dimension === "waste" || dimension === "service";
  // Ordered column model — the SINGLE source of truth for the header row, the per-column filter row,
  // and the colSpan maths, so they can never drift. `cat` marks a categorical column that gets a value
  // dropdown; numeric columns (cost/share/components/…) are sort-only. Order MUST match the <thead>.
  const cols = useMemo<{ key: string; cat: boolean }[]>(
    () => [
      { key: "label", cat: true },
      { key: "detail", cat: true },
      ...(showPurchase ? [{ key: "purchase_option", cat: true }] : []),
      ...(dimension === "bucket"
        ? [
            { key: "storage_gb", cat: false },
            { key: "storage_class", cat: true },
            { key: "cost_per_gb", cat: false },
            { key: "comp_storage", cat: false },
            { key: "comp_operations", cat: false },
            { key: "comp_egress", cat: false },
            ...(hasOther ? [{ key: "comp_other", cat: false }] : []),
          ]
        : []),
      ...(dimension === "resource" || dimension === "waste"
        ? [
            { key: "machine_type", cat: true },
            { key: "waste", cat: false },
          ]
        : []),
      { key: "cost", cat: false },
      ...(hasCredits
        ? [
            { key: "gross", cat: false },
            { key: "credit", cat: false },
          ]
        : []),
      { key: "share_pct", cat: false },
    ],
    [dimension, showPurchase, hasOther, hasCredits],
  );
  // Per-column filters (client-side, over the rows already fetched — no re-query). Each categorical
  // column's dropdown options are the DISTINCT values PRESENT in the current rows, derived live via the
  // same `sortValue` accessor the header sorts by — so the options track the data (dynamic, not fixed).
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const colOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const c of cols) {
      if (!c.cat) continue;
      const seen = new Set<string>();
      for (const r of realRows) {
        const v = String(sortValue(r, c.key) ?? "").trim();
        if (v && v !== "—") seen.add(v);
      }
      opts[c.key] = [...seen].sort((a, b) => a.localeCompare(b));
    }
    return opts;
  }, [realRows, cols]);
  // Drop a column's filter if its selected value no longer exists in the new rows (dimension switch).
  const activeFilters = useMemo(
    () => Object.entries(colFilters).filter(([k, v]) => v && (colOptions[k]?.includes(v) ?? false)),
    [colFilters, colOptions],
  );
  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return realRows;
    return realRows.filter((r) => activeFilters.every(([k, v]) => String(sortValue(r, k) ?? "") === v));
  }, [realRows, activeFilters]);
  const { sorted, key, dir, toggle } = useSort(filtered, "cost");
  // Pagination — the backend now returns up to 1000 real groups; page through them 100 at a time so a
  // big dimension (e.g. ~565 buckets) is fully reachable without an unbounded scroll.
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [sorted, safePage],
  );
  const onLastPage = safePage >= pageCount - 1;
  // Reset to the first page whenever the row set or ordering changes (dimension/data/filter/sort).
  useEffect(() => setPage(0), [data, colFilters, key, dir]);
  const max = Math.max(...realRows.map((r) => r.cost), 1);
  const dimLabel = DIMENSIONS.find((d) => d.value === dimension)?.label.replace("By ", "") ?? dimension;
  // Human label for a categorical column key — backs the per-column filter dropdowns' aria-labels.
  const colLabel = (k: string): string =>
    k === "label"
      ? dimLabel
      : k === "detail"
        ? "Detail"
        : k === "purchase_option"
          ? "Purchase"
          : k === "storage_class"
            ? "Storage class"
            : k === "machine_type"
              ? "Machine"
              : k;
  // Compact filter dropdown rendered INSIDE a categorical column's header cell (under its sort label).
  // Options are the distinct values present in the fetched rows (dynamic); hidden while `stale` so a
  // refetch never surfaces the prior dimension's values. Returns null for columns with no options.
  const colSelect = (colKey: string): React.ReactNode =>
    !stale && (colOptions[colKey]?.length ?? 0) > 0 ? (
      <select
        value={colFilters[colKey] ?? ""}
        onChange={(e) => setColFilters((f) => ({ ...f, [colKey]: e.target.value }))}
        data-testid={`cost-breakdown-colfilter-${colKey}`}
        aria-label={`Filter by ${colLabel(colKey)}`}
        className="min-w-[56px] max-w-[130px] cursor-pointer rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-1 py-0.5 text-[10px] text-[var(--color-text-primary)] focus:border-[var(--color-accent-cyan)] focus:outline-none"
      >
        <option value="">All ({colOptions[colKey].length})</option>
        {colOptions[colKey].map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    ) : null;
  // Cap note: the backend shows the top _BREAKDOWN_LIMIT groups + an "Other" roll-up so the header
  // total stays the TRUE total. When more groups exist than are shown, tell the user exactly what's
  // hidden and that it's rolled into the last row(s) — else the total looks mismatched again.
  const totalGroups = data.total_groups ?? realRows.length;
  const capped = totalGroups > realRows.length;
  const shownSum = realRows.reduce((s, r) => s + r.cost, 0);
  const remainingSum = data.total - shownSum;
  // Native (GBP-tally) figures for the hint. Native is shown only when the WHOLE view is one
  // non-USD currency (i.e. cloud=gcp → every row GBP); a mixed cloud=all view has no single native
  // total, so scopeCcy stays USD. The "Other"/"Unattributed" rows carry the native residual, so
  // nativeShown + nativeRemaining == the native window total to the penny.
  const scopeCcy = data.rows.length > 0 && data.rows.every((r) => r.currency === "GBP") ? "GBP" : "USD";
  const nativeShown = realRows.reduce((s, r) => s + (r.cost_native ?? r.cost), 0);
  const nativeRemaining = aggRows.reduce((s, r) => s + (r.cost_native ?? r.cost), 0);
  const nativeTotal = nativeShown + nativeRemaining;
  // colCount drives the loading + aggregate-row colSpans — derived from the column model so the header
  // row, the filter row, and the spans can never disagree. (Credit cols appear only when a row carries
  // a GCP credit; bucket "Other $" only when non-zero; Purchase only on resource/service — all encoded
  // in `cols`.)
  const colCount = cols.length;
  // Columns an aggregate row's label spans = everything left of the Cost column (label, detail, and
  // the dimension-specific columns) — its Cost / Gross / Credit / Share render as their own cells.
  const leadCols = colCount - 2 - (hasCredits ? 2 : 0);
  return (
    <Panel>
      <PanelHeader
        title="Breakdown"
        center={
          <>
            <Segmented options={DIMENSIONS} value={dimension} onChange={onDimension} label="Breakdown dimension" />
            {dimension === "label" && (
              <Segmented options={LABEL_KEYS} value={labelKey} onChange={onLabelKey} label="Label key" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {DIM_NOTE[dimension]}
            </span>
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => setColFilters({})}
                data-testid="cost-breakdown-clear-filters"
                className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Clear filters ({activeFilters.length})
              </button>
            )}
          </>
        }
        hint={
          <span className="inline-flex items-center gap-1.5">
            <span>
              {data.cloud === "all" ? "all clouds" : CLOUDS[data.cloud as CostCloud]?.label} · {data.days}d ·{" "}
              <b className="font-mono text-[var(--color-text-primary)]">
                {money(currency, data.total, nativeTotal, scopeCcy)}
              </b>{" "}
              total
              {capped && (
                <>
                  {" · "}
                  <span className="font-mono text-[var(--color-text-secondary)]">
                    {money(currency, shownSum, nativeShown, scopeCcy)}
                  </span>
                  <span className="text-[var(--color-text-muted)]"> + </span>
                  <span className="font-mono text-[var(--color-text-secondary)]">
                    {money(currency, remainingSum, nativeRemaining, scopeCcy)}
                  </span>
                  {" · "}
                  <b className="font-mono text-[var(--color-text-primary)]">{realRows.length}</b>
                  <b className="font-mono text-[var(--color-text-primary)]">/</b>
                  <b className="font-mono text-[var(--color-text-primary)]">
                    {totalGroups.toLocaleString("en-US")}
                  </b>{" "}
                  rows
                </>
              )}
              {!capped && (
                <>
                  {" · "}
                  {totalGroups.toLocaleString("en-US")} {totalGroups === 1 ? "row" : "rows"}
                </>
              )}
            </span>
            {capped && (
              <InfoTip
                testId="cost-breakdown-cap-note"
                text={`Top ${realRows.length} ${dimLabel}s by cost are shown. ${money(currency, shownSum, nativeShown, scopeCcy)} is those ${realRows.length}; ${money(currency, remainingSum, nativeRemaining, scopeCcy)} is the other ${(totalGroups - realRows.length).toLocaleString("en-US")} rows${aggRows.some((r) => !r.label.startsWith("Other")) ? " (plus unattributed cost)" : ""}, rolled into the "Other" row at the bottom of the table. The two add up to the true total, ${money(currency, data.total, nativeTotal, scopeCcy)}.`}
              />
            )}
          </span>
        }
      />
      <div className="p-4 pt-3">
        {/* single table — every row the backend returned (up to 90 daily / 50 grouped), inside a
            fixed-height scroll region. The Cost column carries an inline proportional bar (width =
            cost / max across the full dataset) instead of a separate top-12 bar chart, freeing
            horizontal space for detail columns and removing the label+cost duplication. */}
        {/* tabIndex + role make the scroll region keyboard-reachable (axe scrollable-region-focusable) */}
        {/* Resizable: drag the bottom-right handle (resize-y) to make the table taller/shorter.
            overflow-auto is required for the resize handle to appear + for the sticky header scroll. */}
        <div
          className="h-[420px] min-h-[160px] max-h-[85vh] resize-y overflow-auto"
          data-testid="cost-breakdown-scroll"
          role="region"
          aria-label="Cost breakdown table, scrollable and resizable"
          tabIndex={0}
        >
          <table className="w-full text-xs" data-testid="cost-breakdown-table">
            <thead>
              <tr>
                <SortHead
                  label={dimLabel}
                  active={key === "label"}
                  dir={dir}
                  onClick={() => toggle("label")}
                  sticky
                  filter={colSelect("label")}
                />
                <SortHead
                  label="Detail"
                  active={key === "detail"}
                  dir={dir}
                  onClick={() => toggle("detail")}
                  sticky
                  filter={colSelect("detail")}
                />
                {showPurchase && (
                  <SortHead
                    label="Purchase"
                    active={key === "purchase_option"}
                    dir={dir}
                    onClick={() => toggle("purchase_option")}
                    sticky
                    testId="cost-col-purchase"
                    filter={colSelect("purchase_option")}
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
                      filter={colSelect("storage_class")}
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
                {(dimension === "resource" || dimension === "waste") && (
                  <>
                    <SortHead
                      label="Machine"
                      active={key === "machine_type"}
                      dir={dir}
                      onClick={() => toggle("machine_type")}
                      sticky
                      filter={colSelect("machine_type")}
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
                pageRows.map((r) => {
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
                            {r.cost_per_gb != null ? perGb(currency, r) : "—"}
                          </td>
                          <CompCell
                            v={r.cost_by_component?.storage}
                            r={r}
                            currency={currency}
                            testId="cost-bucket-comp-storage"
                          />
                          <CompCell
                            v={r.cost_by_component?.operations}
                            r={r}
                            currency={currency}
                            testId="cost-bucket-comp-operations"
                          />
                          <CompCell
                            v={r.cost_by_component?.egress}
                            r={r}
                            currency={currency}
                            testId="cost-bucket-comp-egress"
                          />
                          {hasOther && (
                            <CompCell
                              v={r.cost_by_component?.other}
                              r={r}
                              currency={currency}
                              testId="cost-bucket-comp-other"
                            />
                          )}
                        </>
                      )}
                      {(dimension === "resource" || dimension === "waste") && (
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
                            <WasteCell r={r} currency={currency} />
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
                            {money(currency, r.cost, r.cost_native, r.currency)}
                          </span>
                        </div>
                      </td>
                      {hasCredits && (
                        <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                          {money(currency, r.gross, r.gross_native, r.currency)}
                        </td>
                      )}
                      {hasCredits && (
                        <td
                          className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-accent-green)]"
                          data-testid="cost-row-credit"
                        >
                          {r.credit < 0
                            ? `−${money(currency, Math.abs(r.credit), r.credit_native != null ? Math.abs(r.credit_native) : undefined, r.currency)}`
                            : "—"}
                        </td>
                      )}
                      <td className="border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                        {r.share_pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              {/* Roll-up rows ("Other (N more)", "Unattributed") — pinned last, no bar, distinct
                  background: they're the honest tail so the shown rows sum to the header total. Shown
                  only on the last page, and hidden while a filter is active (they aren't filterable). */}
              {!stale &&
                onLastPage &&
                activeFilters.length === 0 &&
                aggRows.map((r) => (
                  <tr
                    key={`agg-${r.label}`}
                    data-testid="cost-row-aggregate"
                    className="border-t-2 border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)]/40"
                  >
                    <td colSpan={leadCols} className="px-2.5 py-[7px]">
                      <span className="font-semibold text-[var(--color-text-primary)]">{r.label}</span>
                      {r.detail && <span className="ml-2 text-[11px] text-[var(--color-text-muted)]">{r.detail}</span>}
                    </td>
                    <td className="px-2.5 py-[7px] text-right font-mono font-semibold text-[var(--color-text-primary)]">
                      {money(currency, r.cost, r.cost_native, r.currency)}
                    </td>
                    {hasCredits && (
                      <td className="px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                        {money(currency, r.gross, r.gross_native, r.currency)}
                      </td>
                    )}
                    {hasCredits && (
                      <td className="px-2.5 py-[7px] text-right font-mono text-[var(--color-accent-green)]">
                        {r.credit < 0
                          ? `−${money(currency, Math.abs(r.credit), r.credit_native != null ? Math.abs(r.credit_native) : undefined, r.currency)}`
                          : "—"}
                      </td>
                    )}
                    <td className="px-2.5 py-[7px] text-right font-mono text-[var(--color-text-tertiary)]">
                      {r.share_pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              {!stale && sorted.length === 0 && (activeFilters.length > 0 || aggRows.length === 0) && (
                <tr>
                  <td colSpan={colCount} className="py-4 text-center text-[var(--color-text-muted)]">
                    {activeFilters.length > 0 ? "No rows match the selected filters." : "No spend in this window."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-tertiary)]"
            data-testid="cost-breakdown-pagination"
          >
            <span>
              Showing{" "}
              <b className="font-mono text-[var(--color-text-secondary)]">
                {(safePage * PAGE_SIZE + 1).toLocaleString("en-US")}
              </b>
              –
              <b className="font-mono text-[var(--color-text-secondary)]">
                {Math.min((safePage + 1) * PAGE_SIZE, sorted.length).toLocaleString("en-US")}
              </b>{" "}
              of <b className="font-mono text-[var(--color-text-secondary)]">{sorted.length.toLocaleString("en-US")}</b>
              {activeFilters.length > 0 && ` (filtered from ${realRows.length.toLocaleString("en-US")})`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                data-testid="cost-breakdown-prev"
                className="rounded border border-[var(--color-border-default)] px-2 py-0.5 text-[var(--color-text-secondary)] enabled:hover:border-[var(--color-accent-cyan)] enabled:hover:text-[var(--color-text-primary)] disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span className="font-mono">
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                data-testid="cost-breakdown-next"
                className="rounded border border-[var(--color-border-default)] px-2 py-0.5 text-[var(--color-text-secondary)] enabled:hover:border-[var(--color-accent-cyan)] enabled:hover:text-[var(--color-text-primary)] disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </div>
        )}
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
  currency,
}: {
  title: string;
  hint: string;
  rows: CostBreakdownRow[];
  kind: "vm" | "bucket";
  currency: Ccy;
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
                    <WasteCell r={r} currency={currency} />
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
                    {r.cost_per_gb != null ? perGb(currency, r) : "—"}
                  </td>
                )}
                <td className="whitespace-nowrap border-b border-[var(--color-border-subtle)] px-2.5 py-[7px] text-right font-mono text-[var(--color-text-primary)]">
                  {money(currency, r.cost, r.cost_native, r.currency)}
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

// ---------- github by-product panel (live Enhanced Billing, or the labelled dummy fallback) ----------
function GithubPanel({ rows, placeholder }: { rows: CostBreakdownRow[]; placeholder: boolean }) {
  const max = Math.max(...rows.map((r) => r.cost), 1);
  return (
    <Panel className={placeholder ? "border-dashed border-[var(--color-accent-purple)]/40" : undefined}>
      <PanelHeader
        title="GitHub billing"
        icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLOUDS.github.color }} />}
        hint={placeholder ? "placeholder" : "Enhanced Billing API"}
      />
      <div className="p-4 pt-3">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              By product{placeholder ? " (dummy)" : ""}
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
          {placeholder ? (
            <div className="flex items-start gap-2 rounded-md bg-[var(--color-accent-purple)]/10 p-3 text-xs text-[var(--color-text-secondary)]">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-none text-[var(--color-accent-purple)]" />
              <span>
                <b className="text-[var(--color-text-primary)]">Dummy data.</b> Real GitHub billing needs a token with
                the <span className="font-mono">Plan</span> permission (Enhanced Billing API) — not yet reachable. This
                panel wires to the real data the moment the token lands; the layout and shape won&apos;t change.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
              <span>
                <b className="text-[var(--color-text-primary)]">Live.</b> GitHub Actions / Copilot / Packages usage from
                the Enhanced Billing API, shown net of each product&apos;s included allowances.
              </span>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ---------- source-attribution footer ----------
function SourceFooter({
  generatedAt,
  githubPlaceholder,
}: {
  generatedAt: string | undefined;
  githubPlaceholder: boolean;
}) {
  const sources: { cloud: CostCloud; label: string; code: string }[] = [
    { cloud: "gcp", label: "GCP — BigQuery", code: "billing_export.gcp_billing_export_resource_v1" },
    { cloud: "aws", label: "AWS — Athena", code: "aws_billing.cur_uts_cost_usage" },
    githubPlaceholder
      ? { cloud: "github", label: "GitHub — dummy (pending PAT)", code: "" }
      : { cloud: "github", label: "GitHub — Enhanced Billing", code: "settings/billing/usage" },
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
// ---------- "what is this page" help dialog ----------
function HelpTerm({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-[104px] flex-none font-semibold text-[var(--color-text-primary)]">{term}</span>
      <span className="flex-1 text-[var(--color-text-secondary)]">{children}</span>
    </div>
  );
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function CostHelpDialog({
  open,
  onClose,
  provisionalDays,
}: {
  open: boolean;
  onClose: () => void;
  provisionalDays: number;
}) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Cost Observability — quick guide</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4 text-[13px] leading-relaxed">
        <p className="text-[var(--color-text-secondary)]">
          Your daily cloud spend across <b className="text-[var(--color-text-primary)]">GCP, AWS, and GitHub</b>, pulled
          straight from the billing exports — these are real invoiced costs, not estimates. The top bar sets the{" "}
          <b className="text-[var(--color-text-primary)]">time range</b> (7 / 30 / 90 days), filters to one{" "}
          <b className="text-[var(--color-text-primary)]">cloud</b>, switches{" "}
          <b className="text-[var(--color-text-primary)]">currency</b>, and forces a{" "}
          <b className="text-[var(--color-text-primary)]">refresh</b> (data caches ~1h and updates daily on its own).
        </p>

        <HelpSection title="Reading the numbers">
          <HelpTerm term="Net / Total">
            What you actually pay = Gross minus Credits. The headline figure everywhere.
          </HelpTerm>
          <HelpTerm term="Gross">List price before any discount.</HelpTerm>
          <HelpTerm term="Credit">Discounts, committed-use and promos (shown negative). Net = Gross + Credit.</HelpTerm>
          <HelpTerm term="Share">That row as a percent of the window net total.</HelpTerm>
          <HelpTerm term="Run-rate">Recent average spend per day.</HelpTerm>
          <HelpTerm term="Change">Up / down percent versus the previous window of the same length.</HelpTerm>
          <HelpTerm term="Cloud share">The donut in the total card — each cloud as a slice of net spend.</HelpTerm>
        </HelpSection>

        <section className="space-y-1 rounded-md border border-[var(--color-accent-amber)]/30 bg-[var(--color-accent-amber)]/10 p-3">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-accent-amber)]">
            <AlertTriangle className="h-3.5 w-3.5 flex-none" />
            Recent days are provisional
            {provisionalDays > 0 ? ` · ${provisionalDays} day${provisionalDays !== 1 ? "s" : ""}` : ""}
          </h3>
          <p className="text-[var(--color-text-secondary)]">
            GCP reconciles credits for about 2 days and the current-day export lands overnight; AWS re-trues the current
            month on the 6th–7th. So the last couple of days can still move — treat them as not-yet-final.
          </p>
        </section>

        <HelpSection title="The breakdown table">
          <p className="text-[var(--color-text-secondary)]">
            Splits the same spend by a chosen axis — pick it with the tabs; it re-groups instantly, no new query.
          </p>
          <HelpTerm term="Dimensions">
            By service · resource (individual VMs / buckets / build workers) · bucket · region · day · SKU · label (your
            own resource tags).
          </HelpTerm>
          <HelpTerm term="1st column">
            The grouping value; <b className="text-[var(--color-text-primary)]">Detail</b> is a secondary descriptor
            (provider / parent service / kind).
          </HelpTerm>
          <HelpTerm term="Cost">Net for the row; the inline bar shows its size versus the largest row.</HelpTerm>
          <HelpTerm term="Gross / Credit">
            Pre-discount price and the discount — shown only when a row in view carries credits.
          </HelpTerm>
          <HelpTerm term="Purchase">Spot versus on-demand, on compute rows.</HelpTerm>
          <HelpTerm term="Bucket cols">
            Storage (GB), Storage class, $/GB, and the net split Storage $ / Ops $ / Egress $.
          </HelpTerm>
          <HelpTerm term="Resource cols">Machine (type · vCPU · RAM) and Waste (idle or orphaned cost).</HelpTerm>
          <p className="text-[var(--color-text-tertiary)]">
            Filter any column from its header dropdown · click a header to sort · 100 rows per page · drag the
            bottom-right corner to resize.
          </p>
        </HelpSection>

        <HelpSection title="Where the data comes from">
          <p className="text-[var(--color-text-secondary)]">
            GCP → BigQuery billing export · AWS → Cost and Usage Report via Athena · GitHub → Enhanced Billing API. GCP
            bills in GBP (converted at the daily Google rate); GCP days follow US-Pacific to match the console, AWS days
            follow UTC.
          </p>
        </HelpSection>
      </DialogContent>
    </Dialog>
  );
}

export function CostObservability() {
  const [days, setDays] = useState<number>(30);
  // null = a trailing `days` preset is active, so the SERVER resolves the window and the date
  // inputs display whatever it echoed back. Non-null = the operator typed an explicit window,
  // which takes precedence. Presets deliberately keep sending `days` rather than dates computed
  // here: the server's "today" is UTC and the browser's is local, so a locally-derived preset
  // would show an end date a day off for anyone ahead of UTC.
  const [range, setRange] = useState<CostDateRange | null>(null);
  const [cloud, setCloud] = useState<CloudFilter>("all");
  const [currency, setCurrency] = useState<Ccy>("USD");
  const [dimension, setDimension] = useState<CostDimension>("service");
  const [labelKey, setLabelKey] = useState<CostLabelKey>("purpose");

  const [summary, setSummary] = useState<CostSummaryResponse | null>(null);
  const [ts, setTs] = useState<CostTimeseriesResponse | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdownResponse | null>(null);
  const [resources, setResources] = useState<CostBreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A stable identity for the selected window. The breakdown's freshness can't be judged on `days`
  // alone once ranges exist — a 30-day hand-picked range and the 30d preset share a length but are
  // different windows — so requests are tagged with this instead.
  const windowKey = range ? `${range.start}:${range.end}` : `days:${days}`;
  const windowArg = range ?? undefined;

  // What the date inputs SHOW: the hand-picked range, else the window the API actually resolved for
  // the active preset. The local fallback only covers the first paint (before any response has
  // landed) — every rendered value after that is the server's own, so the dates on screen always
  // describe the numbers on screen.
  const shownRange: CostDateRange = range ?? {
    start: summary?.start_date ?? isoDaysBefore(isoToday(), days - 1),
    end: summary?.end_date ?? isoToday(),
  };

  // Same ordering guard `loadBreakdown` carries, for the same reason: only the LATEST-issued
  // request may apply its response. Two date inputs commit back-to-back (editing `start` then
  // `end` issues two windows in a second), and a cost window is a cache miss — a ~10s GCS/DuckDB
  // load for the window PLUS its prior-comparison window — so an earlier, slower request routinely
  // lands after a newer one. Without this the KPI band renders one window behind the dates beside
  // it: measured live, picking 1-15 May displayed the previous 7d total ($2,352.32) while the
  // correct $2,410.28 arrived and was discarded.
  const coreReqId = useRef(0);
  const loadCore = useCallback(
    async (force: boolean) => {
      const reqId = ++coreReqId.current;
      const [s, t, res] = await Promise.all([
        fetchCostSummary(days, force, windowArg),
        fetchCostTimeseries(days, cloud, force, windowArg),
        fetchCostBreakdown("resource", cloud, days, force, "purpose", windowArg),
      ]);
      if (reqId !== coreReqId.current) return; // a newer window is in flight — drop this one
      setSummary(s);
      setTs(t);
      setResources(res.rows);
    },
    [days, cloud, windowArg],
  );
  // Guards against an in-flight, slower request (e.g. a dimension switched away from) resolving
  // AFTER a newer one and clobbering fresher state with stale rows — only the latest-issued
  // request's response is ever applied.
  const breakdownReqId = useRef(0);
  const [breakdownWindow, setBreakdownWindow] = useState("");
  const loadBreakdown = useCallback(
    async (force: boolean) => {
      const reqId = ++breakdownReqId.current;
      const key = windowKey;
      const result = await fetchCostBreakdown(dimension, cloud, days, force, labelKey, windowArg);
      if (reqId === breakdownReqId.current) {
        setBreakdown(result);
        setBreakdownWindow(key);
      }
    },
    [dimension, cloud, days, labelKey, windowArg, windowKey],
  );
  // True once `breakdown` actually reflects the CURRENTLY selected dimension/cloud/range — false
  // during the gap between changing a filter and its fetch resolving, so the table body never
  // renders the prior fetch's rows under the new column header (see BreakdownPanel `stale`).
  // The window is compared by the REQUESTED key, not the response's `days`: only the client knows
  // whether it asked for a preset or an equal-length explicit range.
  const breakdownFresh =
    breakdown != null &&
    breakdown.dimension === dimension &&
    breakdown.cloud === cloud &&
    breakdownWindow === windowKey;

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
  }, [days, cloud, windowKey]);

  useEffect(() => {
    loadBreakdown(false).catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load breakdown"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, labelKey]);

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
  // GitHub is real (Enhanced Billing API) unless the provider fell back to the labelled dummy.
  const githubPlaceholder = summary?.clouds.find((c) => c.cloud === "github")?.is_placeholder ?? false;

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
            <p className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <span>
                GCP · AWS · GitHub&nbsp;&nbsp;/&nbsp;&nbsp;<span className="font-mono">/costs</span>
              </span>
              <InfoTip
                testId="cost-currency-tz-note"
                text="All spend is shown in USD. GCP bills in GBP and is converted at Google's own daily rate (currency_conversion_rate); AWS is native USD. GCP days are grouped in US Pacific time to match the GCP billing console; AWS days follow UTC to match AWS Cost Explorer."
              />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={WINDOW_OPTIONS}
            // No pill is active once the dates are hand-picked — the range below is the window.
            value={range ? "" : (String(days) as WindowSel)}
            onChange={(v) => {
              setRange(null); // back to a server-resolved trailing window; the inputs repopulate from it
              setDays(Number(v));
            }}
            label="Time range"
          />
          <DateRangePicker range={shownRange} onCommit={setRange} />
          <Segmented options={CLOUD_FILTERS} value={cloud} onChange={setCloud} label="Cloud filter" />
          <Segmented options={CURRENCIES} value={currency} onChange={setCurrency} label="Currency" />
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh cost data"
            className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="What is this page? Quick guide & definitions"
            data-testid="cost-help-button"
            className="grid h-[34px] w-[34px] place-items-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-emphasis)] hover:text-[var(--color-text-primary)]"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CostHelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        provisionalDays={summary?.provisional_days ?? 0}
      />

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
            {/* Top = 2 parts: the bigger daily chart on the left, all 4 KPI cards (total + 3
                sources) stacked on the right. Sparklines dropped from the cards — the left chart
                already shows that trend. */}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
              {ts && (
                <TrendPanel
                  points={ts.points}
                  clouds={trendClouds}
                  provisionalDays={summary.provisional_days}
                  rangeDays={summary.days}
                />
              )}
              <KpiBand summary={summary} cloud={cloud} currency={currency} clouds={activeClouds} />
            </div>
            {breakdown && (
              <BreakdownPanel
                dimension={dimension}
                onDimension={setDimension}
                labelKey={labelKey}
                onLabelKey={setLabelKey}
                data={breakdown}
                stale={!breakdownFresh}
                currency={currency}
              />
            )}
            {/* Two-up ONLY when each half is wide enough to show every column of the wider (bucket)
                table without a scrollbar (~1020px inner ⇒ ~2200px viewport, e.g. a full-screen 2560px
                monitor). Below that they stack full-width so all columns stay visible — e.g. at half
                of a 2560px monitor. Each still keeps its own overflow-x-auto for genuinely narrow widths. */}
            <div className="grid grid-cols-1 gap-4 min-[2200px]:grid-cols-2">
              <LeafPanel title="Top compute instances" hint="GCE + EC2" rows={vmRows} kind="vm" currency={currency} />
              <LeafPanel
                title="Top storage buckets"
                hint="GCS + S3"
                rows={bucketRows}
                kind="bucket"
                currency={currency}
              />
            </div>
            {(cloud === "all" || cloud === "github") && githubRows.length > 0 && (
              <GithubPanel rows={githubRows} placeholder={githubPlaceholder} />
            )}
            <SourceFooter generatedAt={summary.generated_at} githubPlaceholder={githubPlaceholder} />
          </>
        )
      )}
    </main>
  );
}
