/**
 * Fleet Infra — single-glance tile for the 5 key fleet/infra health signals:
 *   N VMs running · central-VM up · consolidator fresh · fleet-git clean · CI green
 *
 * Each tile is a clickable status card that deep-links to the relevant detail view.
 * Data derives from existing getFleetGitHealth() + getRepoCiOverview() endpoints; no
 * new API routes required. Consolidator freshness has no dedicated API yet (shows
 * "unavailable" with a gray chip until a future endpoint lands).
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md — [UI] P2 (6th LandingTab).
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { getFleetGitHealth, getRepoCiOverview, type FleetGitHealthProxy, type RepoCiOverview } from "../api/client";
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

export function FleetInfraContent() {
  const navigate = useNavigate();
  const [proxy, setProxy] = useState<FleetGitHealthProxy | null>(null);
  const [overview, setOverview] = useState<RepoCiOverview | null>(null);
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const orchestratorUrl = proxy?.orchestrator_url ?? "https://agent-orchestrator.odum-research.com";
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
    </div>
  );
}
