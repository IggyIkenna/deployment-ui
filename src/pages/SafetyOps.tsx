import { Shield, ShieldAlert, ShieldCheck, Activity } from "lucide-react";

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

export function SafetyOps() {
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
          <p className="text-xs text-[var(--color-text-muted)] font-mono">
            Live wiring: alerting-service /safety-ops/manual-action
          </p>
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
          {/* Empty state skeleton */}
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3 flex items-center justify-between"
              >
                <div className="space-y-1.5">
                  <div className="h-3 w-32 rounded bg-[var(--color-border-default)] animate-pulse" />
                  <div className="h-3 w-20 rounded bg-[var(--color-border-default)] animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-5 w-16 rounded bg-[var(--color-border-default)] animate-pulse" />
                  <button
                    disabled
                    className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-400 opacity-50 cursor-not-allowed"
                  >
                    DISPUTE
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] font-mono">
            Live wiring: alerting-service GET /safety-ops/recovery-audit-signoffs
          </p>
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
          banned. Op-Ack = "investigating"; Audit-Ack = "reviewed + confirmed".
        </p>
        {/* Table skeleton */}
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
                      <button
                        disabled
                        data-testid="op-ack-button"
                        className="px-2 py-1 rounded border border-[var(--color-border-default)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
                      >
                        Op-Ack
                      </button>
                      <button
                        disabled
                        data-testid="audit-ack-button"
                        className="px-2 py-1 rounded border border-[var(--color-accent-cyan)]/30 text-[var(--color-accent-cyan)] opacity-50 cursor-not-allowed"
                      >
                        Audit-Ack
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] font-mono">
          Live wiring: alerting-service GET /safety-ops/audit-ack-queue · POST /safety-ops/incidents/{"{key}"}
          /operational-ack|audit-ack
        </p>
      </div>
    </div>
  );
}

/**
 * Chrome-less alias for embedding inside the cockpit "Safety" tab. The page uses
 * a `<div>` shell (no `<main>`), so it renders cleanly inside a cockpit TabsContent.
 */
export const SafetyOpsContent = SafetyOps;
