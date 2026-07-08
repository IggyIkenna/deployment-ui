/**
 * Deployments — the /repos-grade observability surface for every LIVE / BATCH / PAPER
 * deployment, MERGED into ONE flat all-modes table (operator 2026-07-08 — was three
 * separate mode presets; consolidated into a single table with a Mode column so every
 * VM + Cloud Run job reads on one grid). One inventory source, one column shape:
 *
 *   Mode · Target · Cloud · Service · Asset group · Status · Last run · Progress ·
 *   Exit · Feed health · Controls
 *
 * A cell is "—" where a mode doesn't populate that field (batch has no feed-health,
 * live/paper have no captured-progress count). Mode is a FILTER (All / Live / Batch / Paper), not a
 * tab. Retired columns: the phantom "Uptime" (was last-run mislabelled), the duplicate
 * Heartbeat column (heartbeat now rides the Status chip), the Progress/Coverage dupe
 * (one number), and paper's never-wired Recon-drift / Determinism-ε placeholders.
 *
 * Per-target drill-down (event timeline + live log tail) lives in DeploymentDetail.tsx.
 *
 * Plan: deployment_observability_parity_live_batch_paper_2026_06_22.md Phase 2 → merge.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Cloud, RefreshCw, Server, Workflow } from "lucide-react";
import {
  getDeploymentInventory,
  getUmbrellaSummary,
  type DeploymentCloud,
  type DeploymentItem,
  type DeploymentStatus,
  type DeploymentUmbrella,
  type UmbrellaLastFailure,
  type UmbrellaSummaryResponse,
} from "../api/deploymentApi";
import { getDeploymentFreshness, type DeploymentFreshnessResponse } from "../api/health";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { VmControls } from "../components/VmControls";

// The mode a row belongs to (EXPERIMENT folds under BATCH — a target classified
// EXPERIMENT shows a BATCH mode badge so the surface stays a 3-mode Live/Batch/Paper view).
type ModeFilter = "" | "LIVE" | "BATCH" | "PAPER";
const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: "", label: "all" },
  { value: "LIVE", label: "Live" },
  { value: "BATCH", label: "Batch" },
  { value: "PAPER", label: "Paper" },
];

type ChipTone = "green" | "yellow" | "red" | "gray" | "blue";

const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
  blue: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
};

function Chip({ tone, children, testId }: { tone: ChipTone; children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Mode badge — LIVE (green) / BATCH (blue) / PAPER (amber). EXPERIMENT rides the BATCH badge. */
const MODE_TONE: Record<string, ChipTone> = { LIVE: "green", BATCH: "blue", PAPER: "yellow", EXPERIMENT: "blue" };
function ModeBadge({ umbrella }: { umbrella: DeploymentUmbrella }) {
  const label = umbrella === "EXPERIMENT" ? "batch·exp" : umbrella.toLowerCase();
  return (
    <Chip tone={MODE_TONE[umbrella] ?? "gray"} testId={`mode-badge-${umbrella}`}>
      {label}
    </Chip>
  );
}

/** Status badge tone — color-coded like RepoCi's CI status. */
function statusTone(status: DeploymentStatus): ChipTone {
  switch (status) {
    case "succeeded":
      return "green";
    case "running":
      return "blue";
    case "failed":
      return "red";
    case "stale":
      return "yellow";
    default:
      return "gray";
  }
}

/** Cloud badge — GCP (cyan) vs AWS (amber), matching the header cloud-toggle palette. */
function CloudBadge({ cloud }: { cloud: DeploymentCloud }) {
  return (
    <span
      data-testid={`cloud-badge-${cloud}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
        cloud === "GCP" ? TONE_CLASSES.blue : TONE_CLASSES.yellow
      }`}
    >
      <Cloud className="h-3 w-3" aria-hidden="true" />
      {cloud}
    </span>
  );
}

/** Kind icon — a VM (Server) vs a Cloud Run job (Workflow), so the unit type reads at a glance. */
function KindIcon({ kind }: { kind: DeploymentItem["kind"] }) {
  return kind === "VM" ? (
    <Server className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-label="VM" data-testid="kind-icon-VM" />
  ) : (
    <Workflow
      className="h-3.5 w-3.5 text-[var(--color-text-muted)]"
      aria-label="Cloud Run job"
      data-testid="kind-icon-CLOUD_RUN_JOB"
    />
  );
}

/** Exit-code cell — a non-zero (incl. 137=OOM) exit is highlighted red; 0 reads green; absent is "—". */
function ExitCodeCell({ exitCode }: { exitCode: number | null }) {
  if (exitCode == null) return <span className="text-[var(--color-text-muted)]">—</span>;
  if (exitCode === 0)
    return (
      <Chip tone="green" testId="exit-code">
        0
      </Chip>
    );
  return (
    <Chip tone="red" testId="exit-code">
      {exitCode === 137 ? "137 (OOM)" : exitCode}
    </Chip>
  );
}

function lastRunLabel(at: string | null): string {
  if (!at) return "—";
  // Compact ISO → "MM-DD HH:MM" (trim the year + seconds for density).
  return at.length >= 16 ? at.slice(5, 16).replace("T", " ") : at;
}

function heartbeatLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 90) return `${seconds}s`;
  const min = Math.round(seconds / 60);
  if (min < 90) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

/** Summary header — counts by status + last failure, aggregated across every mode in view. */
function DeploymentsSummaryHeader({ summary }: { summary: UmbrellaSummaryResponse | null }) {
  if (!summary) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]" data-testid="umbrella-summary-empty">
        No summary available.
      </p>
    );
  }
  const order: { key: string; tone: ChipTone; label: string }[] = [
    { key: "succeeded", tone: "green", label: "succeeded" },
    { key: "running", tone: "blue", label: "running" },
    { key: "failed", tone: "red", label: "failed" },
    { key: "stale", tone: "yellow", label: "stale" },
    { key: "unknown", tone: "gray", label: "unknown" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="umbrella-summary">
      <Chip tone="gray" testId="umbrella-total">
        {summary.total} target{summary.total === 1 ? "" : "s"}
      </Chip>
      {order.map(({ key, tone, label }) => {
        const n = summary.counts_by_status[key] ?? 0;
        if (n === 0) return null;
        return (
          <Chip key={key} tone={tone} testId={`summary-count-${key}`}>
            {n} {label}
          </Chip>
        );
      })}
      {summary.stale_count > 0 && (
        <Chip tone="yellow" testId="summary-stale">
          {summary.stale_count} stale
        </Chip>
      )}
      {summary.last_failure && (
        <span className="text-[11px] text-[var(--color-text-muted)]" data-testid="summary-last-failure">
          last failure: <span className="font-mono text-red-400">{summary.last_failure.name}</span>
          {summary.last_failure.exit_code != null ? ` (exit ${summary.last_failure.exit_code})` : ""}
          {summary.last_failure.last_run_at ? ` · ${lastRunLabel(summary.last_failure.last_run_at)}` : ""}
        </span>
      )}
    </div>
  );
}

/** Feed-health read (heartbeat proxy) — a recent heartbeat reads green, stale amber, absent gray.
 * Used only as a fallback when manifest-derived freshness (the `/freshness` endpoint) hasn't loaded. */
function feedHealthLabel(seconds: number | null): { label: string; tone: ChipTone } {
  if (seconds == null) return { label: "—", tone: "gray" };
  if (seconds < 90) return { label: "live", tone: "green" };
  if (seconds < 600) return { label: "lagging", tone: "yellow" };
  return { label: "stale", tone: "red" };
}

/**
 * Feed-health from the per-deployment MANIFEST-DERIVED freshness (GET /api/deployments/
 * {id}/freshness). The real per-shard freshness against the availability index of the
 * asset_group the deployment owns — NOT the in-memory health-ping. A `liveness_only`
 * deployment (gateway / control-plane) renders HONESTLY as such, never a false "fresh".
 */
function freshnessFeedLabel(
  fresh: DeploymentFreshnessResponse,
): { label: string; tone: ChipTone; title: string } | null {
  switch (fresh.freshness_status) {
    case "fresh":
      return { label: "fresh", tone: "green", title: fresh.detail };
    case "stale":
      return { label: "stale", tone: "red", title: fresh.detail };
    case "liveness_only":
      return { label: "liveness only", tone: "gray", title: fresh.detail };
    default:
      return null; // unknown → fall back to the heartbeat proxy
  }
}

// LIVE-row feed-health prefers manifest-derived freshness, looked up by row name from this
// map (populated by DeploymentsContent after the inventory loads). Non-live rows show "—".
const FreshnessContext = createContext<Record<string, DeploymentFreshnessResponse>>({});

// When the cockpit embeds the inventory it provides an `onDrill` so a row opens the
// per-target detail IN the cockpit (a slide-over) instead of navigating to /deployments/:name.
// Standalone (no provider) → the row is a Link to the detail page.
const DrillContext = createContext<((name: string) => void) | undefined>(undefined);

/** The single unified column set — one shape for every mode (sparse "—" where N/A). */
const UNIFIED_COLUMNS: { label: string; align?: "right" }[] = [
  { label: "Mode" },
  { label: "Target" },
  { label: "Cloud" },
  { label: "Service" },
  { label: "Asset group" },
  { label: "Status" },
  { label: "Last run" },
  { label: "Progress", align: "right" },
  { label: "Exit" },
  { label: "Feed health" },
  { label: "Controls" },
];

function TargetCell({ item }: { item: DeploymentItem }) {
  const onDrill = useContext(DrillContext);
  if (onDrill) {
    return (
      <td className="py-1.5">
        <button
          type="button"
          onClick={() => onDrill(item.name)}
          data-testid={`deployment-link-${item.name}`}
          className="inline-flex items-center gap-1.5 font-mono text-[var(--color-text-primary)] hover:underline"
        >
          <KindIcon kind={item.kind} />
          {item.name}
        </button>
      </td>
    );
  }
  return (
    <td className="py-1.5">
      <Link
        to={`/deployments/${encodeURIComponent(item.name)}`}
        data-testid={`deployment-link-${item.name}`}
        className="inline-flex items-center gap-1.5 font-mono text-[var(--color-text-primary)] hover:underline"
      >
        <KindIcon kind={item.kind} />
        {item.name}
      </Link>
    </td>
  );
}

function StatusCell({ item }: { item: DeploymentItem }) {
  // Heartbeat rides the status chip (its own column was a duplicate — retired in the merge).
  const hb = heartbeatLabel(item.heartbeat_age_seconds);
  return (
    <td className="py-1.5">
      <Chip tone={statusTone(item.status)} testId={`status-${item.name}`}>
        {item.status}
      </Chip>
      {hb && <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">hb {hb}</span>}
    </td>
  );
}

/** One unified row — every column, "—" where the mode doesn't populate a field. */
function DeploymentRow({ item }: { item: DeploymentItem }) {
  const freshnessByName = useContext(FreshnessContext);
  const rowCls = "border-b border-[var(--color-border-default)]/40 hover:bg-[var(--color-bg-secondary)]";

  // Feed-health is a LIVE-mode signal: prefer manifest freshness, fall back to the heartbeat proxy.
  const isLive = item.umbrella === "LIVE";
  const fresh = freshnessByName[item.name];
  const derived = fresh ? freshnessFeedLabel(fresh) : null;
  const feed = isLive
    ? (derived ?? { ...feedHealthLabel(item.heartbeat_age_seconds), title: "heartbeat proxy" })
    : null;

  return (
    <tr data-testid={`deployment-row-${item.name}`} className={rowCls}>
      <td className="py-1.5">
        <ModeBadge umbrella={item.umbrella} />
      </td>
      <TargetCell item={item} />
      <td className="py-1.5">
        <CloudBadge cloud={item.cloud} />
      </td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.service || "—"}</td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.asset_group || "—"}</td>
      <StatusCell item={item} />
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{lastRunLabel(item.last_run_at)}</td>
      <td className="py-1.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
        {item.captured_progress != null ? (
          item.captured_progress.toLocaleString()
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="py-1.5">
        <ExitCodeCell exitCode={item.exit_code} />
      </td>
      <td className="py-1.5" title={feed?.title}>
        {feed ? (
          <Chip tone={feed.tone} testId={`feed-health-${item.name}`}>
            {feed.label}
          </Chip>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="py-1.5">
        {item.kind === "VM" ? (
          <VmControls vmName={item.name} status={item.status} />
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
        )}
      </td>
    </tr>
  );
}

function DeploymentMatrix({ items }: { items: DeploymentItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-3" data-testid="deployment-matrix-empty">
        No deployments match the current filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="deployment-matrix">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-left">
            {UNIFIED_COLUMNS.map((c) => (
              <th key={c.label} className={`py-1.5 font-medium${c.align === "right" ? " text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <DeploymentRow key={`${item.kind}-${item.name}`} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Segmented filter control (mode / cloud / status / asset_group) — URL-param-backed so an alert can deep-link. */
function FilterSelect({
  testId,
  label,
  value,
  options,
  onChange,
}: {
  testId: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
      {label}
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] rounded px-1.5 py-1 text-xs text-[var(--color-text-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Status-filter chips — quick "isolate all failed / all succeeded / all stuck" toggles, with
 * the count beside each so the operator sees the spread at a glance. They drive the SAME
 * `status` filter the dropdown does. "Stuck" maps to `stale`. Counts come from the
 * summary's `counts_by_status` (the authoritative tally aggregated across every mode in view).
 */
const STATUS_CHIPS: { value: string; label: string; tone: ChipTone; countKey: string | null }[] = [
  { value: "", label: "All", tone: "gray", countKey: null },
  { value: "running", label: "Running", tone: "blue", countKey: "running" },
  { value: "succeeded", label: "Succeeded", tone: "green", countKey: "succeeded" },
  { value: "failed", label: "Failed", tone: "red", countKey: "failed" },
  { value: "stale", label: "Stuck", tone: "yellow", countKey: "stale" },
];

function StatusFilterChips({
  summary,
  active,
  onSelect,
}: {
  summary: UmbrellaSummaryResponse | null;
  active: string;
  onSelect: (value: string) => void;
}) {
  const total = summary?.total ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="status-filter-chips">
      {STATUS_CHIPS.map((chip) => {
        const count = chip.countKey == null ? total : (summary?.counts_by_status[chip.countKey] ?? 0);
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            aria-pressed={isActive}
            data-testid={`status-chip-${chip.value || "all"}`}
            onClick={() => onSelect(chip.value)}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border transition-colors ${
              isActive
                ? TONE_CLASSES[chip.tone]
                : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {chip.label}
            <span data-testid={`status-chip-count-${chip.value || "all"}`} className="font-mono opacity-80">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Aggregate per-mode summaries into one combined tally (for the all-modes view). */
function aggregateSummaries(sums: UmbrellaSummaryResponse[]): UmbrellaSummaryResponse | null {
  if (sums.length === 0) return null;
  if (sums.length === 1) return sums[0];
  const counts: Record<string, number> = {};
  let total = 0;
  let stale = 0;
  let lastFailure: UmbrellaLastFailure | null = null;
  for (const s of sums) {
    total += s.total;
    stale += s.stale_count;
    for (const [k, v] of Object.entries(s.counts_by_status)) counts[k] = (counts[k] ?? 0) + v;
    if (s.last_failure && (!lastFailure || (s.last_failure.last_run_at ?? "") > (lastFailure.last_run_at ?? ""))) {
      lastFailure = s.last_failure;
    }
  }
  return { umbrella: "LIVE", total, counts_by_status: counts, stale_count: stale, last_failure: lastFailure };
}

/**
 * DeploymentsContent — the chrome-less unified inventory surface (no `<main>`, no page
 * `<h1>`) so it can render standalone (the /deployments page wraps it) OR embedded inside
 * the cockpit Deployments tab. Shows EVERY mode in one flat table; Mode is a FILTER
 * (All / Live / Batch / Paper), not a tab.
 *
 * When `embedded` the mode/cloud/status filters live in LOCAL state (no URL writes) so they
 * can't collide with the cockpit's `?tab=` ownership; standalone reads/writes
 * `?umbrella=&cloud=&status=&asset_group=` for alert deep-links (`umbrella` = the mode filter).
 */
export function DeploymentsContent({
  embedded = false,
  onDrill,
}: {
  embedded?: boolean;
  onDrill?: (name: string) => void;
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Embedded filters live in local state (no URL writes); standalone reads/writes the URL.
  const [localMode, setLocalMode] = useState<ModeFilter>("");
  const [localCloud, setLocalCloud] = useState("");
  const [localStatus, setLocalStatus] = useState("");
  const [localAssetGroup, setLocalAssetGroup] = useState("");

  const urlMode = (searchParams.get("umbrella") ?? "").toUpperCase();
  const modeFilter: ModeFilter = embedded
    ? localMode
    : ["LIVE", "BATCH", "PAPER"].includes(urlMode)
      ? (urlMode as ModeFilter)
      : "";
  const cloudFilter = embedded ? localCloud : (searchParams.get("cloud")?.toUpperCase() ?? "");
  const statusFilter = embedded ? localStatus : (searchParams.get("status") ?? "");
  const assetGroupFilter = embedded ? localAssetGroup : (searchParams.get("asset_group") ?? "");

  const [items, setItems] = useState<DeploymentItem[]>([]);
  const [summary, setSummary] = useState<UmbrellaSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<Record<string, DeploymentFreshnessResponse>>({});

  const setParam = useCallback(
    (key: string, value: string) => {
      if (embedded) {
        if (key === "umbrella") setLocalMode(value as ModeFilter);
        else if (key === "cloud") setLocalCloud(value);
        else if (key === "status") setLocalStatus(value);
        else if (key === "asset_group") setLocalAssetGroup(value);
        return;
      }
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [embedded, setSearchParams],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const cloud = cloudFilter === "GCP" || cloudFilter === "AWS" ? (cloudFilter as DeploymentCloud) : undefined;
    const mode = modeFilter ? (modeFilter as DeploymentUmbrella) : undefined;
    // Summary: a single mode → its own summary; all modes → aggregate LIVE+BATCH+PAPER.
    const summaryP: Promise<UmbrellaSummaryResponse[]> = mode
      ? getUmbrellaSummary(mode).then((s) => [s])
      : Promise.all([getUmbrellaSummary("LIVE"), getUmbrellaSummary("BATCH"), getUmbrellaSummary("PAPER")]);
    Promise.all([
      getDeploymentInventory({
        umbrella: mode,
        cloud,
        status: statusFilter || undefined,
        asset_group: assetGroupFilter || undefined,
      }),
      summaryP,
    ])
      .then(([inv, sums]) => {
        setItems(inv.items);
        setSummary(aggregateSummaries(sums));
        // Enrich LIVE rows with manifest-derived per-deployment freshness (feed-health column).
        const liveRows = inv.items.filter((i) => i.umbrella === "LIVE");
        if (liveRows.length > 0) {
          void Promise.allSettled(liveRows.map((i) => getDeploymentFreshness(i.name))).then((results) => {
            const next: Record<string, DeploymentFreshnessResponse> = {};
            results.forEach((r) => {
              if (r.status === "fulfilled") next[r.value.deployment_id] = r.value;
            });
            setFreshness(next);
          });
        } else {
          setFreshness({});
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [modeFilter, cloudFilter, statusFilter, assetGroupFilter]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Asset-group options derive from the loaded items (plus any active filter value).
  const assetGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.asset_group) set.add(i.asset_group);
    if (assetGroupFilter) set.add(assetGroupFilter);
    return ["", ...Array.from(set).sort()];
  }, [items, assetGroupFilter]);

  return (
    <DrillContext.Provider value={onDrill}>
      <FreshnessContext.Provider value={freshness}>
        <div className="w-full" data-testid="deployments-page">
          <div className="flex items-center justify-between mb-4">
            {embedded ? (
              <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                live / batch / paper — every VM + Cloud Run job
              </span>
            ) : (
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                Deployments
                <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                  live · batch · paper (unified) — every VM + Cloud Run job
                </span>
              </h1>
            )}
            <button
              onClick={load}
              disabled={loading}
              aria-label="Refresh deployments"
              data-testid="deployments-refresh"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">Deployments</CardTitle>
              <div className="pt-2">
                <DeploymentsSummaryHeader summary={summary} />
              </div>
              {/* Status-filter chips — quick All / Running / Succeeded / Failed / Stuck toggles. */}
              <div className="pt-3">
                <StatusFilterChips summary={summary} active={statusFilter} onSelect={(v) => setParam("status", v)} />
              </div>
              {/* Filters — mode / cloud / status / asset_group, URL-param-backed for alert deep-links. */}
              <div className="flex flex-wrap items-center gap-3 pt-3" data-testid="deployment-filters">
                <FilterSelect
                  testId="filter-mode"
                  label="mode"
                  value={modeFilter}
                  onChange={(v) => setParam("umbrella", v)}
                  options={MODE_OPTIONS}
                />
                <FilterSelect
                  testId="filter-cloud"
                  label="cloud"
                  value={cloudFilter}
                  onChange={(v) => setParam("cloud", v)}
                  options={[
                    { value: "", label: "all" },
                    { value: "GCP", label: "GCP" },
                    { value: "AWS", label: "AWS" },
                  ]}
                />
                <FilterSelect
                  testId="filter-status"
                  label="status"
                  value={statusFilter}
                  onChange={(v) => setParam("status", v)}
                  options={[
                    { value: "", label: "all" },
                    { value: "succeeded", label: "succeeded" },
                    { value: "running", label: "running" },
                    { value: "failed", label: "failed" },
                    { value: "stale", label: "stale" },
                    { value: "unknown", label: "unknown" },
                  ]}
                />
                <FilterSelect
                  testId="filter-asset-group"
                  label="asset group"
                  value={assetGroupFilter}
                  onChange={(v) => setParam("asset_group", v)}
                  options={assetGroupOptions.map((ag) => ({ value: ag, label: ag || "all" }))}
                />
              </div>
            </CardHeader>
            <CardContent>
              {error && (
                <div
                  role="alert"
                  className="flex items-center gap-2 text-sm text-red-400 py-2"
                  data-testid="deployments-error"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {loading && items.length === 0 && !error && (
                <p className="text-sm text-[var(--color-text-muted)] py-2 flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…
                </p>
              )}
              {!error && <DeploymentMatrix items={items} />}
            </CardContent>
          </Card>
        </div>
      </FreshnessContext.Provider>
    </DrillContext.Provider>
  );
}

/**
 * Deployments — the standalone /repos-grade observability page. A thin `<main>` shell
 * around the chrome-less {@link DeploymentsContent} (URL-param-backed mode + filters for
 * alert deep-links). The cockpit embeds DeploymentsContent directly in its Deployments tab.
 */
export function Deployments() {
  return (
    <main className="w-full app-shell-gutter py-4">
      <DeploymentsContent />
    </main>
  );
}
