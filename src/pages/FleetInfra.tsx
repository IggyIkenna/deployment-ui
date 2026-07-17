/**
 * Fleet Infra — single-glance tile for the 5 key fleet/infra health signals:
 *   N VMs running · central-VM up · consolidator fresh · fleet-git clean · CI green
 *
 * Each tile is a clickable status card that deep-links to the relevant detail view.
 * Data derives from existing getFleetGitHealth() + getRepoCiOverview() endpoints; no
 * new API routes required. Consolidator freshness has no dedicated API yet (shows
 * "unavailable" with a gray chip until a future endpoint lands).
 *
 * Sections:
 *   1. Status tiles (5 cards) — existing P2 surface
 *   2. VM Census panel — running/expected/zombie/OOM from vm_zombie_watchdog.py (P1)
 *   3. Orchestrator VM slots — per-VM slot utilization from AO fleet summary (P1)
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 (tiles) + [UI] P1 (census).
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Server, XCircle } from "lucide-react";
import {
  getFleetGitHealth,
  getInfraVmHealth,
  getRepoCiOverview,
  getVmCensus,
  type FleetGitHealthProxy,
  type InfraVmHealthResponse,
  type RepoCiOverview,
  type VmCensusResponse,
} from "../api/client";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type TileTone = "green" | "yellow" | "red" | "gray";

const TILE_BORDER: Record<TileTone, string> = {
  green: "border-emerald-500/40 bg-emerald-500/5",
  yellow: "border-amber-500/40 bg-amber-500/5",
  red: "border-red-500/40 bg-red-500/5",
  gray: "border-zinc-500/30 bg-zinc-500/5",
};

const TILE_LABEL: Record<TileTone, string> = {
  green: "text-emerald-400",
  yellow: "text-amber-400",
  red: "text-red-400",
  gray: "text-zinc-400",
};

interface StatusTile {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: TileTone;
  href?: string;
  external?: boolean;
}

function buildTiles(
  proxy: FleetGitHealthProxy | null,
  overview: RepoCiOverview | null,
  orchestratorUrl: string,
): StatusTile[] {
  const gitData = proxy?.data ?? null;
  const summary = gitData?.summary ?? null;

  // N VMs running — hosts count from fleet git summary
  const vmsRunning: StatusTile =
    summary != null
      ? {
          id: "vms-running",
          title: "VMs Running",
          value: String(summary.hosts),
          detail: `${summary.slots} slot(s) across ${summary.hosts} host(s)`,
          tone: summary.hosts > 0 ? "green" : "yellow",
          href: "/fleet",
        }
      : {
          id: "vms-running",
          title: "VMs Running",
          value: "—",
          detail: proxy?.available === false ? proxy.reason : "Loading…",
          tone: "gray",
          href: "/fleet",
        };

  // Central-VM up — proxy.available true means the orchestrator responded
  const centralVmUp: StatusTile =
    proxy != null
      ? {
          id: "central-vm",
          title: "Central VM",
          value: proxy.available ? "UP" : "DOWN",
          detail: proxy.available ? "Orchestrator responding" : proxy.reason,
          tone: proxy.available ? "green" : "red",
          href: proxy.orchestrator_url || orchestratorUrl,
          external: true,
        }
      : {
          id: "central-vm",
          title: "Central VM",
          value: "—",
          detail: "Loading…",
          tone: "gray",
        };

  // Consolidator fresh — no dedicated API yet; always gray/unavailable
  const consolidatorFresh: StatusTile = {
    id: "consolidator",
    title: "Consolidator",
    value: "—",
    detail: "No status endpoint yet",
    tone: "gray",
  };

  // Fleet-git clean — dirty==0 && drift_violations==0
  const fleetGitClean: StatusTile =
    summary != null
      ? {
          id: "fleet-git",
          title: "Fleet Git",
          value: summary.dirty === 0 && summary.drift_violations === 0 ? "CLEAN" : "DIRTY",
          detail:
            summary.dirty === 0 && summary.drift_violations === 0
              ? `${summary.clean} clean repo(s)`
              : `${summary.dirty} dirty · ${summary.drift_violations} drift`,
          tone: summary.dirty === 0 && summary.drift_violations === 0 ? "green" : "red",
          href: "/fleet",
        }
      : {
          id: "fleet-git",
          title: "Fleet Git",
          value: "—",
          detail: "Loading…",
          tone: "gray",
          href: "/fleet",
        };

  // CI green — no stuck PRs
  const ciGreen: StatusTile =
    overview != null
      ? {
          id: "ci-status",
          title: "CI Status",
          value: overview.stuck_prs.length === 0 ? "GREEN" : `${overview.stuck_prs.length} STUCK`,
          detail:
            overview.stuck_prs.length === 0
              ? `${overview.repos.length} repo(s) monitored`
              : `${overview.stuck_prs.length} PR(s) stuck`,
          tone: overview.stuck_prs.length === 0 ? "green" : "red",
          href: "/ci",
        }
      : {
          id: "ci-status",
          title: "CI Status",
          value: "—",
          detail: "Loading…",
          tone: "gray",
          href: "/ci",
        };

  return [vmsRunning, centralVmUp, consolidatorFresh, fleetGitClean, ciGreen];
}

function TileCard({ tile, onNavigate }: { tile: StatusTile; onNavigate: (tile: StatusTile) => void }) {
  const clickable = !!tile.href;
  return (
    <Card
      data-testid={`infra-tile-${tile.id}`}
      className={`border ${TILE_BORDER[tile.tone]} transition-all ${clickable ? "cursor-pointer hover:ring-1 hover:ring-white/20" : ""}`}
      onClick={clickable ? () => onNavigate(tile) : undefined}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400 flex items-center justify-between">
          {tile.title}
          {tile.external && tile.href && <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={`text-2xl font-bold tabular-nums mb-1 ${TILE_LABEL[tile.tone]}`}>{tile.value}</div>
        <div className="text-xs text-zinc-500">{tile.detail}</div>
      </CardContent>
    </Card>
  );
}

// ── VM Census Panel (P1) ──────────────────────────────────────────────────────

interface CensusChipProps {
  label: string;
  count: number;
  tone: "green" | "amber" | "red" | "zinc";
  testId: string;
  aoUrl: string;
  title?: string;
}

function CensusChip({ label, count, tone, testId, aoUrl, title }: CensusChipProps) {
  const colors = {
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25",
    red: "bg-red-500/15 text-red-300 border-red-500/30 hover:bg-red-500/25",
    zinc: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/20",
  };

  return (
    <a
      data-testid={testId}
      href={aoUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${colors[tone]}`}
    >
      <span className="tabular-nums font-bold">{count}</span>
      <span>{label}</span>
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}

function VmCensusPanel({ census, orchestratorUrl }: { census: VmCensusResponse | null; orchestratorUrl: string }) {
  if (!census) return null;

  const aoVmsUrl = `${orchestratorUrl}/vms`;

  return (
    <div data-testid="vm-census-panel" className="space-y-3">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-300">VM Census</h3>
        <span className="text-xs text-zinc-500">vm_zombie_watchdog · click to open AO</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <CensusChip
          label="running"
          count={census.running}
          tone={census.running > 0 ? "green" : "zinc"}
          testId="vm-census-running"
          aoUrl={aoVmsUrl}
          title={`${census.running} VMs running in GCP`}
        />
        <CensusChip
          label="expected"
          count={census.expected}
          tone="zinc"
          testId="vm-census-expected"
          aoUrl={aoVmsUrl}
          title={`${census.expected} VMs registered in vm_zombie_watchdog prefix map`}
        />
        {census.zombie > 0 && (
          <CensusChip
            label="zombie"
            count={census.zombie}
            tone="amber"
            testId="vm-census-zombie"
            aoUrl={aoVmsUrl}
            title={`${census.zombie} zombie VM(s) — running past expected lifetime`}
          />
        )}
        {/* OOM chip: always rendered when backend provides data — was invisible before this surface */}
        <CensusChip
          label={census.oom === 0 ? "0 OOM" : `OOM ×${census.oom}`}
          count={census.oom}
          tone={census.oom > 0 ? "red" : "zinc"}
          testId="vm-census-oom"
          aoUrl={aoVmsUrl}
          title={`${census.oom} VM(s) terminated with out-of-memory exit code`}
        />
      </div>

      {/* Compact VM table */}
      {census.vms.length > 0 && (
        <div className="rounded border border-zinc-800 divide-y divide-zinc-800 text-xs">
          {census.vms.map((vm) => {
            const statusColor =
              vm.status === "RUNNING"
                ? "text-emerald-400"
                : vm.oom
                  ? "text-red-400"
                  : vm.zombie
                    ? "text-amber-400"
                    : "text-zinc-500";
            const badge = vm.oom ? "OOM" : vm.zombie ? "ZOMBIE" : vm.status;
            return (
              <div
                key={vm.name}
                data-testid={`vm-census-row-${vm.name}`}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800/50"
              >
                <span className="font-mono text-zinc-300 truncate max-w-xs">{vm.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-zinc-600 uppercase tracking-wide">{vm.lifecycle_class.replace(/_/g, " ")}</span>
                  {vm.age_min != null && (
                    <span className="text-zinc-500">
                      {vm.age_min >= 60 ? `${Math.floor(vm.age_min / 60)}h` : `${vm.age_min}m`}
                    </span>
                  )}
                  <span className={`font-semibold ${statusColor}`}>{badge}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Orchestrator VM Slots Panel (P1) ─────────────────────────────────────────

function InfraVmHealthPanel({
  health,
  orchestratorUrl,
}: {
  health: InfraVmHealthResponse | null;
  orchestratorUrl: string;
}) {
  if (!health?.available || !health.vms.length) return null;

  return (
    <div data-testid="infra-vm-health-panel" className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-300">Orchestrator VMs</h3>
        <a
          data-testid="infra-vm-health-ao-link"
          href={orchestratorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
        >
          Open AO <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div className="rounded border border-zinc-800 divide-y divide-zinc-800 text-xs">
        {health.vms.map((vm) => {
          const s = vm.summary;
          const hasAlerts = (s?.alerts ?? []).length > 0;
          const critAlerts = (s?.alerts ?? []).filter((a) => a.severity === "crit").length;
          return (
            <div key={vm.id} data-testid={`infra-vm-row-${vm.id}`} className="px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-200">{vm.label || vm.id}</span>
                <div className="flex items-center gap-2">
                  {vm.stale && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> stale
                    </span>
                  )}
                  {!vm.available && (
                    <span className="text-red-400 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> unreachable
                    </span>
                  )}
                  {hasAlerts && (
                    <span
                      className={critAlerts > 0 ? "text-red-400" : "text-amber-400"}
                      title={(s?.alerts ?? []).map((a) => a.detail).join("; ")}
                    >
                      {critAlerts > 0 ? `${critAlerts} crit` : `${(s?.alerts ?? []).length} warn`}
                    </span>
                  )}
                </div>
              </div>
              {s && (
                <div className="flex items-center gap-4 text-zinc-500">
                  <span>
                    <span className="text-emerald-400 font-medium">{s.slots_working}</span> working
                  </span>
                  <span>{s.slots_idle} idle</span>
                  {s.slots_stale > 0 && <span className="text-amber-400">{s.slots_stale} stale</span>}
                  {s.slots_blocked > 0 && <span className="text-red-400">{s.slots_blocked} blocked</span>}
                  <span className="text-zinc-600">
                    backlog {s.backlog_queued}/{s.backlog_total}
                  </span>
                  {s.watchdog && (
                    <span
                      className={s.watchdog.dormant ? "text-amber-400" : "text-zinc-500"}
                      title={`Watchdog: ${s.watchdog.kills_today}/${s.watchdog.daily_cap} kills today${s.watchdog.flapping ? " · FLAPPING" : ""}`}
                    >
                      wd {s.watchdog.kills_today}/{s.watchdog.daily_cap}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function FleetInfraContent() {
  const navigate = useNavigate();
  const [proxy, setProxy] = useState<FleetGitHealthProxy | null>(null);
  const [overview, setOverview] = useState<RepoCiOverview | null>(null);
  const [census, setCensus] = useState<VmCensusResponse | null>(null);
  const [infraHealth, setInfraHealth] = useState<InfraVmHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, o] = await Promise.all([getFleetGitHealth(), getRepoCiOverview()]);
      setProxy(p);
      setOverview(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // Census + infra-VM health degrade gracefully (backend pending)
    try {
      const [c, ih] = await Promise.all([getVmCensus(), getInfraVmHealth()]);
      setCensus(c);
      setInfraHealth(ih);
    } catch {
      // Backend not yet deployed — panels simply stay hidden
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orchestratorUrl =
    proxy?.orchestrator_url ?? infraHealth?.orchestrator_url ?? "https://agent-orchestrator.odum-research.com";
  const tiles = buildTiles(proxy, overview, orchestratorUrl);

  function handleNavigate(tile: StatusTile) {
    if (!tile.href) return;
    if (tile.external) {
      window.open(tile.href, "_blank", "noopener,noreferrer");
    } else {
      navigate(tile.href);
    }
  }

  return (
    <div data-testid="fleet-infra-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-100">Fleet &amp; Infra</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="gap-2 text-zinc-300"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div data-testid="infra-tiles" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <TileCard key={tile.id} tile={tile} onNavigate={handleNavigate} />
        ))}
      </div>

      {!loading && !error && proxy?.available && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Orchestrator reachable — data as of last fetch
        </div>
      )}

      {/* P1: VM Census (vm_zombie_watchdog surface) */}
      <VmCensusPanel census={census} orchestratorUrl={orchestratorUrl} />

      {/* P1: Orchestrator VM slot utilization */}
      <InfraVmHealthPanel health={infraHealth} orchestratorUrl={orchestratorUrl} />
    </div>
  );
}
