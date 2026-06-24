/**
 * Cockpit — the unified deployment & health observability surface, and the DEFAULT
 * page of the deployment UI.
 *
 * The single place to answer "is everything OK right now?" across LIVE / PAPER /
 * BATCH deployments AND fleet health (every VM accounted for GCP+AWS incl. the
 * agent-orchestrator control plane, manifest consolidators, data coverage, CI,
 * GitHub, tri-cloud billing, alerts) — plus deploy NEW work (batch/live/paper ×
 * GCP/AWS) without leaving the page. The premise: a Slack alert → click here →
 * drill into the failing tile → stream logs → redeploy.
 *
 * IA (operator-confirmed 2026-06-23):
 *   Health(landing tile grid = the health home) · Deploy · Live · Batch · Paper ·
 *   Fleet(every VM incl. orchestrator) · Consolidators.
 * "Health" is the landing — the at-a-glance rollup; the per-domain tabs are its
 * drill-downs (Live = live-deployment uptime/heartbeat; Batch = progress/coverage;
 * Paper = recon/determinism; Fleet = every-VM-accounted-for; Consolidators = per-AG).
 *
 * SCAFFOLD STAGE: ships the full IA with PLACEHOLDER data first so the format +
 * navigation are visible; each pane is then wired to its real endpoint pane-by-pane.
 * Every placeholder names the endpoint/phase that will replace it (PlaceholderNote).
 * Reuses the existing Card + status-chip grade + design tokens (no new components).
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md (parent_epic observability_master).
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  CircleDollarSign,
  Database,
  GitBranch,
  Github,
  Layers,
  Radio,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { DeploymentsContent } from "./Deployments";
import { VmDeploymentsContent } from "./VmDeployments";
import { RepoCiContent } from "./RepoCi";
import { AlertsLogsTab } from "../components/cockpit/AlertsLogsTab";
import { ChaosContent } from "./Chaos";
import { SafetyOpsContent } from "./SafetyOps";
import { LaunchTab } from "../components/cockpit/LaunchTab";
import { DeployConsole } from "../components/cockpit/DeployConsole";
import {
  getFleetReconciliation,
  getHealthConsolidator,
  getHealthOverview,
  type FleetReconciliationResponse,
  type HealthConsolidatorResponse,
  type HealthOverviewResponse,
  type HealthStatus,
} from "../api/health";
import { getUmbrellaSummary, type UmbrellaSummaryResponse } from "../api/deploymentApi";

// ---------------------------------------------------------------------------
// Shared status vocabulary — mirrors the Deployments page chip tones so the
// whole cockpit reads consistently. `placeholder` renders muted until wired.
// ---------------------------------------------------------------------------

type TileStatus = "ok" | "degraded" | "critical" | "placeholder";

const STATUS_TONE: Record<TileStatus, string> = {
  ok: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  degraded: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  critical: "bg-red-500/15 text-red-400 border-red-500/40",
  placeholder: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const STATUS_LABEL: Record<TileStatus, string> = {
  ok: "OK",
  degraded: "DEGRADED",
  critical: "CRITICAL",
  placeholder: "—",
};

function StatusChip({ status, testId }: { status: TileStatus; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Health landing — the "see current state of everything" tile grid. This IS the
// health home (operator-confirmed). Each tile links to where the live data lives
// (a cockpit drill tab or an existing page). Status is `placeholder` until the
// rollup endpoint (GET /api/health/overview) lands in Phase 1.
// ---------------------------------------------------------------------------

type Tile = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: TileStatus;
  metric: string;
  to: string;
};

const HEALTH_TILES: Tile[] = [
  {
    id: "live",
    label: "Live Deployments",
    icon: Radio,
    status: "placeholder",
    metric: "uptime · heartbeat · feed health",
    to: "/cockpit?tab=live",
  },
  {
    id: "batch",
    label: "Batch Deployments",
    icon: Boxes,
    status: "placeholder",
    metric: "progress · coverage · exit codes",
    to: "/cockpit?tab=batch",
  },
  {
    id: "paper",
    label: "Paper Deployments",
    icon: Layers,
    status: "placeholder",
    metric: "recon drift · determinism ε",
    to: "/cockpit?tab=paper",
  },
  {
    id: "fleet",
    label: "Fleet VMs (GCP+AWS)",
    icon: Server,
    status: "placeholder",
    metric: "running · zombie · OOM · unknown · incl. orchestrator",
    to: "/cockpit?tab=fleet",
  },
  {
    id: "consolidators",
    label: "Manifest Consolidators",
    icon: Database,
    status: "placeholder",
    metric: "index age · shard fallback",
    to: "/cockpit?tab=consolidators",
  },
  {
    id: "coverage",
    label: "Data Coverage",
    icon: BarChart2,
    status: "placeholder",
    metric: "% captured per asset_group",
    to: "/deployments",
  },
  {
    id: "ci",
    label: "CI / Repos",
    icon: GitBranch,
    status: "placeholder",
    metric: "last-green · promotion lag",
    to: "/repos",
  },
  {
    id: "github",
    label: "GitHub Health",
    icon: Github,
    status: "placeholder",
    metric: "rate-limit · Actions minutes",
    to: "/repos",
  },
  {
    id: "billing",
    label: "Billing (GitHub+GCP+AWS)",
    icon: CircleDollarSign,
    status: "placeholder",
    metric: "tri-cloud spend · budget wall",
    to: "/ops/costs",
  },
  { id: "alerts", label: "Alerts", icon: AlertTriangle, status: "placeholder", metric: "open by class", to: "/alerts" },
];

// Consoles & tools — entry points to the existing wired pages that are folding INTO
// cockpit tabs (Phase 0.7). Linked here so they're reachable from the cockpit once the
// duplicate top-nav links are removed; each becomes its own embedded tab next.
const CONSOLES: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; to: string }[] = [
  { id: "vm-deployments", label: "VM Deployments", icon: Server, to: "/vm-deployments" },
  { id: "live-ops", label: "Live Ops", icon: Radio, to: "/ops/live-deployments" },
  { id: "chaos", label: "Chaos (resilience testing)", icon: AlertTriangle, to: "/chaos" },
  { id: "safety-ops", label: "Safety Ops", icon: ShieldCheck, to: "/safety-ops" },
  { id: "ml", label: "ML Experiments", icon: BarChart2, to: "/research/ml-experiments" },
  { id: "strategy", label: "Strategy Backtests", icon: GitBranch, to: "/research/strategy-backtests" },
  { id: "exec-bt", label: "Execution Backtests", icon: Boxes, to: "/research/execution-backtests" },
];

// Cockpit-tile id → backend health-overview tile id (the rollup names a subset of the
// landing tiles). The rest (live/batch/paper) are filled from the umbrella summaries.
const OVERVIEW_TILE_BY_COCKPIT_ID: Record<string, string> = {
  fleet: "fleet",
  consolidators: "consolidator",
  coverage: "coverage",
  alerts: "alerts",
  github: "gh_budget",
  billing: "cost",
};

const OVERALL_TONE: Record<HealthStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  degraded: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  critical: "border-red-500/40 bg-red-500/10 text-red-400",
};
const OVERALL_LABEL: Record<HealthStatus, string> = {
  ok: "ALL SYSTEMS OK",
  degraded: "DEGRADED",
  critical: "CRITICAL",
};

/** Derive a live/batch/paper tile's status + one-line value from its umbrella summary. */
function umbrellaTile(summary: UmbrellaSummaryResponse): { status: TileStatus; value: string } {
  const running = summary.counts_by_status.running ?? 0;
  const failed = summary.counts_by_status.failed ?? 0;
  const status: TileStatus =
    summary.last_failure || failed > 0 ? "critical" : summary.stale_count > 0 ? "degraded" : "ok";
  const value = `${summary.total} targets · ${running} running · ${summary.stale_count} stale${failed > 0 ? ` · ${failed} failed` : ""}`;
  return { status, value };
}

const UMBRELLA_BY_TILE_ID: Record<string, "LIVE" | "BATCH" | "PAPER"> = {
  live: "LIVE",
  batch: "BATCH",
  paper: "PAPER",
};

/** Minimal CI-overview shape the health tile needs (the CI tab consumes the full payload). */
interface CiOverviewLite {
  repos: unknown[];
  stuck_prs: unknown[];
  promotion_blocked: unknown[];
}

async function getCiOverviewLite(): Promise<CiOverviewLite> {
  const base = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";
  const res = await fetch(`${base}/api/repo-ci/overview`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CiOverviewLite>;
}

function ciTile(ci: CiOverviewLite): { status: TileStatus; value: string } {
  const repos = ci.repos?.length ?? 0;
  const stuck = ci.stuck_prs?.length ?? 0;
  const blocked = ci.promotion_blocked?.length ?? 0;
  const status: TileStatus = blocked > 0 ? "critical" : stuck > 0 ? "degraded" : "ok";
  return { status, value: `${repos} repos · ${stuck} stuck PRs · ${blocked} blocked promotions` };
}

function HealthTab() {
  const [overview, setOverview] = useState<HealthOverviewResponse | null>(null);
  const [umbrellas, setUmbrellas] = useState<Record<string, UmbrellaSummaryResponse>>({});
  const [ci, setCi] = useState<CiOverviewLite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const [ovr, live, batch, paper, ciRes] = await Promise.allSettled([
        getHealthOverview(),
        getUmbrellaSummary("LIVE"),
        getUmbrellaSummary("BATCH"),
        getUmbrellaSummary("PAPER"),
        getCiOverviewLite(),
      ]);
      if (cancelled) return;
      if (ovr.status === "fulfilled") {
        setOverview(ovr.value);
      } else {
        setError(ovr.reason instanceof Error ? ovr.reason.message : "health overview unavailable");
      }
      const next: Record<string, UmbrellaSummaryResponse> = {};
      if (live.status === "fulfilled") next.LIVE = live.value;
      if (batch.status === "fulfilled") next.BATCH = batch.value;
      if (paper.status === "fulfilled") next.PAPER = paper.value;
      setUmbrellas(next);
      if (ciRes.status === "fulfilled") setCi(ciRes.value);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const overviewById = new Map((overview?.tiles ?? []).map((t) => [t.id, t]));

  return (
    <div data-testid="cockpit-health">
      {error && !overview ? (
        <div
          data-testid="cockpit-health-error"
          className="mb-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Health rollup unavailable — <code className="font-mono">GET /api/health/overview</code> failed ({error}).
            Tiles still link to their drill-downs.
          </span>
        </div>
      ) : overview ? (
        <div
          data-testid="cockpit-health-overall"
          className={`mb-4 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${OVERALL_TONE[overview.overall]}`}
        >
          <span className="font-semibold tracking-wide">{OVERALL_LABEL[overview.overall]}</span>
          <span className="text-[var(--color-text-tertiary)]">
            live rollup · updated {new Date(overview.generated_at).toLocaleTimeString()}
          </span>
        </div>
      ) : (
        <div
          data-testid="cockpit-health-loading"
          className="mb-4 rounded-md border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]"
        >
          {loading ? "Loading health rollup…" : "—"}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {HEALTH_TILES.map((tile) => {
          const Icon = tile.icon;
          // Overlay real data: overview rollup tiles, then live/batch/paper from umbrella summaries.
          const backend = overviewById.get(OVERVIEW_TILE_BY_COCKPIT_ID[tile.id] ?? "");
          const umbrellaKey = UMBRELLA_BY_TILE_ID[tile.id];
          const umbrella = umbrellaKey ? umbrellas[umbrellaKey] : undefined;
          let status: TileStatus = tile.status;
          let metric: string = tile.metric;
          if (backend) {
            status = backend.status;
            metric = backend.value;
          } else if (umbrella) {
            const derived = umbrellaTile(umbrella);
            status = derived.status;
            metric = derived.value;
          } else if (tile.id === "ci" && ci) {
            const derived = ciTile(ci);
            status = derived.status;
            metric = derived.value;
          }
          return (
            <Link key={tile.id} to={tile.to} data-testid={`cockpit-tile-${tile.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-[var(--color-accent-cyan)]/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
                        <Icon className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                      </span>
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{tile.label}</span>
                    </div>
                    <StatusChip status={status} testId={`cockpit-tile-status-${tile.id}`} />
                  </div>
                  <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{metric}</p>
                  <span className="mt-2 inline-block text-xs font-medium text-[var(--color-accent-cyan)] opacity-0 transition-opacity group-hover:opacity-100">
                    Open →
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-6" data-testid="cockpit-consoles">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Consoles & tools <span className="font-normal normal-case">— folding into cockpit tabs (Phase 0.7)</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {CONSOLES.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.id}
                to={c.to}
                data-testid={`cockpit-console-${c.id}`}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:border-[var(--color-accent-cyan)]/50 hover:text-[var(--color-text-primary)]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-cyan)]" />
                <span className="truncate">{c.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deploy — deploy NEW work without leaving the cockpit. The existing DeployForm
// already supports batch/live (mode) × GCP/AWS (cloud) × paper (runtime_profile),
// so Phase 2 embeds a service-picker + DeployForm here. The scaffold shows the
// three umbrella entry points + links to the working deploy console.
// ---------------------------------------------------------------------------

function DeployTab() {
  const umbrellas: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
    { id: "batch", label: "Deploy Batch", icon: Boxes, hint: "mode=batch · GCP/AWS · VM or Cloud Run" },
    { id: "live", label: "Deploy Live", icon: Radio, hint: "mode=live · runtime_profile=prod · GCP/AWS" },
    { id: "paper", label: "Deploy Paper", icon: Layers, hint: "mode=live · runtime_profile=paper · GCP/AWS" },
  ];
  return (
    <div data-testid="cockpit-deploy">
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {umbrellas.map((u) => {
          const Icon = u.icon;
          return (
            <Card key={u.id} data-testid={`cockpit-deploy-${u.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                  {u.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-[var(--color-text-tertiary)]">
                <p>{u.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {/* The embedded deploy console: launch / rollback (DeployForm + BuildSelector) + build &
          deployment history — REUSING the existing components (Phase 6). */}
      <DeployConsole />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet reconciliation — "every VM accounted for" across GCP+AWS, INCLUDING the
// agent-orchestrator control-plane VMs (a Purpose column distinguishes trading vs
// dev-automation). UNKNOWN (running but unregistered) and EXPECTED-MISSING
// (registered but not running) are the two alarm rows. Wires to
// GET /api/fleet/reconciliation in Phase 4.
// ---------------------------------------------------------------------------

function FleetTab() {
  const [recon, setRecon] = useState<FleetReconciliationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getFleetReconciliation();
        if (!cancelled) setRecon(r);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "reconciliation unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const running = (recon?.clouds ?? []).reduce((a, c) => a + c.running, 0);
  const unknownTotal = recon?.unknown_total ?? 0;
  const missingTotal = recon?.expected_missing_total ?? 0;
  const accounted = Math.max(0, running - unknownTotal);
  const cards: { id: string; label: string; status: TileStatus; value: string; hint: string }[] = recon
    ? [
        {
          id: "accounted",
          label: "Accounted for",
          status: "ok",
          value: `${accounted}`,
          hint: "running ∩ registered/control-plane",
        },
        {
          id: "unknown",
          label: "Unknown (running, unregistered)",
          status: unknownTotal > 0 ? "critical" : "ok",
          value: `${unknownTotal}`,
          hint: "alarm: classify or kill",
        },
        {
          id: "missing",
          label: "Expected-missing (registered, not running)",
          status: missingTotal > 0 ? "degraded" : "ok",
          value: `${missingTotal}`,
          hint: "registered but not running (relaunch / de-register / reap)",
        },
      ]
    : [
        { id: "accounted", label: "Accounted for", status: "placeholder", value: "—", hint: "running ∩ registered" },
        {
          id: "unknown",
          label: "Unknown (running, unregistered)",
          status: "placeholder",
          value: "—",
          hint: "alarm: classify or kill",
        },
        {
          id: "missing",
          label: "Expected-missing (registered, not running)",
          status: "placeholder",
          value: "—",
          hint: "alarm: relaunch or de-register",
        },
      ];

  return (
    <div data-testid="cockpit-fleet">
      {error ? (
        <div
          data-testid="cockpit-fleet-error"
          className="mb-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Reconciliation unavailable — <code className="font-mono">GET /api/fleet/reconciliation</code> failed (
            {error}
            ). The census table below is still real.
          </span>
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {cards.map((c) => (
          <Card key={c.id} data-testid={`cockpit-fleet-card-${c.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {c.label}
                <StatusChip status={c.status} testId={`cockpit-fleet-status-${c.id}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className="text-2xl font-semibold text-[var(--color-text-primary)]"
                data-testid={`cockpit-fleet-value-${c.id}`}
              >
                {c.value}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {/* The real VM census (active + recent archive) — the every-VM-accounted-for table.
          The cross-cloud reconciliation alarm rows (UNKNOWN / EXPECTED-MISSING) wire to
          GET /api/fleet/reconciliation in Phase 4; the census below is REAL today. */}
      <VmDeploymentsContent compact />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consolidators — per-asset_group manifest-consolidator health drill-down.
// Wires to GET /api/health/consolidator in Phase 1.
// ---------------------------------------------------------------------------

const ASSET_GROUPS = ["cefi", "defi", "tradfi", "sports", "prediction"] as const;

function fmtAge(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function ConsolidatorsTab() {
  const [data, setData] = useState<HealthConsolidatorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getHealthConsolidator();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "consolidator health unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byAg = new Map((data?.asset_groups ?? []).map((a) => [a.asset_group, a]));

  return (
    <div data-testid="cockpit-consolidators">
      {error ? (
        <div
          data-testid="cockpit-consolidators-error"
          className="mb-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Consolidator health unavailable — <code className="font-mono">GET /api/health/consolidator</code> failed (
            {error}).
          </span>
        </div>
      ) : data ? (
        <div
          data-testid="cockpit-consolidators-overall"
          className={`mb-4 flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${OVERALL_TONE[data.overall]}`}
        >
          <span className="font-semibold tracking-wide">{OVERALL_LABEL[data.overall]}</span>
          <span className="text-[var(--color-text-tertiary)]">
            per-asset_group manifest-index freshness · updated {new Date(data.generated_at).toLocaleTimeString()}
          </span>
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
          {loading ? "Loading consolidator health…" : "—"}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ASSET_GROUPS.map((ag) => {
          const real = byAg.get(ag);
          const status: TileStatus = real ? real.status : "placeholder";
          return (
            <Card key={ag} data-testid={`cockpit-consolidator-${ag}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                    {ag}
                  </span>
                  <StatusChip status={status} testId={`cockpit-consolidator-status-${ag}`} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-[var(--color-text-tertiary)] space-y-1">
                <p>
                  index age:{" "}
                  <span className="text-[var(--color-text-secondary)]">
                    {real ? `${fmtAge(real.index_age_seconds)} (budget ${fmtAge(real.staleness_budget_seconds)})` : "—"}
                  </span>
                </p>
                <p>per-VM shard fallback: {real ? (real.per_vm_shard_fallback_active ? "ACTIVE ⚠️" : "no") : "—"}</p>
                <p>
                  last successful run:{" "}
                  {real?.last_successful_run_at ? new Date(real.last_successful_run_at).toLocaleTimeString() : "—"}
                </p>
                {real?.detail ? <p className="pt-1 text-[var(--color-text-tertiary)]/80">{real.detail}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const COCKPIT_TABS = [
  { id: "health", label: "Health", icon: ShieldCheck },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "live", label: "Live", icon: Radio },
  { id: "batch", label: "Batch", icon: Boxes },
  { id: "paper", label: "Paper", icon: Layers },
  { id: "fleet", label: "Fleet", icon: Server },
  { id: "consolidators", label: "Consolidators", icon: Database },
  { id: "ci", label: "CI", icon: GitBranch },
  { id: "alerts", label: "Alerts & Logs", icon: AlertTriangle },
  { id: "launch", label: "Launch", icon: Rocket },
  { id: "chaos", label: "Chaos", icon: AlertTriangle },
  { id: "safety", label: "Safety Ops", icon: ShieldCheck },
] as const;

type CockpitTabId = (typeof COCKPIT_TABS)[number]["id"];

const VALID_TABS = new Set<string>(COCKPIT_TABS.map((t) => t.id));

export function Cockpit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tab") ?? "health";
  const activeTab: CockpitTabId = (VALID_TABS.has(raw) ? raw : "health") as CockpitTabId;

  const onTabChange = useCallback(
    (tab: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <main className="w-full app-shell-gutter py-4" data-testid="cockpit-page">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
          <ShieldCheck className="h-5 w-5 text-[var(--color-accent-cyan)]" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">Cockpit</h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            unified deployment & health observability — health · deploy · live · paper · batch · fleet
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
        <TabsList variant="pill" className="grid w-full grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 mb-6">
          {COCKPIT_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2" data-testid={`cockpit-tab-${t.id}`}>
                <Icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="health">
          <HealthTab />
        </TabsContent>
        <TabsContent value="deploy">
          <DeployTab />
        </TabsContent>
        <TabsContent value="live">
          <div data-testid="cockpit-live">
            <DeploymentsContent fixedUmbrella="LIVE" />
          </div>
        </TabsContent>
        <TabsContent value="batch">
          <div data-testid="cockpit-batch">
            <DeploymentsContent fixedUmbrella="BATCH" />
          </div>
        </TabsContent>
        <TabsContent value="paper">
          <div data-testid="cockpit-paper">
            <DeploymentsContent fixedUmbrella="PAPER" />
          </div>
        </TabsContent>
        <TabsContent value="fleet">
          <FleetTab />
        </TabsContent>
        <TabsContent value="consolidators">
          <ConsolidatorsTab />
        </TabsContent>
        <TabsContent value="ci">
          <div data-testid="cockpit-ci">
            <RepoCiContent />
          </div>
        </TabsContent>
        <TabsContent value="alerts">
          <div data-testid="cockpit-alerts">
            <AlertsLogsTab />
          </div>
        </TabsContent>
        <TabsContent value="launch">
          <div data-testid="cockpit-launch">
            <LaunchTab />
          </div>
        </TabsContent>
        <TabsContent value="chaos">
          <div data-testid="cockpit-chaos">
            <ChaosContent />
          </div>
        </TabsContent>
        <TabsContent value="safety">
          <div data-testid="cockpit-safety">
            <SafetyOpsContent />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
