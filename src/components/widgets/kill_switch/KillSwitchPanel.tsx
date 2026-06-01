/**
 * KillSwitchPanel — per-switch arm/disarm UI.
 *
 * Plan: `disaster_recovery_circuit_breakers_2026_05_10.md` Phase 7.B.
 *
 * Renders a single KillSwitchId panel with:
 *   - switch_id name + scope description
 *   - current state (ARMED / DISARMED) badge
 *   - provenance + armed_at timestamp (when armed)
 *   - "Arm" button → confirmation dialog with metadata textarea + requested_by
 *   - "Disarm" button → confirmation dialog (only when currently armed)
 *
 * Operator-auth-gated implicitly via the top-level `RequireAuth` wrapper in
 * `App.tsx` — see `src/auth/RequireAuth.tsx`. The arm/disarm POSTs ride the
 * already-authenticated session; confirmation dialog adds the second-factor
 * "are you sure" gate so a misclick on a critical (red) switch can't fire.
 *
 * Color-coded per scope (operator decision 2026-05-10 — kill-switches need
 * top-level visibility per CLAUDE.md "Service Infrastructure Requirements"):
 *   GLOBAL       → critical red (most destructive: stops every archetype)
 *   ASSET_GROUP  → red (stops one asset_group: cefi / defi / tradfi / etc.)
 *   VENUE        → orange (stops one venue across archetypes)
 *   ARCHETYPE    → yellow (stops one archetype across venues)
 */

import type { ReactElement } from "react";
import { useState } from "react";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

// ---------------------------------------------------------------------------
// UAC contract types — mirror
// `unified_api_contracts.canonical.crosscutting.kill_switch.*` (Phase 1.B).
// Inlined here as a Phase 7.B stub; lift to a shared types module when the
// deployment-api `/api/kill-switch/state` route lands per Phase 7.A.
// ---------------------------------------------------------------------------

export type KillSwitchScope = "GLOBAL" | "ASSET_GROUP" | "VENUE" | "ARCHETYPE";

export type KillSwitchProvenance =
  | "operator"
  | "breaker"
  | "scenario"
  | "scheduled";

export interface KillSwitchState {
  switch_id: string;
  scope: KillSwitchScope;
  scope_value: string | null; // e.g. "cefi" for ASSET_GROUP, "binance" for VENUE
  description: string;
  armed: boolean;
  armed_at: string | null;
  armed_by: string | null;
  provenance: KillSwitchProvenance | null;
  metadata: Record<string, string> | null;
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export interface KillSwitchArmRequest {
  switch_id: string;
  requested_by: string;
  metadata: Record<string, string>;
}

export interface KillSwitchDisarmRequest {
  switch_id: string;
  disarmed_by: string;
  metadata: Record<string, string>;
}

async function armSwitch(req: KillSwitchArmRequest): Promise<void> {
  const response = await fetch(`/api/kill-switch/${req.switch_id}/arm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      requested_by: req.requested_by,
      metadata: req.metadata,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to arm ${req.switch_id}: ${response.status} ${response.statusText}`,
    );
  }
}

async function disarmSwitch(req: KillSwitchDisarmRequest): Promise<void> {
  const response = await fetch(`/api/kill-switch/${req.switch_id}/disarm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      disarmed_by: req.disarmed_by,
      metadata: req.metadata,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to disarm ${req.switch_id}: ${response.status} ${response.statusText}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Scope-based color coding (per task description + CLAUDE.md
// "Service Infrastructure Requirements"). Uses badge variants from the
// existing UI primitive set; `error` = red, `warning` = amber/orange,
// `pending` = neutral for disarmed.
// ---------------------------------------------------------------------------

function scopeBadgeVariant(scope: KillSwitchScope): "error" | "warning" {
  switch (scope) {
    case "GLOBAL":
      return "error";
    case "ASSET_GROUP":
      return "error";
    case "VENUE":
      return "warning";
    case "ARCHETYPE":
      return "warning";
  }
}

function scopeBadgeLabel(scope: KillSwitchScope): string {
  return scope.replace("_", " ");
}

// ---------------------------------------------------------------------------
// Confirmation dialog — used for both arm + disarm. Forces a `requested_by`
// + metadata-textarea entry so every state change has provenance and an
// audit trail. The second-factor "Confirm" button is the gate that
// prevents misclick-induced kill events.
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  switchId: string;
  action: "arm" | "disarm";
  onClose: () => void;
  onConfirm: (requestedBy: string, metadata: Record<string, string>) => void;
  isSubmitting: boolean;
}

function ConfirmDialog({
  open,
  switchId,
  action,
  onClose,
  onConfirm,
  isSubmitting,
}: ConfirmDialogProps): ReactElement | null {
  const [requestedBy, setRequestedBy] = useState("");
  const [metadataText, setMetadataText] = useState("");

  const handleConfirm = () => {
    const metadata: Record<string, string> = {};
    if (metadataText.trim().length > 0) {
      metadata.note = metadataText.trim();
    }
    onConfirm(requestedBy.trim(), metadata);
  };

  const isValid = requestedBy.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>
          {action === "arm" ? "Arm" : "Disarm"} kill switch:{" "}
          <code className="font-mono">{switchId}</code>
        </DialogTitle>
      </DialogHeader>
      <DialogContent>
        <div className="space-y-4" data-testid="kill-switch-confirm-dialog">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {action === "arm"
              ? "Arming this kill switch will block all matching trading activity until the switch is explicitly disarmed. This action is logged with provenance and is auditable."
              : "Disarming this kill switch will restore trading activity for the matching scope. This action is logged with provenance and is auditable."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="requested-by">
              {action === "arm" ? "Requested by" : "Disarmed by"} (operator id)
            </Label>
            <Input
              id="requested-by"
              data-testid="kill-switch-requested-by"
              value={requestedBy}
              onChange={(e) => {
                setRequestedBy(e.target.value);
              }}
              placeholder="e.g. ikenna@odum-research.com"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metadata">
              Metadata / justification (optional)
            </Label>
            <textarea
              id="metadata"
              data-testid="kill-switch-metadata"
              value={metadataText}
              onChange={(e) => {
                setMetadataText(e.target.value);
              }}
              placeholder="Free-form reason, ticket link, runbook step, etc."
              rows={4}
              className="flex w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              data-testid="kill-switch-confirm-submit"
              variant={action === "arm" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting
                ? action === "arm"
                  ? "Arming…"
                  : "Disarming…"
                : action === "arm"
                  ? "Confirm arm"
                  : "Confirm disarm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Top-level panel
// ---------------------------------------------------------------------------

interface KillSwitchPanelProps {
  state: KillSwitchState;
  onAction: () => void; // parent re-fetches state after arm/disarm
}

export function KillSwitchPanel({
  state,
  onAction,
}: KillSwitchPanelProps): ReactElement {
  const [dialogAction, setDialogAction] = useState<"arm" | "disarm" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    requestedBy: string,
    metadata: Record<string, string>,
  ) => {
    if (dialogAction === null) return;
    setSubmitting(true);
    setError(null);
    try {
      if (dialogAction === "arm") {
        await armSwitch({
          switch_id: state.switch_id,
          requested_by: requestedBy,
          metadata,
        });
      } else {
        await disarmSwitch({
          switch_id: state.switch_id,
          disarmed_by: requestedBy,
          metadata,
        });
      }
      setDialogAction(null);
      onAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const scopeVariant = scopeBadgeVariant(state.scope);
  const armedBadgeVariant = state.armed ? "error" : "success";

  return (
    <div
      data-testid={`kill-switch-panel-${state.switch_id}`}
      className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm font-semibold text-[var(--color-text-primary)]">
              {state.switch_id}
            </code>
            <Badge
              variant={scopeVariant}
              data-testid={`kill-switch-scope-${state.switch_id}`}
            >
              {scopeBadgeLabel(state.scope)}
              {state.scope_value ? `: ${state.scope_value}` : ""}
            </Badge>
            <Badge
              variant={armedBadgeVariant}
              data-testid={`kill-switch-state-${state.switch_id}`}
            >
              {state.armed ? "ARMED" : "DISARMED"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {state.description}
          </p>
          {state.armed && state.armed_at ? (
            <div className="mt-2 text-xs text-[var(--color-text-muted)] space-y-0.5">
              <p>
                Armed at:{" "}
                <time dateTime={state.armed_at}>{state.armed_at}</time>
              </p>
              {state.armed_by ? <p>Armed by: {state.armed_by}</p> : null}
              {state.provenance ? <p>Provenance: {state.provenance}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 shrink-0">
          {state.armed ? (
            <Button
              data-testid={`kill-switch-disarm-${state.switch_id}`}
              variant="default"
              onClick={() => {
                setDialogAction("disarm");
              }}
            >
              Disarm
            </Button>
          ) : (
            <Button
              data-testid={`kill-switch-arm-${state.switch_id}`}
              variant="destructive"
              onClick={() => {
                setDialogAction("arm");
              }}
            >
              Arm
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <div
          data-testid={`kill-switch-error-${state.switch_id}`}
          className="mt-3 rounded-md border border-[var(--color-status-error-border-strong)] bg-[var(--color-status-error-bg)] p-2 text-sm text-[var(--color-accent-red)]"
        >
          {error}
        </div>
      ) : null}
      <ConfirmDialog
        open={dialogAction !== null}
        switchId={state.switch_id}
        action={dialogAction ?? "arm"}
        onClose={() => {
          setDialogAction(null);
        }}
        onConfirm={(by, md) => void handleSubmit(by, md)}
        isSubmitting={submitting}
      />
    </div>
  );
}
