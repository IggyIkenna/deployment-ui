import { Activity, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getAuditAckQueue, getSignoffs, postAuditAck, postOperationalAck } from "../api/safetyOpsApi";
import type { AuditAckRow, SignoffRow } from "../api/safetyOpsApi";

const LAYER0_ACTIONS = [
  { id: "cancel_open_orders", label: "Cancel Open Orders", danger: true },
  { id: "kill_switch_activate", label: "Kill Switch — Activate", danger: true },
  { id: "freeze_strategy", label: "Freeze Strategy", danger: false },
  { id: "emergency_unwind", label: "Emergency Unwind", danger: true },
  { id: "disable_venue_adapter", label: "Disable Venue Adapter", danger: false },
  { id: "pause_execution_engine", label: "Pause Execution Engine", danger: false },
  { id: "flush_order_queue", label: "Flush Order Queue", danger: true },
  { id: "reset_circuit_breaker", label: "Reset Circuit Breaker", danger: false },
  { id: "force_close_position", label: "Force Close Position", danger: true },
  { id: "snapshot_risk_state", label: "Snapshot Risk State", danger: false },
] as const;

const VERDICT_COLOR: Record<string, string> = {
  APPROVED: "var(--color-accent-green)",
  DISPUTE_AUTOMATED_ACTION: "var(--color-accent-red)",
  ESCALATE_TO_HUMAN: "var(--color-accent-amber)",
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--color-accent-red)",
  HIGH: "var(--color-accent-amber)",
  MEDIUM: "var(--color-accent-cyan)",
  LOW: "var(--color-text-muted)",
};

function slaCountdown(dueAt: string): { label: string; overdue: boolean } {
  if (!dueAt) return { label: "—", overdue: false };
  const diffMs = new Date(dueAt).getTime() - Date.now();
  if (diffMs <= 0) return { label: "OVERDUE", overdue: true };
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return { label: `${String(hours)}h ${String(mins)}m`, overdue: false };
  if (mins > 0) return { label: `${String(mins)}m ${String(secs)}s`, overdue: false };
  return { label: `${String(secs)}s`, overdue: false };
}

const POLL_MS = 15_000;

export function SafetyOps() {
  const [signoffs, setSignoffs] = useState<SignoffRow[]>([]);
  const [queue, setQueue] = useState<AuditAckRow[]>([]);
  const [loadingSignoffs, setLoadingSignoffs] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acking, setAcking] = useState<Set<string>>(new Set());

  const loadAll = useCallback(() => {
    setLoadingSignoffs(true);
    setLoadingQueue(true);
    getSignoffs()
      .then(setSignoffs)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load verdicts"))
      .finally(() => setLoadingSignoffs(false));
    getAuditAckQueue()
      .then(setQueue)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load queue"))
      .finally(() => setLoadingQueue(false));
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, POLL_MS);
    return () => clearInterval(id);
  }, [loadAll]);

  const handleOpAck = async (incidentKey: string) => {
    setAcking((prev) => new Set([...prev, `op:${incidentKey}`]));
    try {
      await postOperationalAck(incidentKey);
      loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Op-Ack failed");
    } finally {
      setAcking((prev) => {
        const next = new Set(prev);
        next.delete(`op:${incidentKey}`);
        return next;
      });
    }
  };

  const handleAuditAck = async (incidentKey: string) => {
    setAcking((prev) => new Set([...prev, `audit:${incidentKey}`]));
    try {
      await postAuditAck(incidentKey);
      loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Audit-Ack failed");
    } finally {
      setAcking((prev) => {
        const next = new Set(prev);
        next.delete(`audit:${incidentKey}`);
        return next;
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30">
          <Shield className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]" data-testid="safety-ops-heading">
            Safety Ops
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            incident recovery · audit acknowledgement · layer-0 actions
          </p>
        </div>
      </div>

      {/* Role notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-amber-300">Execute actions</span> are restricted to Ikenna / Harsh /
          founder. Read view (audit queue + verdicts) is open to all authenticated operators.
        </p>
      </div>

      {error && (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs font-mono"
          style={{ color: "var(--color-accent-red)" }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Layer-0 Actions */}
        <div
          data-testid="layer0-panel"
          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--color-text-primary)]">Layer-0 Actions</h2>
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded">
              typed-confirm required
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Each action requires a typed confirmation string before execution. Every action flows through the Incident
            Gateway (full audit trail).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LAYER0_ACTIONS.map((action) => (
              <button
                key={action.id}
                disabled
                data-testid={`layer0-action-${action.id}`}
                className={`text-xs px-3 py-2 rounded border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.danger
                    ? "border-red-500/30 text-red-400 hover:bg-red-500/5"
                    : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* LLM Audit Verdicts Feed */}
        <div
          data-testid="llm-verdicts-panel"
          className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--color-text-primary)]">LLM Audit Verdicts</h2>
            <Activity className="h-4 w-4 text-[var(--color-text-muted)] animate-pulse" />
          </div>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            RecoveryAuditSignoff verdicts from the recovery-audit agent. DISPUTE escalates to SEV0 + SAFE_MODE_ACTIVE
            regardless of APPROVED verdict.
          </p>

          {loadingSignoffs && signoffs.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3"
                >
                  <div className="h-3 w-32 rounded bg-[var(--color-border-default)] animate-pulse" />
                </div>
              ))}
            </div>
          ) : signoffs.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] font-mono">No verdicts yet — queue is clear.</p>
          ) : (
            <div className="space-y-2">
              {signoffs.map((s) => (
                <div
                  key={s.event_id}
                  data-testid={`signoff-${s.event_id}`}
                  className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3 flex items-start justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0">
                    <p
                      className="text-xs font-mono font-medium truncate"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {s.parent_incident_key}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--color-text-tertiary)" }}>
                      {s.narrative}
                    </p>
                    <p className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(s.timestamp).toLocaleTimeString()} · {s.llm_model}
                      {s.confidence != null ? ` · ${(s.confidence * 100).toFixed(0)}%` : ""}
                    </p>
                  </div>
                  <span
                    className="text-xs font-mono font-semibold shrink-0"
                    style={{ color: VERDICT_COLOR[s.verdict] ?? "var(--color-text-muted)" }}
                  >
                    {s.verdict}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit-Ack Queue */}
      <div
        data-testid="audit-ack-queue-panel"
        className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">Audit-Ack Queue</h2>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--color-text-muted)]" />
            <span className="text-xs font-mono text-[var(--color-text-muted)]">SLA: SEV0 5min · SEV1 2h · SEV2 6h</span>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Incidents awaiting human audit acknowledgement. Even APPROVED LLM verdict requires human ack — auto-close is
          banned. Op-Ack = &#34;investigating&#34;; Audit-Ack = &#34;reviewed + confirmed&#34;.
        </p>

        {loadingQueue && queue.length === 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">Incident Key</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">Severity</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">SLA Countdown</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">LLM Verdict</th>
                  <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2].map((i) => (
                  <tr key={i} className="border-b border-[var(--color-border-default)]/50">
                    <td className="py-2 pr-4">
                      <div className="h-3 w-36 rounded bg-[var(--color-border-default)] animate-pulse" />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="h-3 w-12 rounded bg-[var(--color-border-default)] animate-pulse" />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="h-3 w-20 rounded bg-[var(--color-border-default)] animate-pulse" />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="h-3 w-16 rounded bg-[var(--color-border-default)] animate-pulse" />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-6 w-14 rounded bg-[var(--color-border-default)] animate-pulse" />
                        <div className="h-6 w-18 rounded bg-[var(--color-border-default)] animate-pulse" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : queue.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] font-mono">Queue is empty — no pending audit-acks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">Incident Key</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">Severity</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">SLA Countdown</th>
                  <th className="text-left py-2 pr-4 text-[var(--color-text-muted)] font-medium">LLM Verdict</th>
                  <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => {
                  const { label: slaLabel, overdue } = slaCountdown(row.audit_ack_due_at);
                  const opBusy = acking.has(`op:${row.incident_key}`);
                  const auditBusy = acking.has(`audit:${row.incident_key}`);
                  return (
                    <tr
                      key={row.incident_key}
                      data-testid={`queue-row-${row.incident_key}`}
                      className="border-b border-[var(--color-border-default)]/50"
                    >
                      <td className="py-2 pr-4 font-mono" style={{ color: "var(--color-text-primary)" }}>
                        {row.incident_key}
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          className="font-semibold"
                          style={{
                            color: SEV_COLOR[row.severity] ?? "var(--color-text-muted)",
                          }}
                        >
                          {row.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        <span
                          style={{
                            color: overdue ? "var(--color-accent-red)" : "var(--color-text-secondary)",
                            fontWeight: overdue ? 700 : undefined,
                          }}
                        >
                          {slaLabel}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span
                          style={{
                            color: VERDICT_COLOR[row.llm_verdict ?? ""] ?? "var(--color-text-muted)",
                          }}
                        >
                          {row.llm_verdict ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            data-testid={`op-ack-${row.incident_key}`}
                            disabled={opBusy}
                            onClick={() => void handleOpAck(row.incident_key)}
                            className="px-2 py-1 rounded border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-text-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {opBusy ? "…" : "Op-Ack"}
                          </button>
                          <button
                            data-testid={`audit-ack-${row.incident_key}`}
                            disabled={auditBusy}
                            onClick={() => void handleAuditAck(row.incident_key)}
                            className="px-2 py-1 rounded border border-[var(--color-accent-cyan)]/30 text-[var(--color-accent-cyan)] hover:bg-[var(--color-accent-cyan)]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {auditBusy ? "…" : "Audit-Ack"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
