// Stopped & Orphaned VM management — the GCP idle-disk-spend surface.
//
// Renders the STOPPED/TERMINATED VM inventory from GET /api/fleet/orphans: how long each has
// been stopped, its lifecycle class, boot-disk size + ESTIMATED $/month, and a reap-verdict
// mirroring the zombie-watchdog gates. Offers a dry-run-first bulk reap (POST /api/fleet/reap)
// and a per-instance delete (DELETE /api/fleet/instances/{name}), both behind a confirm dialog.
//
// Why this exists: a stopped VM bills its boot disk forever (the 2026-06-30 incident: 127
// orphans, ~$330/mo). This makes that leak visible + actionable where an operator looks at VMs.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  deleteInstance,
  getOrphans,
  reapOrphans,
  type OrphanEntry,
  type OrphanInventoryResponse,
  type OrphanVerdict,
  type ReapResponse,
} from "../api/client";

const VERDICT_LABEL: Record<OrphanVerdict, string> = {
  reap: "Reapable",
  keep_within_grace: "Within grace",
  keep_not_ephemeral: "Live/recurring",
  keep_retained: "Retained (keep)",
  keep_no_timestamp: "No stop time",
};

function fmtAge(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function VerdictBadge({ verdict }: { verdict: OrphanVerdict }) {
  const variant = verdict === "reap" ? "warning" : "outline";
  return (
    <Badge variant={variant} data-testid={`orphan-verdict-${verdict}`}>
      {VERDICT_LABEL[verdict]}
    </Badge>
  );
}

export function FleetOrphansContent() {
  const [data, setData] = useState<OrphanInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Confirm-dialog state: either a bulk reap or a single-instance delete.
  const [confirmReap, setConfirmReap] = useState<ReapResponse | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OrphanEntry | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOrphans(24));
    } catch (err) {
      setError(err instanceof Error ? err.message : "orphan inventory unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Bulk reap: dry-run first to populate the confirm dialog with the real candidate list.
  const previewReap = useCallback(async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      setConfirmReap(await reapOrphans(true, 24));
    } catch (err) {
      setError(err instanceof Error ? err.message : "reap dry-run failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const executeReap = useCallback(async () => {
    setBusy(true);
    try {
      const res = await reapOrphans(false, 24);
      setActionMsg(`Reaped ${res.reaped_total} VM(s) — ~${fmtUsd(res.monthly_reclaimed_usd)}/mo disk reclaimed`);
      setConfirmReap(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "reap failed");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const executeDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const res = await deleteInstance(confirmDelete.name, confirmDelete.zone);
      setActionMsg(res.deleted ? `Deleted ${res.name}` : `Delete of ${res.name} was refused`);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  }, [confirmDelete, refresh]);

  return (
    <div data-testid="fleet-orphans">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          Stopped &amp; orphaned VMs (idle disk spend)
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
          data-testid="orphans-refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error ? (
        <div
          data-testid="fleet-orphans-error"
          className="mb-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Orphan inventory unavailable — <code className="font-mono">GET /api/fleet/orphans</code> failed ({error}).
          </span>
        </div>
      ) : null}

      {actionMsg ? (
        <div
          data-testid="fleet-orphans-action-msg"
          className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
        >
          {actionMsg}
        </div>
      ) : null}

      {/* Idle-spend rollup cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card data-testid="orphans-card-stopped">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Stopped VMs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">{data?.stopped_total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card data-testid="orphans-card-reapable">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Reapable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-amber-400">{data?.reapable_total ?? "—"}</p>
          </CardContent>
        </Card>
        <Card data-testid="orphans-card-idle-usd">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Idle disk $/mo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
              {data ? fmtUsd(data.monthly_idle_usd) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="orphans-card-reclaimable-usd">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Reclaimable $/mo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-400">{data ? fmtUsd(data.monthly_reapable_usd) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void previewReap()}
          disabled={busy || !data || data.reapable_total === 0}
          data-testid="orphans-reap-btn"
        >
          Reap {data?.reapable_total ?? 0} reapable
        </Button>
        {data ? (
          <span className="text-xs text-[var(--color-text-tertiary)]">
            estimate — asia-northeast1 list rates; grace {data.grace_hours}h; generated {data.generated_at}
          </span>
        ) : null}
      </div>

      {/* Orphan table */}
      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-xs" data-testid="orphans-table">
          <thead className="text-[var(--color-text-tertiary)]">
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2 text-left">VM</th>
              <th className="px-3 py-2 text-left">Lifecycle</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-right">Stopped</th>
              <th className="px-3 py-2 text-right">Disk</th>
              <th className="px-3 py-2 text-right">$/mo</th>
              <th className="px-3 py-2 text-left">Verdict</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data?.orphans ?? []).map((o) => (
              <tr
                key={`${o.name}:${o.zone}`}
                className="border-b border-[var(--color-border)]/50"
                data-testid={`orphan-row-${o.name}`}
              >
                <td className="px-3 py-2 font-mono">{o.name}</td>
                <td className="px-3 py-2">{o.lifecycle_class}</td>
                <td className="px-3 py-2">{o.status}</td>
                <td className="px-3 py-2 text-right">{fmtAge(o.stopped_age_hours)}</td>
                <td className="px-3 py-2 text-right">
                  {o.boot_disk_gb ? `${o.boot_disk_gb}GB ${o.boot_disk_type ?? ""}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">{fmtUsd(o.monthly_disk_usd)}</td>
                <td className="px-3 py-2">
                  <VerdictBadge verdict={o.verdict} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(o)}
                    disabled={busy}
                    data-testid={`orphan-delete-${o.name}`}
                    title="Delete this stopped instance + its boot disk"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {data && data.orphans.length === 0 ? (
              <tr>
                <td
                  className="px-3 py-4 text-center text-[var(--color-text-tertiary)]"
                  colSpan={8}
                  data-testid="orphans-empty"
                >
                  No stopped VMs — the fleet is clean.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Bulk-reap confirm dialog (populated from the dry-run preview) */}
      <Dialog open={confirmReap !== null} onClose={() => setConfirmReap(null)}>
        <DialogContent>
          <div data-testid="orphans-reap-dialog">
            <DialogHeader>
              <DialogTitle>Reap {confirmReap?.candidate_total ?? 0} abandoned VM(s)?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Deletes each instance + its boot disk (~
              {fmtUsd(confirmReap?.results.reduce((a, r) => a + r.monthly_disk_usd, 0) ?? 0)}
              /mo). Only ephemeral VMs stopped past the grace window are included; this cannot be undone.
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs font-mono">
              {(confirmReap?.results ?? []).map((r) => (
                <li key={r.name}>
                  {r.name} <span className="text-[var(--color-text-tertiary)]">({fmtUsd(r.monthly_disk_usd)}/mo)</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmReap(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void executeReap()}
                disabled={busy}
                data-testid="orphans-reap-confirm"
              >
                Reap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-instance delete confirm dialog */}
      <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)}>
        <DialogContent>
          <div data-testid="orphans-delete-dialog">
            <DialogHeader>
              <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Deletes this stopped instance and its boot disk (~{fmtUsd(confirmDelete?.monthly_disk_usd ?? 0)}/mo). This
              cannot be undone.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void executeDelete()}
                disabled={busy}
                data-testid="orphans-delete-confirm"
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
