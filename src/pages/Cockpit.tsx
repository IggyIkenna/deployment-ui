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

import { useCallback } from "react";
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

/**
 * PlaceholderNote — the honest "this pane is scaffolded; here's what wires it"
 * banner. Keeps the no-blind-build contract visible: every placeholder names its
 * backend endpoint + the plan phase that replaces it.
 */
function PlaceholderNote({ endpoint, phase }: { endpoint: string; phase: string }) {
  return (
    <div
      data-testid="cockpit-placeholder-note"
      className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10 px-3 py-2 text-xs text-[var(--color-text-secondary)]"
    >
      <Layers className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--color-accent-blue)]" />
      <span>
        <strong>Placeholder.</strong> Wires to{" "}
        <code className="font-mono rounded bg-[var(--color-bg-tertiary)] px-1">{endpoint}</code> in {phase}.
      </span>
    </div>
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

function HealthTab() {
  return (
    <div data-testid="cockpit-health">
      <PlaceholderNote endpoint="GET /api/health/overview" phase="Phase 1" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {HEALTH_TILES.map((tile) => {
          const Icon = tile.icon;
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
                    <StatusChip status={tile.status} testId={`cockpit-tile-status-${tile.id}`} />
                  </div>
                  <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">{tile.metric}</p>
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
      <PlaceholderNote endpoint="DeployForm (POST /api/deployments) — embedded service-picker" phase="Phase 2" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <CardContent className="text-xs text-[var(--color-text-tertiary)] space-y-2">
                <p>{u.hint}</p>
                <Link
                  to="/home"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent-cyan)]"
                >
                  <Rocket className="h-3.5 w-3.5" /> Open deploy console →
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dynamics panes — Live / Batch / Paper each get their distinct columns. The
// existing /deployments inventory is the data source (Phase 2 swaps these
// placeholder rows for it); the COLUMNS differ per umbrella by design. The "Logs"
// + "Redeploy" per-row affordances attach when the real rows land.
// ---------------------------------------------------------------------------

function PlaceholderTable({ columns, note }: { columns: string[]; note: { endpoint: string; phase: string } }) {
  return (
    <div>
      <PlaceholderNote endpoint={note.endpoint} phase={note.phase} />
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-tertiary)]">
                {columns.map((c) => (
                  <th key={c} className="px-4 py-2 font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((r) => (
                <tr key={r} className="border-b border-[var(--color-border-default)]/50">
                  {columns.map((c) => (
                    <td key={c} className="px-4 py-3 text-[var(--color-text-muted)]">
                      <span className="inline-block h-3 w-16 rounded bg-[var(--color-bg-tertiary)]" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

const DYNAMICS_COLUMNS: Record<"live" | "batch" | "paper", string[]> = {
  live: ["Service", "Cloud", "Status", "Uptime", "Heartbeat age", "Feed health", "Logs"],
  batch: ["VM / Job", "Cloud", "Status", "Progress", "Coverage %", "Exit code", "Logs"],
  paper: ["Strategy", "Cloud", "Status", "Recon drift", "Determinism ε", "Last recon", "Logs"],
};

// ---------------------------------------------------------------------------
// Fleet reconciliation — "every VM accounted for" across GCP+AWS, INCLUDING the
// agent-orchestrator control-plane VMs (a Purpose column distinguishes trading vs
// dev-automation). UNKNOWN (running but unregistered) and EXPECTED-MISSING
// (registered but not running) are the two alarm rows. Wires to
// GET /api/fleet/reconciliation in Phase 4.
// ---------------------------------------------------------------------------

function FleetTab() {
  return (
    <div data-testid="cockpit-fleet">
      <PlaceholderNote endpoint="GET /api/fleet/reconciliation" phase="Phase 4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {[
          {
            id: "accounted",
            label: "Accounted for",
            status: "placeholder" as TileStatus,
            hint: "running ∩ registered",
          },
          {
            id: "unknown",
            label: "Unknown (running, unregistered)",
            status: "placeholder" as TileStatus,
            hint: "alarm: classify or kill",
          },
          {
            id: "missing",
            label: "Expected-missing (registered, not running)",
            status: "placeholder" as TileStatus,
            hint: "alarm: relaunch or de-register",
          },
        ].map((c) => (
          <Card key={c.id} data-testid={`cockpit-fleet-card-${c.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {c.label}
                <StatusChip status={c.status} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--color-text-tertiary)]">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <PlaceholderTable
        columns={["Instance / Job", "Cloud", "Purpose", "Prefix", "Classified umbrella", "Registry match", "Status"]}
        note={{ endpoint: "GET /api/fleet/reconciliation", phase: "Phase 4" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consolidators — per-asset_group manifest-consolidator health drill-down.
// Wires to GET /api/health/consolidator in Phase 1.
// ---------------------------------------------------------------------------

const ASSET_GROUPS = ["cefi", "defi", "tradfi", "sports", "prediction"] as const;

function ConsolidatorsTab() {
  return (
    <div data-testid="cockpit-consolidators">
      <PlaceholderNote endpoint="GET /api/health/consolidator" phase="Phase 1" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ASSET_GROUPS.map((ag) => (
          <Card key={ag} data-testid={`cockpit-consolidator-${ag}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[var(--color-accent-cyan)]" />
                  {ag}
                </span>
                <StatusChip status="placeholder" />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-[var(--color-text-tertiary)] space-y-1">
              <p>index age: —</p>
              <p>per-VM shard fallback: —</p>
              <p>last successful run: —</p>
            </CardContent>
          </Card>
        ))}
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
        <TabsList variant="pill" className="grid w-full grid-cols-4 lg:grid-cols-7 mb-6">
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
          <PlaceholderTable
            columns={DYNAMICS_COLUMNS.live}
            note={{ endpoint: "GET /api/deployments/inventory?umbrella=LIVE", phase: "Phase 2" }}
          />
        </TabsContent>
        <TabsContent value="batch">
          <PlaceholderTable
            columns={DYNAMICS_COLUMNS.batch}
            note={{ endpoint: "GET /api/deployments/inventory?umbrella=BATCH", phase: "Phase 2" }}
          />
        </TabsContent>
        <TabsContent value="paper">
          <PlaceholderTable
            columns={DYNAMICS_COLUMNS.paper}
            note={{ endpoint: "GET /api/deployments/inventory?umbrella=PAPER", phase: "Phase 2" }}
          />
        </TabsContent>
        <TabsContent value="fleet">
          <FleetTab />
        </TabsContent>
        <TabsContent value="consolidators">
          <ConsolidatorsTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
