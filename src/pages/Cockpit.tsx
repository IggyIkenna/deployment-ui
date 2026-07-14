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

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  CircleDollarSign,
  Clock,
  Database,
  GitBranch,
  Github,
  HelpCircle,
  Layers,
  Radio,
  Rocket,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Markdown } from "../components/Markdown";
import consolidatorsHelpDoc from "../docs/consolidators-help.md?raw";
import { DeploymentsContent } from "./Deployments";
import { DeploymentDetail } from "./DeploymentDetail";
import { VmDeploymentsContent } from "./VmDeployments";
import { FleetOrphansContent } from "./FleetOrphans";
import { LiveDeploymentsContent } from "./LiveDeployments";
import { FleetInfraContent } from "./FleetInfra";
import { FleetGitContent } from "./FleetGit";
import { RepoCiContent } from "./RepoCi";
import { AlertsLogsTab } from "../components/cockpit/AlertsLogsTab";
import { ChaosContent } from "./Chaos";
import { SafetyOpsContent } from "./SafetyOps";
import { LaunchTab } from "../components/cockpit/LaunchTab";
import { DeployConsole } from "../components/cockpit/DeployConsole";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";
import {
  getDeploymentFreshness,
  getFleetReconciliation,
  getHealthConsolidator,
  getHealthOverview,
  type DeploymentFreshnessResponse,
  type FleetReconciliationResponse,
  type ConsolidatorHealth,
  type ConsolidatorVerdict,
  type HealthConsolidatorResponse,
  type HealthOverviewResponse,
  type HealthStatus,
} from "../api/health";
import { getDeploymentInventory, getUmbrellaSummary, type UmbrellaSummaryResponse } from "../api/deploymentApi";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis } from "recharts";
import { TOOLTIP_STYLE } from "../lib/chart-theme";

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
    id: "deployments",
    label: "Deployments (live+batch+paper)",
    icon: Boxes,
    status: "placeholder",
    metric: "targets · running · stale · failed — one flat grid",
    to: "/cockpit?tab=deployments",
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
    // The data-status surface is the per-service home-shell tab (deep-linkable via
    // /service/{name}/data-status — ServiceUrlSync). market-tick-data-service is the
    // canonical availability-manifest owner, so the coverage drill lands there (NOT the
    // generic /deployments inventory, which carries no %-captured-per-asset_group view).
    to: "/service/market-tick-data-service/data-status",
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

/** Derive the merged Deployments tile (status + one-line value) from all three umbrella summaries. */
function deploymentsTile(
  umbrellas: Record<string, UmbrellaSummaryResponse>,
): { status: TileStatus; value: string } | null {
  const sums = ["LIVE", "BATCH", "PAPER"]
    .map((k) => umbrellas[k])
    .filter((s): s is UmbrellaSummaryResponse => Boolean(s));
  if (sums.length === 0) return null;
  let total = 0;
  let running = 0;
  let failed = 0;
  let stale = 0;
  for (const s of sums) {
    total += s.total;
    running += s.counts_by_status.running ?? 0;
    failed += s.counts_by_status.failed ?? 0;
    stale += s.stale_count;
  }
  const status: TileStatus = failed > 0 ? "critical" : stale > 0 ? "degraded" : "ok";
  const value = `${total} targets · ${running} running · ${stale} stale${failed > 0 ? ` · ${failed} failed` : ""}`;
  return { status, value };
}

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

/**
 * Per-deployment MANIFEST-derived freshness summary for the Data Coverage tile — counts
 * the LIVE deployments by `/api/deployments/{id}/freshness` status. `liveness_only`
 * (gateway / control-plane) is reported HONESTLY (its own count), never folded into "fresh".
 * A `stale` live deployment degrades the tile; this rides ON TOP of the overview's
 * `coverage` %-captured value so the tile shows both capture % and live-feed freshness.
 */
function freshnessSummary(rows: DeploymentFreshnessResponse[]): { status: TileStatus; suffix: string } | null {
  if (rows.length === 0) return null;
  let fresh = 0;
  let stale = 0;
  let livenessOnly = 0;
  for (const r of rows) {
    if (r.freshness_status === "fresh") fresh += 1;
    else if (r.freshness_status === "stale") stale += 1;
    else if (r.freshness_status === "liveness_only") livenessOnly += 1;
  }
  const status: TileStatus = stale > 0 ? "critical" : "ok";
  const parts = [`${fresh} fresh`];
  if (stale > 0) parts.push(`${stale} stale`);
  if (livenessOnly > 0) parts.push(`${livenessOnly} liveness-only`);
  return { status, suffix: ` · live feed: ${parts.join(" · ")}` };
}

function HealthTab() {
  const [overview, setOverview] = useState<HealthOverviewResponse | null>(null);
  const [umbrellas, setUmbrellas] = useState<Record<string, UmbrellaSummaryResponse>>({});
  const [ci, setCi] = useState<CiOverviewLite | null>(null);
  const [freshness, setFreshness] = useState<DeploymentFreshnessResponse[]>([]);
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
      // Enrich the Data Coverage tile with REAL per-deployment manifest-derived freshness
      // (NOT the health-ping): pull the LIVE inventory, then each VM's /freshness. Only VM kinds
      // are data producers with a manifest — Cloud Run/ECS/Lambda/Cloud-Function services carry
      // no manifest freshness (they'd only return liveness_only), so don't fetch it for them.
      try {
        const inv = await getDeploymentInventory({ umbrella: "LIVE" });
        if (cancelled) return;
        const vmRows = inv.items.filter((i) => i.kind === "VM");
        const fr = await Promise.allSettled(vmRows.map((i) => getDeploymentFreshness(i.name)));
        if (cancelled) return;
        setFreshness(fr.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])));
      } catch {
        /* freshness is additive — a failure leaves the tile on the overview %-captured value */
      }
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
          let status: TileStatus = tile.status;
          let metric: string = tile.metric;
          if (backend) {
            status = backend.status;
            metric = backend.value;
          } else if (tile.id === "deployments") {
            const derived = deploymentsTile(umbrellas);
            if (derived) {
              status = derived.status;
              metric = derived.value;
            }
          } else if (tile.id === "ci" && ci) {
            const derived = ciTile(ci);
            status = derived.status;
            metric = derived.value;
          }
          // Data Coverage tile: overlay the REAL per-deployment manifest-derived freshness on
          // top of the %-captured value (a stale live feed degrades it; liveness-only is honest).
          if (tile.id === "coverage") {
            const fr = freshnessSummary(freshness);
            if (fr) {
              metric = `${metric}${fr.suffix}`;
              if (fr.status === "critical") status = "critical";
            }
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

      {/* Stopped & orphaned VMs — the idle-disk-spend surface (GET /api/fleet/orphans).
          Makes the recurring boot-disk cost of stopped VMs visible + reapable in-place. */}
      <div className="mt-6">
        <ErrorBoundary fallbackTitle="Orphan inventory failed to load">
          <FleetOrphansContent />
        </ErrorBoundary>
      </div>

      {/* Fold /fleet/infra — orchestrator/control-plane + infra VM health tiles (Phase 0.5
          "Fold /fleet/infra into Fleet"). Chrome-less, reuses the existing component. */}
      <div className="mt-6" data-testid="cockpit-fleet-infra">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Infra & orchestrator health
        </h2>
        <ErrorBoundary fallbackTitle="Fleet infra failed to load">
          <FleetInfraContent />
        </ErrorBoundary>
      </div>

      {/* Fold /fleet/git — per-slot git health across the fleet (Phase 0.5 "Fold /fleet/git"). */}
      <div className="mt-6" data-testid="cockpit-fleet-git">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Fleet git health
        </h2>
        <ErrorBoundary fallbackTitle="Fleet git failed to load">
          <FleetGitContent />
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consolidators — per-asset_group manifest-consolidator health MONITOR.
// Live view over GET /api/health/consolidator: index-freshness vs the staleness
// budget per asset_group, worst-first, auto-refreshing every 15s. The MACRO
// altitude of the write-path truth ("is the index fresh per asset_group?");
// the Deployments tab health is the MICRO ("is THIS shard advancing?").
// ---------------------------------------------------------------------------

// Consolidation runs every ~1–5 min per AG, so a 30s poll is responsive without
// re-fetching faster than the data actually changes (was 15s — unnecessarily busy).
// In mock mode poll fast so the animated backlog sparklines fill in seconds, not minutes.
const CONSOLIDATOR_POLL_MS = import.meta.env.VITE_MOCK_API === "true" ? 2_000 : 30_000;

function fmtAge(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

/** Compact absolute count: 12_400_000 → "12.4M", 96_000 → "96.0k", 9 → "9". */
function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/** Compact byte size: 463_470_592 → "442 MB", 92_000_000 → "88 MB". */
function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${Math.round(n / 1_048_576)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Relative "…ago" from an ISO instant vs a supplied now (ms) so it ticks live. */
function relTime(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  return `${fmtAge(Math.max(0, (nowMs - then) / 1000))} ago`;
}

/** Worst-first ordering so degraded/critical asset_groups float to the top. */
const TILE_RANK: Record<TileStatus, number> = { critical: 0, degraded: 1, placeholder: 2, ok: 3 };

/** Colour for the index-age text: neutral when fine, amber/red to grab attention when behind budget. */
const AGE_COLOR: Record<TileStatus, string> = {
  ok: "text-[var(--color-text-secondary)]",
  degraded: "text-amber-400",
  critical: "text-red-400",
  placeholder: "text-[var(--color-text-secondary)]",
};

/** One compact labelled stat cell (absolute snapshot — rows / size / fan-in). */
function Stat({
  label,
  value,
  title,
  valueClass,
}: {
  label: string;
  value: string;
  title?: string;
  valueClass?: string;
}) {
  return (
    <div className={`shrink-0 ${title ? "cursor-help" : ""}`} title={title}>
      <div className="text-[12px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div
        className={`truncate font-mono text-[15px] leading-tight ${valueClass ?? "text-[var(--color-text-secondary)]"}`}
      >
        {value}
      </div>
    </div>
  );
}

const BACKLOG_MAX_SAMPLES = 40; // ~10 min of 15s polls

const SPARK_STROKE: Record<TileStatus, string> = {
  ok: "var(--color-accent-cyan)",
  degraded: "var(--color-accent-amber)",
  critical: "var(--color-accent-red)",
  placeholder: "var(--color-text-muted)",
};

/** Shards absorbed on the last poll interval — a backlog DROP (inferred, not the job's count). */
function absorbedLastTick(samples: number[] | undefined): number {
  if (!samples || samples.length < 2) return 0;
  return Math.max(0, samples[samples.length - 2] - samples[samples.length - 1]);
}

/**
 * Session-scoped backlog-over-time chart — the card's hero element. Drops = shards absorbed.
 * A real Y-axis (domain 0→peak) makes magnitude legible so a 0–8 backlog and a 0–100 backlog
 * no longer look identical — the axis labels tell you the scale.
 */
function BacklogChart({ ag, samples, tone }: { ag: string; samples: number[]; tone: TileStatus }) {
  if (samples.length < 2) {
    return (
      <div
        data-testid={`cockpit-consolidator-sparkline-${ag}`}
        className="flex h-32 items-center justify-center text-[10px] text-[var(--color-text-muted)]"
      >
        collecting backlog trend… (needs a 2nd poll)
      </div>
    );
  }
  const stroke = SPARK_STROKE[tone];
  const gid = `backlog-grad-${ag}`;
  const chartData = samples.map((pending, i) => ({ i, pending }));
  const peak = Math.max(1, ...samples); // >=1 so the axis domain is never [0,0]
  return (
    <div data-testid={`cockpit-consolidator-sparkline-${ag}`} className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <YAxis
            width={28}
            domain={[0, peak]}
            tickCount={3}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-text-muted)" }}
            tickLine={false}
            axisLine={false}
          />
          <Area
            type="monotone"
            dataKey="pending"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gid})`}
            isAnimationActive={false}
            dot={false}
          />
          <RechartsTooltip {...TOOLTIP_STYLE} labelFormatter={() => "backlog"} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── The full consolidator estate (~25 jobs) — grouped, with the data-correctness verdict ──

const VERDICT_META: Record<ConsolidatorVerdict, { label: string; tone: TileStatus; cls: string; tip: string }> = {
  produced: {
    label: "produced",
    tone: "ok",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    tip: "Index is fresh and caught up — the last run produced its data, no backlog waiting.",
  },
  producing: {
    label: "producing",
    tone: "ok",
    cls: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    tip: "Index is fresh and actively absorbing a backlog of newly-written per-VM shards.",
  },
  stale_output: {
    label: "stale output",
    tone: "critical",
    cls: "border-red-500/40 bg-red-500/10 text-red-300",
    tip: "Index is older than its staleness budget while per-VM shards wait — the consolidator is behind/down; its output is stale.",
  },
  fired_but_empty: {
    label: "fired · empty",
    tone: "critical",
    cls: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    tip: "The job's latest Cloud Run execution SUCCEEDED (exit 0) recently, yet the index is still stale — it ran green but wrote nothing. The silent failure a liveness-only view shows as 'succeeded'.",
  },
  empty: {
    label: "empty",
    tone: "placeholder",
    cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    tip: "No consolidated index and no per-VM shards — the bucket is genuinely empty (nothing to consolidate yet), not an outage.",
  },
  unknown: {
    label: "unknown",
    tone: "placeholder",
    cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    tip: "Could not read this consolidator's index (a transient read error) — not necessarily unhealthy.",
  },
};

/** Human label for a top-level consolidator group. */
function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    instruments: "Instruments",
    "market-data": "Market data",
    features: "Features",
    "ml-training-artifacts": "ML artifacts",
    strategy: "Strategy",
    execution: "Execution",
    "gas-fees": "Gas fees", // not a group of its own (rolls into Market data) — used for that card's title
  };
  return map[kind] ?? kind;
}

/** Fold a consolidator's kind into its top-level group: every features-* is one "Features"
 *  group, and gas-fees rolls up into "Market data" (operator request). */
function groupKey(kind: string): string {
  if (kind === "gas-fees") return "market-data";
  if (kind.startsWith("features")) return "features";
  return kind;
}

/** Fixed pipeline order for the groups: instruments → market data → features → ml → strategy → execution. */
const CATEGORY_ORDER = ["instruments", "market-data", "features", "ml-training-artifacts", "strategy", "execution"];
function categoryRank(groupKind: string): number {
  const i = CATEGORY_ORDER.indexOf(groupKind);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

/** Card title. Inside the merged Features group asset_group alone is ambiguous (delta-one-cefi
 *  and volatility-cefi both = "cefi"), so features cards also show their sub-type. */
function cardTitle(c: ConsolidatorHealth): string {
  if (c.kind.startsWith("features")) {
    const sub = c.kind === "features" ? (c.asset_group ?? "features") : c.kind.slice("features-".length);
    return c.asset_group && c.asset_group !== sub ? `${sub} · ${c.asset_group}` : sub;
  }
  return c.asset_group ?? kindLabel(c.kind);
}

/** Card tone for a consolidator = its data-correctness verdict (empty reads NEUTRAL, not amber). */
function verdictTone(c: ConsolidatorHealth): TileStatus {
  return VERDICT_META[c.verdict]?.tone ?? "placeholder";
}

interface ConsolidatorGroup {
  kind: string;
  items: ConsolidatorHealth[];
}

/** Group into the top-level categories, ordered by the fixed pipeline sequence; within a group,
 *  worst-verdict-first (broken floats up), then by sub-kind + asset_group for a stable order. */
function groupConsolidators(list: ConsolidatorHealth[]): ConsolidatorGroup[] {
  const groups = new Map<string, ConsolidatorHealth[]>();
  for (const c of list) {
    const key = groupKey(c.kind);
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }
  const out: ConsolidatorGroup[] = [];
  for (const [kind, items] of groups) {
    items.sort(
      (a, b) =>
        TILE_RANK[verdictTone(a)] - TILE_RANK[verdictTone(b)] ||
        a.kind.localeCompare(b.kind) ||
        (a.asset_group ?? "").localeCompare(b.asset_group ?? ""),
    );
    out.push({ kind, items });
  }
  out.sort((a, b) => categoryRank(a.kind) - categoryRank(b.kind) || a.kind.localeCompare(b.kind));
  return out;
}

/** Verdict pill — hover shows what the verdict means PLUS this consolidator's live detail line. */
function VerdictBadge({ verdict, detail, testId }: { verdict: ConsolidatorVerdict; detail?: string; testId?: string }) {
  const m = VERDICT_META[verdict] ?? VERDICT_META.unknown;
  // Generic verdict meanings live in the "?" help doc; the badge hover shows this card's LIVE detail.
  const title = detail || m.tip;
  return (
    <span
      data-testid={testId}
      title={title}
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium border ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

/** The consolidator's self-reported last-run summary (from its latest.json). A live consolidator
 *  shows "last run {age} · merged N · +M rows · {duration}"; a dead / never-fired one publishes no
 *  latest.json → "not reporting" so the tab never reads a dead job as a silent all-clear. */
function RunSummary({ c, nowMs }: { c: ConsolidatorHealth; nowMs: number }) {
  if (!c.run_reporting) {
    return (
      <div
        data-testid={`cockpit-consolidator-run-${c.category}`}
        className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]"
        title="This consolidator publishes no latest.json — it has not run under the summary-reporting code (dead / never fired up). It will start reporting the moment it is fired."
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500/60" />
        not reporting — consolidator not live yet
      </div>
    );
  }
  const dur =
    c.run_duration_ms == null
      ? null
      : c.run_duration_ms >= 1000
        ? `${(c.run_duration_ms / 1000).toFixed(1)}s`
        : `${Math.round(c.run_duration_ms)}ms`;
  return (
    <div
      data-testid={`cockpit-consolidator-run-${c.category}`}
      className="truncate text-[11px] text-[var(--color-text-tertiary)]"
      title="Self-reported by the consolidator's last run (latest.json): when it ran, how many shards it merged, rows added, and how long it took."
    >
      <span className="text-[var(--color-text-muted)]">last run </span>
      {relTime(c.run_last_run_at ?? null, nowMs)}
      {c.run_shards_changed != null ? (
        <span className="text-[var(--color-text-muted)]"> · merged {c.run_shards_changed}</span>
      ) : null}
      {c.run_rows_added != null && c.run_rows_added > 0 ? (
        <span className="text-[var(--color-accent-green)]"> · +{fmtCount(c.run_rows_added)} rows</span>
      ) : null}
      {dur ? <span className="text-[var(--color-text-muted)]"> · {dur}</span> : null}
    </div>
  );
}

// A phantom audit older than this is itself a signal — the reconcile runs ~weekly, so past a
// week+grace the count is stale; the re-probe runs ~daily.
const PHANTOM_STALE_DAYS = 8;
const REPROBE_STALE_DAYS = 2;

/**
 * Dark data-correctness actors — the last phantom audit + last empty re-probe for this AG,
 * self-published by the reconcile/re-probe scripts to the same bucket. Renders NOTHING when
 * neither summary exists (the card simply has no audit row — honest, no fabricated all-clear).
 * A problem count (phantoms > 0, reprobe disagreements > 0) turns amber; a stale audit age turns
 * the timestamp red (an overdue audit is itself worth surfacing loudly).
 */
function AuditSummary({ c, nowMs }: { c: ConsolidatorHealth; nowMs: number }) {
  const hasPhantom = c.phantom_audit_at != null;
  const hasReprobe = c.reprobe_audit_at != null;
  if (!hasPhantom && !hasReprobe) return null;
  const ageDays = (iso: string) => (nowMs - Date.parse(iso)) / 86_400_000;
  const phantomCount = c.phantom_count ?? 0;
  const disagreements = c.reprobe_disagreements ?? 0;
  const reclassified = c.reprobe_reclassified ?? 0;
  return (
    <div
      data-testid={`cockpit-consolidator-audit-${c.category}`}
      className="space-y-0.5 text-[11px] text-[var(--color-text-tertiary)]"
    >
      {hasPhantom ? (
        <div
          className="truncate"
          title="Last phantom audit — manifest rows claiming 'captured' with no parquet on disk. Amber when phantoms were found; the age turns red when the ~weekly audit is overdue."
        >
          <span className="text-[var(--color-text-muted)]">phantoms </span>
          <span className={phantomCount > 0 ? "text-amber-400" : "text-[var(--color-accent-green)]"}>
            {phantomCount}
          </span>
          <span
            className={
              ageDays(c.phantom_audit_at ?? "") > PHANTOM_STALE_DAYS ? "text-red-400" : "text-[var(--color-text-muted)]"
            }
          >
            {" · "}
            {relTime(c.phantom_audit_at ?? null, nowMs)}
          </span>
        </div>
      ) : null}
      {hasReprobe ? (
        <div
          className="truncate"
          title="Last empty re-probe — does a 'confirmed empty' cell actually have data? Amber when the oracle/re-fetch disagreed (candidate misclassification bugs); reclassified = proven empties auto-flipped to re-attempt."
        >
          <span className="text-[var(--color-text-muted)]">reprobe </span>
          <span className={disagreements > 0 ? "text-amber-400" : "text-[var(--color-text-secondary)]"}>
            {disagreements} disagree
          </span>
          {reclassified > 0 ? (
            <span className="text-[var(--color-accent-green)]"> · {reclassified} reclassified</span>
          ) : null}
          <span
            className={
              ageDays(c.reprobe_audit_at ?? "") > REPROBE_STALE_DAYS ? "text-red-400" : "text-[var(--color-text-muted)]"
            }
          >
            {" · "}
            {relTime(c.reprobe_audit_at ?? null, nowMs)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One consolidator card, tuned for a 3-up (soon 4-up) grid: identity + verdict header,
 * a compact ABSOLUTE snapshot (rows / size / fan-in), the live index age, then the
 * full-width backlog chart as the hero, a self-reported run summary, and a job/bucket footer.
 */
function ConsolidatorCard({
  c,
  nowMs,
  fetchedAtMs,
  samples,
}: {
  c: ConsolidatorHealth;
  nowMs: number;
  fetchedAtMs: number;
  samples: number[];
}) {
  const tone = verdictTone(c);
  const absorbed = absorbedLastTick(samples);
  const pending = c.pending_shard_count ?? 0;
  const total = c.total_shard_count ?? 0;
  // Tick the backend's authoritative index_age_seconds forward by wall-time elapsed
  // since this poll arrived, so it counts up every second — without depending on
  // last_successful_run_at being a real-recent instant (mock freezes it) or on the
  // browser clock agreeing with the API server's.
  const age0 = c.index_age_seconds ?? null;
  const liveAge = age0 === null ? null : age0 + Math.max(0, (nowMs - fetchedAtMs) / 1000);
  const over = liveAge !== null && c.staleness_budget_seconds > 0 && liveAge > c.staleness_budget_seconds;
  // Oldest un-absorbed shard — how long the earliest pending write has waited (merge-stuck-for).
  // Tick it forward like the index age: it keeps aging while the merge stays behind.
  const oldest0 = c.oldest_pending_shard_age_seconds ?? null;
  const liveOldest = oldest0 === null ? null : oldest0 + Math.max(0, (nowMs - fetchedAtMs) / 1000);
  const oldestOver = liveOldest !== null && c.staleness_budget_seconds > 0 && liveOldest > c.staleness_budget_seconds;
  return (
    <Card data-testid={`cockpit-consolidator-${c.category}`}>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 shrink-0 text-[var(--color-accent-cyan)]" />
            <span className="truncate" title={c.category}>
              {cardTitle(c)}
            </span>
          </span>
          <VerdictBadge verdict={c.verdict} detail={c.detail} testId={`cockpit-consolidator-verdict-${c.category}`} />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-[var(--color-text-tertiary)] space-y-2">
        {/* All metrics on one row — absolute snapshot (rows / size / fan-in) + live freshness + backlog.
            What each one means lives in the "?" help doc, not per-cell tooltips. */}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Stat label="rows" value={fmtCount(c.index_row_count)} />
          <Stat label="size" value={fmtBytes(c.index_size_bytes)} />
          <Stat label="fed by" value={String(total)} />
          {/* index age — colored, live-ticking, grabs attention when behind. */}
          <div className="shrink-0" data-testid="consolidator-index-age">
            <div className="text-[12px] uppercase tracking-wide text-[var(--color-text-muted)]">index age</div>
            <div className={`truncate font-mono text-[15px] leading-tight ${AGE_COLOR[tone]}`}>
              {fmtAge(liveAge)}
              <span className="text-[var(--color-text-muted)]"> / {fmtAge(c.staleness_budget_seconds)}</span>
              {over ? <span className="text-red-400"> · over</span> : null}
            </div>
          </div>
          {/* backlog pending / total (its trend is the chart below) + the oldest un-absorbed shard's age. */}
          <div className="shrink-0" data-testid={`cockpit-consolidator-backlog-${c.category}`}>
            <div className="text-[12px] uppercase tracking-wide text-[var(--color-text-muted)]">backlog</div>
            <div className="truncate font-mono text-[15px] leading-tight">
              <span className={pending > 0 ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]"}>
                {pending}
              </span>
              <span className="text-[var(--color-text-muted)]"> / {total}</span>
              {absorbed > 0 ? <span className="text-[var(--color-accent-green)]"> · −{absorbed}</span> : null}
            </div>
            {/* Oldest pending shard: how long the merge has been stuck. Amber/red when it exceeds the budget. */}
            {liveOldest !== null ? (
              <div
                data-testid={`cockpit-consolidator-oldest-pending-${c.category}`}
                className={`truncate font-mono text-[11px] leading-tight ${oldestOver ? "text-red-400" : "text-[var(--color-text-muted)]"}`}
                title="Age of the oldest per-VM shard written since the last merge — how long the consolidator has been behind. Turns red past the staleness budget."
              >
                oldest {fmtAge(liveOldest)}
              </div>
            ) : null}
          </div>
        </div>
        {/* Hero chart — this session's backlog trend, full width. */}
        <BacklogChart ag={c.category} samples={samples} tone={tone} />
        {/* Self-reported run summary (from the consolidator's latest.json). A dead consolidator that
            never fired publishes none → shown honestly as "not reporting", never a fake all-clear. */}
        <RunSummary c={c} nowMs={nowMs} />
        {/* Dark data-correctness actors — last phantom audit + empty re-probe (only where an audit runs). */}
        <AuditSummary c={c} nowMs={nowMs} />
        {/* Footer: job + bucket, both shown, truncating with the FULL value on hover. */}
        <div className="space-y-0.5 pt-0.5 font-mono text-[12px] text-[var(--color-text-tertiary)]/70">
          <p className="truncate cursor-help" title={c.job_name}>
            <span className="text-[var(--color-text-muted)]">job </span>
            {c.job_name}
          </p>
          <p className="truncate cursor-help" title={c.bucket}>
            <span className="text-[var(--color-text-muted)]">bkt </span>
            {c.bucket}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** "?" toggle in the tab header → a dialog rendering the single source-of-truth help doc. */
function ConsolidatorsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="cockpit-consolidators-help"
        onClick={() => setOpen(true)}
        aria-label="What am I looking at?"
        className="inline-flex items-center gap-1 rounded border border-[var(--color-border-default)] px-1.5 py-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        help
      </button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle>Consolidators — what am I looking at?</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <Markdown src={consolidatorsHelpDoc} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConsolidatorsTab() {
  const [data, setData] = useState<HealthConsolidatorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // Wall-clock anchor captured when the latest poll arrived, so index age can tick
  // forward locally between polls — correct in mock (frozen timestamps) and live,
  // and immune to browser-vs-API-server clock skew.
  const [fetchedAtMs, setFetchedAtMs] = useState<number>(() => Date.now());
  // Session-scoped rolling backlog history per AG (accumulated from the polls we observe).
  const [history, setHistory] = useState<Record<string, number[]>>({});

  // Poll the endpoint — this is a live monitor, not a one-shot load.
  const cancelledRef = useRef(false);
  const tick = useCallback(async () => {
    try {
      const res = await getHealthConsolidator();
      if (!cancelledRef.current) {
        setData(res);
        setFetchedAtMs(Date.now());
        setError(null);
        setHistory((prev) => {
          const next: Record<string, number[]> = { ...prev };
          for (const c of res.consolidators ?? []) {
            if (c.pending_shard_count == null) continue;
            next[c.category] = [...(next[c.category] ?? []), c.pending_shard_count].slice(-BACKLOG_MAX_SAMPLES);
          }
          return next;
        });
      }
    } catch (err) {
      if (!cancelledRef.current) setError(err instanceof Error ? err.message : "consolidator health unavailable");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void tick();
    return () => {
      cancelledRef.current = true;
    };
  }, [tick]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(() => void tick(), CONSOLIDATOR_POLL_MS);

  // 1s clock so "updated …ago" / "last run …ago" stay live between polls.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const consolidators = data?.consolidators ?? [];
  const groups = groupConsolidators(consolidators);
  const vcounts: Record<ConsolidatorVerdict, number> = {
    produced: 0,
    producing: 0,
    stale_output: 0,
    fired_but_empty: 0,
    empty: 0,
    unknown: 0,
  };
  for (const c of consolidators) vcounts[c.verdict] = (vcounts[c.verdict] ?? 0) + 1;

  return (
    <div data-testid="cockpit-consolidators">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">Manifest consolidators</h2>
        <ConsolidatorsHelp />
      </div>
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
          className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${OVERALL_TONE[data.overall]}`}
        >
          <span className="flex items-center gap-2">
            <span className="font-semibold tracking-wide">{OVERALL_LABEL[data.overall]}</span>
            <span className="text-[var(--color-text-tertiary)]">
              {consolidators.length} consolidators · {vcounts.produced + vcounts.producing} healthy ·{" "}
              {vcounts.stale_output ? (
                <span className="text-red-300">{vcounts.stale_output} stale output</span>
              ) : (
                "0 stale"
              )}
              {vcounts.fired_but_empty ? (
                <>
                  {" "}
                  · <span className="text-amber-300">{vcounts.fired_but_empty} fired-but-empty</span>
                </>
              ) : null}{" "}
              · {vcounts.empty} empty{vcounts.unknown ? ` · ${vcounts.unknown} unknown` : ""}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
            <Clock className="h-3 w-3" />
            manifest-consolidator estate · updated {relTime(data.generated_at, nowMs)}
          </span>
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-[var(--color-border-default)] px-3 py-2 text-xs text-[var(--color-text-tertiary)]">
          {loading ? "Loading consolidator health…" : "—"}
        </div>
      )}
      {data && groups.length === 0 ? (
        <p className="text-xs text-[var(--color-text-tertiary)]">
          No consolidators in the catalog — regenerate{" "}
          <code className="font-mono">consolidator_catalog.generated.json</code>.
        </p>
      ) : null}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.kind} data-testid={`cockpit-consolidator-group-${g.kind}`}>
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--color-text-secondary)]">{kindLabel(g.kind)}</span>
              <span className="text-[var(--color-text-muted)]">{g.items.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {g.items.map((c) => (
                <ConsolidatorCard
                  key={c.category}
                  c={c}
                  nowMs={nowMs}
                  fetchedAtMs={fetchedAtMs}
                  samples={history[c.category] ?? []}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const COCKPIT_TABS = [
  { id: "health", label: "Health", icon: ShieldCheck },
  { id: "deploy", label: "Deploy", icon: Rocket },
  { id: "deployments", label: "Deployments", icon: Boxes },
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

  // In-cockpit drill-down: a Deployments row sets `?detail=<name>` (the cockpit owns
  // `?tab`; `?detail` is an orthogonal param) → the per-target DeploymentDetail opens in a
  // slide-over (chrome-less embed) instead of navigating away to /deployments/:name.
  const detail = searchParams.get("detail");
  const openDetail = useCallback(
    (name: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("detail", name);
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );
  const closeDetail = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("detail");
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  return (
    <main className="w-full app-shell-gutter py-4" data-testid="cockpit-page">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
          <ShieldCheck className="h-5 w-5 text-[var(--color-accent-cyan)]" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">Cockpit</h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            unified deployment & health observability — health · deploy · deployments · fleet
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
        <TabsContent value="deployments">
          <div data-testid="cockpit-deployments">
            {/* MERGED live/batch/paper — one flat all-modes inventory (Mode is a filter). */}
            <DeploymentsContent embedded onDrill={openDetail} />
            {/* Fold /ops/live-deployments — the live-mode VM list + WS event/log tail
                (Phase 0.5 "Fold /ops/live-deployments"). Chrome-less, no ?tab collision. */}
            <div className="mt-6" data-testid="cockpit-live-ops">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Live ops — running services + event/log stream
              </h2>
              <ErrorBoundary fallbackTitle="Live ops failed to load">
                <LiveDeploymentsContent />
              </ErrorBoundary>
            </div>
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

      {/* In-cockpit drill-down slide-over — a row's per-target detail (events + log tail)
          opens here instead of navigating to /deployments/:name (Phase 0.5). */}
      {detail ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          data-testid="cockpit-detail-overlay"
          onClick={closeDetail}
        >
          <div
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 shadow-xl"
            data-testid="cockpit-detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Deployment detail
              </span>
              <button
                type="button"
                onClick={closeDetail}
                data-testid="cockpit-detail-close"
                className="rounded-md border border-[var(--color-border-default)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Close ✕
              </button>
            </div>
            <DeploymentDetail name={detail} embedded />
          </div>
        </div>
      ) : null}
    </main>
  );
}
