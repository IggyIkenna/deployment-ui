/**
 * Fleet Git-Health — single-pane view of every host/slot/repo worktree's git state
 * (dirty / behind / diverged vs LDR) + reporter/FF-pull cron liveness, proxied from
 * the agent-orchestrator (operator decision v2, 2026-06-10: deployment-ui is the one
 * devops pane). The orchestrator owns the data; this surfaces it + deep-links to the
 * orchestrator's own Fleet Git-Health page (operator: git-health click-through → AO UI).
 *
 * Plan: fleet_git_health_orchestrator_2026_06_10.md Phase 2 (single-pane integration) +
 * monitoring_control_plane_master_2026_06_10.md (operator v2 + click-through rule).
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw, Server } from "lucide-react";
import {
  getFleetGitHealth,
  type FleetGitData,
  type FleetGitHealthProxy,
  type FleetGitSlotHealth,
  type FleetGitSummary,
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

interface SummaryChipDef {
  label: string;
  value: number;
  alert: boolean;
}

export function summaryChipDefs(s: FleetGitSummary): SummaryChipDef[] {
  return [
    { label: "hosts", value: s.hosts, alert: false },
    { label: "slots", value: s.slots, alert: false },
    { label: "repos", value: s.repos_total, alert: false },
    { label: "dirty", value: s.dirty, alert: s.dirty > 0 },
    { label: "behind", value: s.behind, alert: false },
    { label: "drift", value: s.drift_violations, alert: s.drift_violations > 0 },
    { label: "reporter dead", value: s.reporter_stale_slots, alert: s.reporter_stale_slots > 0 },
    { label: "ff-pull dead", value: s.ff_cron_stale_slots, alert: s.ff_cron_stale_slots > 0 },
  ];
}

interface SlotBadge {
  label: string;
  tone: ChipTone;
}

export function slotBadges(slot: FleetGitSlotHealth): SlotBadge[] {
  const badges: SlotBadge[] = [];
  if (slot.reporter_stale) badges.push({ label: "reporter dead", tone: "red" });
  if (slot.ff_cron_stale) badges.push({ label: "ff-pull dead", tone: "red" });
  const drift = slot.repos.filter((r) => r.drift_violation).length;
  if (drift > 0) badges.push({ label: `${drift} drift`, tone: "red" });
  const dirty = slot.repos.filter((r) => r.dirty_files > 0 || r.state === "dirty").length;
  if (dirty > 0) badges.push({ label: `${dirty} dirty`, tone: "yellow" });
  const behind = slot.repos.filter((r) => r.behind > 0 || r.state === "behind").length;
  if (behind > 0) badges.push({ label: `${behind} behind`, tone: "yellow" });
  if (badges.length === 0) badges.push({ label: "clean", tone: "green" });
  return badges;
}

/** Relative age since an ISO timestamp — "3m ago" style. Null when unparseable/absent. */
export function fmtSnapshotAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 90) return `${Math.round(seconds)}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

/** Absolute local time for an ISO timestamp (tooltip pairing for the relative age). */
export function fmtSnapshotTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** The orchestrator's own Fleet Git-Health page (operator: git-health click-through → AO UI). */
function orchestratorFleetUrl(orchestratorUrl: string): string {
  // The orchestrator dashboard page lives at /fleet-git (the API base may carry an
  // /api suffix; strip it for the dashboard origin).
  const origin = orchestratorUrl.replace(/\/api\/?$/, "").replace(/\/$/, "");
  return `${origin}/fleet-git`;
}

function OpenInOrchestrator({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-testid="fleet-open-orchestrator"
      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:underline"
    >
      Open in Agent-Orchestrator <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function HostCard({ host, orchestratorUrl }: { host: FleetGitData["hosts"][number]; orchestratorUrl: string }) {
  return (
    <Card data-testid={`fleet-host-${host.host}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Server className="h-4 w-4" />
          {host.host}
          {host.vm_id && host.vm_id !== host.host && (
            <span className="text-xs text-[var(--color-text-muted)] font-normal">{host.vm_id}</span>
          )}
          <span className="text-xs text-[var(--color-text-muted)] font-normal">
            {host.slots.length} slot{host.slots.length === 1 ? "" : "s"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {host.slots
          .slice()
          .sort((a, b) => a.slot_id - b.slot_id)
          .map((slot) => (
            <SlotRow key={slot.slot_id} slot={slot} orchestratorUrl={orchestratorUrl} />
          ))}
      </CardContent>
    </Card>
  );
}

function SlotRow({ slot, orchestratorUrl }: { slot: FleetGitSlotHealth; orchestratorUrl: string }) {
  const badges = slotBadges(slot);
  const interesting = slot.repos.filter((r) => r.state !== "clean" || r.drift_violation);
  return (
    <div
      className="border-b border-[var(--color-border)] pb-2 last:border-0"
      data-testid={`fleet-slot-${slot.slot_id}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-[var(--color-text)]">slot {slot.slot_id}</span>
        {badges.map((b, i) => (
          <Chip key={i} tone={b.tone}>
            {b.label}
          </Chip>
        ))}
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
          ff:{slot.ff_pull_last_result ?? "?"}
        </span>
        {/* Snapshot timestamp — WHEN the reporter last posted, not just the derived "reporter dead"
            boolean above; also tells you which local AO instance's clock produced the row on a
            standalone/isolated host (per-host reporters post to their own local orchestrator). */}
        {fmtSnapshotAge(slot.reported_at) && (
          <span
            className="font-mono text-[10px] text-[var(--color-text-muted)]"
            title={fmtSnapshotTime(slot.reported_at) ?? undefined}
            data-testid={`fleet-slot-${slot.slot_id}-reported-at`}
          >
            snapshot {fmtSnapshotAge(slot.reported_at)}
          </span>
        )}
        {/* git-health click-through → the orchestrator UI (operator instruction). */}
        <OpenInOrchestrator url={orchestratorUrl} />
      </div>
      {interesting.length > 0 && (
        <div className="mt-1 pl-4 space-y-0.5">
          {interesting.map((r) => (
            <div key={r.name} className="flex gap-2 text-xs items-center">
              <span className={`font-mono ${r.drift_violation ? "text-red-400" : "text-[var(--color-text-muted)]"}`}>
                {r.name}
              </span>
              <span className="text-[var(--color-text-muted)]">{r.state}</span>
              {r.dirty_files > 0 && <span className="text-amber-400">{r.dirty_files} dirty</span>}
              {r.ahead > 0 && <span className="text-red-400">↑{r.ahead}</span>}
              {r.behind > 0 && <span className="text-amber-400">↓{r.behind}</span>}
              {r.drift_violation && <span className="text-red-400 font-semibold">DRIFT</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FleetGitContent() {
  const [proxy, setProxy] = useState<FleetGitHealthProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProxy(await getFleetGitHealth());
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
  const orchestratorUrl = proxy ? orchestratorFleetUrl(proxy.orchestrator_url) : "";

  return (
    <div className="space-y-4" data-testid="fleet-git-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Fleet Git-Health</h2>
          {proxy && <OpenInOrchestrator url={orchestratorUrl} />}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} data-testid="fleet-refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <Card data-testid="fleet-error">
          <CardContent className="py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Failed to load: {error}
          </CardContent>
        </Card>
      )}

      {proxy && !proxy.available && (
        <Card data-testid="fleet-unavailable">
          <CardContent className="py-3 text-sm text-[var(--color-text-muted)] space-y-2">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="h-4 w-4" /> Live fleet data unavailable
            </div>
            <p>{proxy.reason}</p>
            <p>
              The orchestrator owns slot/host git-status — open its Fleet Git-Health page directly:{" "}
              <OpenInOrchestrator url={orchestratorUrl} />
            </p>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-2" data-testid="fleet-summary">
            {summaryChipDefs(data.summary).map((c) => (
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

          {data.vm_errors.length > 0 && (
            <Card data-testid="fleet-vm-errors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Unreachable VMs ({data.vm_errors.length})</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-amber-400 space-y-0.5">
                {data.vm_errors.map((e, i) => (
                  <div key={i}>
                    <span className="font-mono">{e.vm_id}</span>: {e.error}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.hosts.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No slots have reported git-status yet.</p>
          ) : (
            <div className="space-y-3" data-testid="fleet-hosts">
              {data.hosts.map((host) => (
                <HostCard key={`${host.host}:${host.vm_id ?? ""}`} host={host} orchestratorUrl={orchestratorUrl} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
