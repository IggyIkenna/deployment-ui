/**
 * Fleet Infra — single-glance tile for the 5 key fleet/infra health signals:
 *   N VMs running · central-VM up · consolidator fresh · fleet-git clean · CI green
 *
 * Below the tiles: VM census panel (running/stale/OOM breakdown) with per-VM
 * deep-links to the AO dashboard (chip click-throughs).
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 + [UI] P1.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, CheckCircle2, ExternalLink, RefreshCw, Server, XCircle } from "lucide-react";
import {
  getFleetGitHealth,
  getFleetInfraVmHealth,
  getRepoCiOverview,
  getVmCensus,
  type FleetGitHealthProxy,
  type InfraVmHealthProxy,
  type RepoCiOverview,
  type VmCensus,
  type VmCensusEntry,
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
  infraVm: InfraVmHealthProxy | null,
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

  // Central-VM up — enhanced with slot counts from infra-vm-health data
  const centralVmUp: StatusTile = (() => {
    if (infraVm == null) {
      return {
        id: "central-vm",
        title: "Central VM",
        value: "—",
        detail: "Loading…",
        tone: "gray" as TileTone,
        href: orchestratorUrl,
        external: true,
      };
    }
    const firstVm = infraVm.data?.vms?.[0] ?? null;
    const vmSummary = firstVm?.summary ?? null;
    if (!infraVm.available || firstVm == null) {
      return {
        id: "central-vm",
        title: "Central VM",
        value: "DOWN",
        detail: infraVm.reason || "Orchestrator unreachable",
        tone: "red" as TileTone,
        href: infraVm.orchestrator_url || orchestratorUrl,
        external: true,
      };
    }
    const oomClass = (vmSummary?.primary_account_pct ?? 0) >= 95;
    const slotsWorking = vmSummary?.slots_working ?? 0;
    const slotsTotal = vmSummary?.slots_total ?? 0;
    const pct = vmSummary?.primary_account_pct;
    const detail = [
      `${slotsWorking}/${slotsTotal} slots working`,
      pct != null ? `acct ${pct}%` : null,
      oomClass ? "⚠ OOM" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: "central-vm",
      title: "Central VM",
      value: oomClass ? "OOM" : "UP",
      detail,
      tone: oomClass ? ("red" as TileTone) : ("green" as TileTone),
      href: infraVm.orchestrator_url || orchestratorUrl,
      external: true,
    };
  })();

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
          href: "/repos",
        }
      : {
          id: "ci-status",
          title: "CI Status",
          value: "—",
          detail: "Loading…",
          tone: "gray",
          href: "/repos",
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

/** Badge chip for VM status in the census panel. */
function StatusChip({ label, tone }: { label: string; tone: TileTone }) {
  const cls: Record<TileTone, string> = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    red: "bg-red-500/15 text-red-400 border-red-500/30",
    gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cls[tone]}`}>
      {label}
    </span>
  );
}

function VmCensusRow({ vm, aoUrl }: { vm: VmCensusEntry; aoUrl: string }) {
  const tone: TileTone = vm.oom_class ? "red" : vm.stale ? "yellow" : vm.error ? "red" : "green";
  const status = vm.oom_class ? "OOM" : vm.error ? "ERR" : vm.stale ? "STALE" : "UP";
  const hb =
    vm.last_heartbeat_seconds_ago != null
      ? vm.last_heartbeat_seconds_ago < 60
        ? `${vm.last_heartbeat_seconds_ago}s ago`
        : `${Math.round(vm.last_heartbeat_seconds_ago / 60)}m ago`
      : null;

  return (
    <div
      data-testid={`census-vm-${vm.vm_id}`}
      className="flex items-center justify-between gap-4 rounded border border-zinc-700/50 bg-zinc-800/30 px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Server className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="font-medium text-zinc-200 truncate">{vm.label || vm.vm_id}</span>
        <StatusChip label={status} tone={tone} />
        {vm.oom_class && <StatusChip label="OOM" tone="red" />}
      </div>
      <div className="flex items-center gap-3 shrink-0 text-zinc-400">
        <span className="text-xs tabular-nums">
          {vm.slots_working}/{vm.slots_total} slots
        </span>
        {vm.primary_account_pct != null && (
          <span className={`text-xs tabular-nums ${vm.primary_account_pct >= 80 ? "text-amber-400" : ""}`}>
            acct {vm.primary_account_pct}%
          </span>
        )}
        {hb && <span className="text-xs text-zinc-500">{hb}</span>}
        {/* AO chip click-through */}
        <a
          data-testid={`census-vm-ao-link-${vm.vm_id}`}
          href={aoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded border border-zinc-600/50 bg-zinc-700/40 px-1.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
        >
          AO <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

function VmCensusPanel({ census }: { census: VmCensus }) {
  const aoUrl = census.orchestrator_url || "https://agent-orchestrator.odum-research.com";

  return (
    <div data-testid="vm-census-panel" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">VM Census</h3>
        {/* AO dashboard chip click-through */}
        <a
          data-testid="census-ao-dashboard-link"
          href={aoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-zinc-600/50 bg-zinc-700/40 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open AO Dashboard
        </a>
      </div>

      {!census.available ? (
        <div className="flex items-center gap-2 rounded border border-zinc-700/50 bg-zinc-800/30 px-3 py-2 text-xs text-zinc-400">
          <XCircle className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          {census.reason || "Fleet census unavailable"}
        </div>
      ) : (
        <>
          {/* Census summary chips */}
          <div className="flex flex-wrap gap-2" data-testid="census-summary-chips">
            <StatusChip label={`${census.vms_running} running`} tone={census.vms_running > 0 ? "green" : "gray"} />
            {census.vms_stale > 0 && <StatusChip label={`${census.vms_stale} stale`} tone="yellow" />}
            {census.vms_error > 0 && <StatusChip label={`${census.vms_error} error`} tone="red" />}
            {census.vms_oom_class > 0 && <StatusChip label={`${census.vms_oom_class} OOM-class`} tone="red" />}
            <StatusChip label={`${census.vms_total} total`} tone="gray" />
          </div>

          {/* Per-VM rows */}
          <div className="space-y-1.5">
            {census.vms.map((vm) => (
              <VmCensusRow key={vm.vm_id} vm={vm} aoUrl={vm.url || aoUrl} />
            ))}
            {census.vms.length === 0 && (
              <div className="text-xs text-zinc-500 py-1">No VMs registered in the fleet.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function FleetInfraContent() {
  const navigate = useNavigate();
  const [proxy, setProxy] = useState<FleetGitHealthProxy | null>(null);
  const [overview, setOverview] = useState<RepoCiOverview | null>(null);
  const [infraVm, setInfraVm] = useState<InfraVmHealthProxy | null>(null);
  const [census, setCensus] = useState<VmCensus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, o, iv, c] = await Promise.all([
        getFleetGitHealth(),
        getRepoCiOverview(),
        getFleetInfraVmHealth(),
        getVmCensus(),
      ]);
      setProxy(p);
      setOverview(o);
      setInfraVm(iv);
      setCensus(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orchestratorUrl =
    infraVm?.orchestrator_url ?? proxy?.orchestrator_url ?? "https://agent-orchestrator.odum-research.com";
  const tiles = buildTiles(proxy, overview, infraVm, orchestratorUrl);

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

      {/* VM Census Panel — running/stale/OOM breakdown with AO chip click-throughs */}
      {census != null && <VmCensusPanel census={census} />}

      {!loading && !error && (proxy?.available ?? false) && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          Orchestrator reachable — data as of last fetch
        </div>
      )}
    </div>
  );
}
