/**
 * Infra VM Status — central/infra-VM health tile + VM census/zombie surface.
 *
 * Surfaces per-VM slot counts, alerts, and WorkerLivenessWatchdog OOM liveness
 * (the vm-0 OOM class was invisible before this page). Data is proxied server-side
 * from the agent-orchestrator's /api/fleet/summary; every chip click-throughs to
 * the AO dashboard (division-of-surfaces — AO owns fleet management).
 *
 * Plan: deployment_ui_monitoring_pane_2026_06_19.md task 010.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw, Server, Zap } from "lucide-react";
import {
  getFleetInfraHealth,
  type FleetInfraData,
  type FleetInfraHealthProxy,
  type VmAlert,
  type VmEntry,
  type VmSummary,
  type WatchdogHealth,
} from "../api/client";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

type ChipTone = "green" | "yellow" | "red" | "gray";

const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
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

/** AO fleet management dashboard — click-through destination for every VM tile. */
function orchestratorDashboardUrl(orchestratorUrl: string): string {
  const origin = orchestratorUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
  return `${origin}/`;
}

function OpenInOrchestrator({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-testid="infra-vm-open-orchestrator"
      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
    >
      Open in Agent-Orchestrator <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function alertTone(a: VmAlert): ChipTone {
  return a.severity === "crit" ? "red" : "yellow";
}

function WatchdogChip({ watchdog }: { watchdog: WatchdogHealth }) {
  if (!watchdog.enabled) return null;
  const tone: ChipTone = watchdog.dormant || watchdog.flapping ? "red" : watchdog.kills_today > 0 ? "yellow" : "green";
  const label = watchdog.dormant
    ? `watchdog dormant (${watchdog.kills_today}/${watchdog.daily_cap})`
    : watchdog.flapping
      ? `watchdog flapping (${watchdog.slots_killed_last_hour}/hr)`
      : watchdog.kills_today > 0
        ? `${watchdog.kills_today} kill${watchdog.kills_today === 1 ? "" : "s"} today`
        : "watchdog ok";
  return (
    <Chip tone={tone} testId="infra-vm-watchdog-chip">
      <Zap className="h-3 w-3" /> {label}
    </Chip>
  );
}

function VmCard({ vm, orchestratorUrl }: { vm: VmEntry; orchestratorUrl: string }) {
  const s: VmSummary | null = vm.summary;
  const stale = vm.stale;
  const vmLabel = vm.label ?? vm.id;

  return (
    <Card data-testid={`infra-vm-card-${vm.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <Server className="h-4 w-4 shrink-0" />
          <span>{vmLabel}</span>
          {vm.id !== vmLabel && <span className="text-xs text-[var(--color-text-muted)] font-normal">{vm.id}</span>}
          {stale && (
            <Chip tone="red" testId={`infra-vm-stale-${vm.id}`}>
              stale
            </Chip>
          )}
          {!stale && s && (
            <Chip tone="green" testId={`infra-vm-live-${vm.id}`}>
              live
            </Chip>
          )}
          {vm.last_heartbeat_seconds_ago !== null && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-normal">
              hb {vm.last_heartbeat_seconds_ago}s ago
            </span>
          )}
          <OpenInOrchestrator url={orchestratorUrl} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {vm.error && (
          <p className="text-xs text-red-400">
            <AlertCircle className="inline h-3 w-3 mr-1" />
            {vm.error}
          </p>
        )}
        {s && (
          <>
            {/* Slot census */}
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={s.slots_working > 0 ? "green" : "gray"} testId={`infra-vm-slots-working-${vm.id}`}>
                {s.slots_working} working
              </Chip>
              <Chip tone="gray" testId={`infra-vm-slots-idle-${vm.id}`}>
                {s.slots_idle} idle
              </Chip>
              {s.slots_stale > 0 && (
                <Chip tone="red" testId={`infra-vm-slots-stale-${vm.id}`}>
                  {s.slots_stale} stale
                </Chip>
              )}
              {s.slots_paused > 0 && <Chip tone="yellow">{s.slots_paused} paused</Chip>}
              {s.slots_blocked > 0 && <Chip tone="red">{s.slots_blocked} blocked</Chip>}
              {s.backlog_queued > 0 && <Chip tone="gray">{s.backlog_queued} queued</Chip>}
            </div>

            {/* Watchdog / OOM surface */}
            {s.watchdog && (
              <div>
                <WatchdogChip watchdog={s.watchdog} />
              </div>
            )}

            {/* VM-level alerts */}
            {s.alerts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.alerts.map((a, i) => (
                  <Chip key={i} tone={alertTone(a)}>
                    <AlertCircle className="h-3 w-3" /> {a.detail}
                  </Chip>
                ))}
              </div>
            )}

            {/* Account usage */}
            {s.primary_account_pct !== null && (
              <div className="text-[10px] text-[var(--color-text-muted)]">
                account {s.primary_account_id}: {s.primary_account_pct}% usage
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CensusSummary({ data }: { data: FleetInfraData }) {
  const vms = data.vms;
  const total = vms.length;
  const live = vms.filter((v) => !v.stale && !v.error).length;
  const stale = vms.filter((v) => v.stale).length;
  const errored = vms.filter((v) => !!v.error).length;
  const totalSlots = vms.reduce((acc, v) => acc + (v.summary?.slots_total ?? 0), 0);
  const workingSlots = vms.reduce((acc, v) => acc + (v.summary?.slots_working ?? 0), 0);
  const alertCount = vms.reduce((acc, v) => acc + (v.summary?.alerts.length ?? 0), 0);

  return (
    <div className="flex flex-wrap gap-2" data-testid="infra-vm-census">
      {[
        { label: "VMs total", value: total, alert: false },
        { label: "live", value: live, alert: false },
        { label: "stale", value: stale, alert: stale > 0 },
        { label: "error", value: errored, alert: errored > 0 },
        { label: "slots", value: totalSlots, alert: false },
        { label: "working", value: workingSlots, alert: false },
        { label: "alerts", value: alertCount, alert: alertCount > 0 },
      ].map((c) => (
        <div
          key={c.label}
          className={`rounded border px-2.5 py-1 text-xs ${c.alert ? TONE_CLASSES.red : "border-[var(--color-border)]"}`}
        >
          <span className={`font-mono font-semibold ${c.alert ? "text-red-400" : "text-[var(--color-text)]"}`}>
            {c.value}
          </span>{" "}
          <span className="text-[var(--color-text-muted)]">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export function InfraVmContent() {
  const [proxy, setProxy] = useState<FleetInfraHealthProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProxy(await getFleetInfraHealth());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const data = proxy?.data ?? null;
  const orchestratorUrl = proxy ? orchestratorDashboardUrl(proxy.orchestrator_url) : "";

  return (
    <div className="space-y-4" data-testid="infra-vm-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Infra VM Status</h2>
          {proxy && <OpenInOrchestrator url={orchestratorUrl} />}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} data-testid="infra-vm-refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <Card data-testid="infra-vm-error">
          <CardContent className="py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Failed to load: {error}
          </CardContent>
        </Card>
      )}

      {proxy && !proxy.available && (
        <Card data-testid="infra-vm-unavailable">
          <CardContent className="py-3 text-sm text-[var(--color-text-muted)] space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="h-4 w-4" /> Live VM data unavailable
            </div>
            <p>{proxy.reason}</p>
            <p>
              The orchestrator owns fleet VM health — open its dashboard directly:{" "}
              <OpenInOrchestrator url={orchestratorUrl} />
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <CensusSummary data={data} />
          {data.vms.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No VMs registered.</p>
          ) : (
            <div className="space-y-3" data-testid="infra-vm-list">
              {data.vms.map((vm) => (
                <VmCard key={vm.id} vm={vm} orchestratorUrl={orchestratorUrl} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
