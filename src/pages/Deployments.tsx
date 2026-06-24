/**
 * Deployments — the /repos-grade observability surface for LIVE / BATCH / PAPER
 * deployments. Every compute unit (a VM or a Cloud Run job) is tracked under one
 * umbrella × cloud, mirroring the CI /repos matrix grade: umbrella tabs, a status
 * matrix (status badge, kind icon, GCP/AWS cloud badge, last-run, exit_code with
 * 137/non-zero highlight, captured progress), a per-umbrella summary header, and
 * URL-param-backed filters so an alert can deep-link
 * (`/deployments?umbrella=batch&cloud=gcp&status=failed`).
 *
 * Reuses the api-client + status-badge + table grade of RepoCi.tsx; per-target
 * drill-down (event timeline + live log tail) lives in DeploymentDetail.tsx.
 *
 * Plan: deployment_observability_parity_live_batch_paper_2026_06_22.md Phase 2.
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
  type UmbrellaSummaryResponse,
} from "../api/deploymentApi";
import { getDeploymentFreshness, type DeploymentFreshnessResponse } from "../api/health";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { VmControls } from "../components/VmControls";

// The umbrella tabs the operator sees — Experiment folds under Batch by default
// (the plan's umbrella-model table). A target classified EXPERIMENT therefore shows
// under the Batch tab so the surface stays a 3-tab Live/Batch/Paper view.
type UmbrellaTab = "LIVE" | "BATCH" | "PAPER";
const UMBRELLA_TABS: { id: UmbrellaTab; label: string }[] = [
  { id: "LIVE", label: "Live" },
  { id: "BATCH", label: "Batch" },
  { id: "PAPER", label: "Paper" },
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

/** Per-umbrella summary header — the /repos-overview equivalent: counts by status + last failure. */
function UmbrellaSummaryHeader({ summary }: { summary: UmbrellaSummaryResponse | null }) {
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

/** Feed-health read for LIVE: a recent heartbeat reads green, stale amber, absent gray.
 * This is the HEARTBEAT proxy — used only as a fallback when manifest-derived freshness
 * (the `/freshness` endpoint, preferred below) hasn't loaded for the row. */
function feedHealthLabel(seconds: number | null): { label: string; tone: ChipTone } {
  if (seconds == null) return { label: "—", tone: "gray" };
  if (seconds < 90) return { label: "live", tone: "green" };
  if (seconds < 600) return { label: "lagging", tone: "yellow" };
  return { label: "stale", tone: "red" };
}

/**
 * Feed-health from the per-deployment MANIFEST-DERIVED freshness (GET /api/deployments/
 * {id}/freshness). This is the real per-shard freshness against the availability index of
 * the asset_group the deployment owns — NOT the in-memory health-ping. A `liveness_only`
 * deployment (gateway / control-plane, no data-freshness obligation) renders HONESTLY as
 * such, never a false "fresh". `unknown` falls through to the heartbeat proxy.
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

// The LIVE-preset feed-health cell prefers manifest-derived freshness, looked up by row
// name from this map (populated by DeploymentsContent after the inventory loads). Standalone
// (no provider) → the heartbeat proxy is used (map is empty), unchanged.
const FreshnessContext = createContext<Record<string, DeploymentFreshnessResponse>>({});

/** The column header set for each dynamics preset. */
const PRESET_HEADERS: Record<DynamicsPreset, string[]> = {
  live: ["Target", "Cloud", "Service", "Status", "Uptime", "Heartbeat", "Feed health", "Controls"],
  batch: ["Target", "Cloud", "Asset group", "Status", "Progress", "Coverage %", "Exit"],
  paper: ["Strategy", "Cloud", "Service", "Status", "Recon drift", "Determinism ε", "Last run"],
  default: ["Target", "Cloud", "Service", "Asset group", "Status", "Last run", "Exit", "Progress"],
};

// When the cockpit embeds the inventory it provides an `onDrill` so a row opens the
// per-target detail IN the cockpit (a slide-over) instead of navigating to /deployments/:name.
// Standalone (no provider) → the row is a Link to the detail page (unchanged).
const DrillContext = createContext<((name: string) => void) | undefined>(undefined);

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

function DeploymentRow({ item, preset }: { item: DeploymentItem; preset: DynamicsPreset }) {
  const freshnessByName = useContext(FreshnessContext);
  const rowCls = "border-b border-[var(--color-border-default)]/40 hover:bg-[var(--color-bg-secondary)]";
  if (preset === "live") {
    // Prefer the per-deployment MANIFEST-derived freshness; fall back to the heartbeat proxy.
    const fresh = freshnessByName[item.name];
    const derived = fresh ? freshnessFeedLabel(fresh) : null;
    const feed = derived ?? { ...feedHealthLabel(item.heartbeat_age_seconds), title: "heartbeat proxy" };
    return (
      <tr data-testid={`deployment-row-${item.name}`} className={rowCls}>
        <TargetCell item={item} />
        <td className="py-1.5">
          <CloudBadge cloud={item.cloud} />
        </td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.service || "—"}</td>
        <StatusCell item={item} />
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
          {lastRunLabel(item.last_run_at)}
        </td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
          {heartbeatLabel(item.heartbeat_age_seconds) ?? "—"}
        </td>
        <td className="py-1.5" title={feed.title}>
          <Chip tone={feed.tone} testId={`feed-health-${item.name}`}>
            {feed.label}
          </Chip>
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
  if (preset === "batch") {
    const coverage = item.captured_progress != null ? `${item.captured_progress}%` : "—";
    return (
      <tr data-testid={`deployment-row-${item.name}`} className={rowCls}>
        <TargetCell item={item} />
        <td className="py-1.5">
          <CloudBadge cloud={item.cloud} />
        </td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.asset_group || "—"}</td>
        <StatusCell item={item} />
        <td className="py-1.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
          {item.captured_progress != null ? `${item.captured_progress}` : "—"}
        </td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{coverage}</td>
        <td className="py-1.5">
          <ExitCodeCell exitCode={item.exit_code} />
        </td>
      </tr>
    );
  }
  if (preset === "paper") {
    // Paper recon-drift / determinism-ε are reconciliation outputs not yet on the inventory
    // item (Phase 2 of the citadel recon plan emits them); surface "—" until wired, so the
    // column shape is correct without faking a value.
    return (
      <tr data-testid={`deployment-row-${item.name}`} className={rowCls}>
        <TargetCell item={item} />
        <td className="py-1.5">
          <CloudBadge cloud={item.cloud} />
        </td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.service || "—"}</td>
        <StatusCell item={item} />
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-muted)]">—</td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-muted)]">—</td>
        <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
          {lastRunLabel(item.last_run_at)}
        </td>
      </tr>
    );
  }
  // default — the full matrix shape (standalone /deployments page).
  return (
    <tr data-testid={`deployment-row-${item.name}`} className={rowCls}>
      <TargetCell item={item} />
      <td className="py-1.5">
        <CloudBadge cloud={item.cloud} />
      </td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.service || "—"}</td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.asset_group || "—"}</td>
      <StatusCell item={item} />
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{lastRunLabel(item.last_run_at)}</td>
      <td className="py-1.5">
        <ExitCodeCell exitCode={item.exit_code} />
      </td>
      <td className="py-1.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
        {item.captured_progress != null ? `${item.captured_progress}` : "—"}
      </td>
    </tr>
  );
}

function DeploymentMatrix({ items, preset }: { items: DeploymentItem[]; preset: DynamicsPreset }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-3" data-testid="deployment-matrix-empty">
        No deployments match the current filters.
      </p>
    );
  }
  const headers = PRESET_HEADERS[preset];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="deployment-matrix">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-left">
            {headers.map((h, i) => (
              <th
                key={h}
                className={`py-1.5 font-medium${i === headers.length - 1 && preset === "default" ? " text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <DeploymentRow key={`${item.kind}-${item.name}`} item={item} preset={preset} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Segmented filter control (cloud / status) — URL-param-backed so an alert can deep-link. */
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

/** Per-umbrella column preset — the operator wants live/batch/paper to read as their
 * DISTINCT dynamics, not one matrix shape (plan Phase 2). One inventory source, three
 * presets: LIVE → uptime/heartbeat/feed-health; BATCH → progress/coverage/exit-code;
 * PAPER → recon-drift/determinism-ε/last-recon. */
export type DynamicsPreset = "live" | "batch" | "paper" | "default";

/**
 * DeploymentsContent — the chrome-less inventory surface (no `<main>`, no page `<h1>`)
 * so it can render standalone (the /deployments page wraps it) OR embedded inside a
 * cockpit tab. When `fixedUmbrella` is set the umbrella is driven by the PROP (a cockpit
 * Live/Batch/Paper tab owns it) and the cloud/status/asset_group filters live in LOCAL
 * state — it does NOT touch `?umbrella=`/`?tab=` so it can't collide with the cockpit's
 * `?tab=` ownership. Without `fixedUmbrella` it is the full URL-param-backed standalone
 * page (alert deep-links `/deployments?umbrella=batch&cloud=gcp&status=failed`).
 */
export function DeploymentsContent({
  fixedUmbrella,
  preset,
  onDrill,
}: {
  fixedUmbrella?: UmbrellaTab;
  preset?: DynamicsPreset;
  onDrill?: (name: string) => void;
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const embedded = fixedUmbrella != null;

  // Embedded filters live in local state (no URL writes) to avoid colliding with the
  // cockpit's `?tab=` ownership; standalone reads/writes the URL for alert deep-links.
  const [localCloud, setLocalCloud] = useState("");
  const [localStatus, setLocalStatus] = useState("");
  const [localAssetGroup, setLocalAssetGroup] = useState("");

  // URL is the source of truth for the umbrella tab + filters (deep-linkable from an alert)
  // ONLY when standalone; embedded uses the prop + local state.
  const umbrellaParam = (searchParams.get("umbrella") ?? "live").toUpperCase();
  const activeTab: UmbrellaTab = embedded
    ? fixedUmbrella
    : ["LIVE", "BATCH", "PAPER"].includes(umbrellaParam)
      ? (umbrellaParam as UmbrellaTab)
      : "LIVE";
  const cloudFilter = embedded ? localCloud : (searchParams.get("cloud")?.toUpperCase() ?? "");
  const statusFilter = embedded ? localStatus : (searchParams.get("status") ?? "");
  const assetGroupFilter = embedded ? localAssetGroup : (searchParams.get("asset_group") ?? "");

  const [items, setItems] = useState<DeploymentItem[]>([]);
  const [summary, setSummary] = useState<UmbrellaSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-deployment manifest-derived freshness for the LIVE preset (keyed by row name).
  const [freshness, setFreshness] = useState<Record<string, DeploymentFreshnessResponse>>({});

  // The active dynamics column preset — explicit prop, else derived from the umbrella.
  const activePreset: DynamicsPreset = preset ?? (embedded ? (activeTab.toLowerCase() as DynamicsPreset) : "default");

  const setParam = useCallback(
    (key: string, value: string) => {
      if (embedded) {
        if (key === "cloud") setLocalCloud(value);
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
    Promise.all([
      getDeploymentInventory({
        umbrella: activeTab,
        cloud,
        status: statusFilter || undefined,
        asset_group: assetGroupFilter || undefined,
      }),
      getUmbrellaSummary(activeTab),
    ])
      .then(([inv, sum]) => {
        // EXPERIMENT folds under Batch — if the backend returns it as a distinct umbrella on the
        // BATCH query it already arrives here; the inventory route honours the umbrella filter, so
        // a defensive client-side keep of LIVE/BATCH/PAPER+EXPERIMENT under the active tab.
        const keep: DeploymentUmbrella[] =
          activeTab === "BATCH" ? ["BATCH", "EXPERIMENT"] : [activeTab as DeploymentUmbrella];
        const kept = inv.items.filter((i) => keep.includes(i.umbrella));
        setItems(kept);
        setSummary(sum);
        // For the LIVE preset, enrich rows with manifest-derived per-deployment freshness
        // (the feed-health column reads it, falling back to the heartbeat proxy on failure).
        if (activeTab === "LIVE" && kept.length > 0) {
          void Promise.allSettled(kept.map((i) => getDeploymentFreshness(i.name))).then((results) => {
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
  }, [activeTab, cloudFilter, statusFilter, assetGroupFilter]);

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
                {UMBRELLA_TABS.find((t) => t.id === activeTab)?.label} deployments — every VM + Cloud Run job
              </span>
            ) : (
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                Deployments
                <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                  live / batch / paper — every VM + Cloud Run job
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

          {/* Umbrella tabs — Live / Batch / Paper (Experiment folds under Batch). Hidden when
          embedded in a cockpit Live/Batch/Paper tab (the cockpit tab IS the umbrella). */}
          {!embedded && (
            <div className="inline-flex items-center gap-1 mb-4" data-testid="umbrella-tabs">
              {UMBRELLA_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`umbrella-tab-${t.id}`}
                  aria-pressed={activeTab === t.id}
                  onClick={() => setParam("umbrella", t.id.toLowerCase())}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    activeTab === t.id
                      ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-400"
                      : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {UMBRELLA_TABS.find((t) => t.id === activeTab)?.label} deployments
              </CardTitle>
              <div className="pt-2">
                <UmbrellaSummaryHeader summary={summary} />
              </div>
              {/* Filters — cloud / status / asset_group, URL-param-backed for alert deep-links. */}
              <div className="flex flex-wrap items-center gap-3 pt-3" data-testid="deployment-filters">
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
              {!error && <DeploymentMatrix items={items} preset={activePreset} />}
            </CardContent>
          </Card>
        </div>
      </FreshnessContext.Provider>
    </DrillContext.Provider>
  );
}

/**
 * Deployments — the standalone /repos-grade observability page. A thin `<main>` shell
 * around the chrome-less {@link DeploymentsContent} (URL-param-backed umbrella tabs +
 * filters for alert deep-links). The cockpit embeds DeploymentsContent directly per tab.
 */
export function Deployments() {
  return (
    <main className="w-full app-shell-gutter py-4">
      <DeploymentsContent />
    </main>
  );
}
