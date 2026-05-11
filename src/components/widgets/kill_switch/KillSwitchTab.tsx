/**
 * KillSwitchTab — top-level kill-switch tab.
 *
 * Plan: `disaster_recovery_circuit_breakers_2026_05_10.md` Phase 7.B.
 *
 * Two sub-views (operator decision 2026-05-10 — kill-switches need
 * top-level visibility per CLAUDE.md "Service Infrastructure
 * Requirements" — lands as 7th lifecycle-managed tab rather than folded
 * into Monitor):
 *
 *   1. Active switches — KillSwitchPanel list. Polls
 *      `GET /api/kill-switch/state` every 5s for real-time arming
 *      state (cf. Phase 7.A endpoint).
 *   2. Audit log — AuditLogViewer with paginated entries.
 *
 * Header: count of currently-armed switches as a critical-red badge.
 */

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

import { AuditLogViewer } from "./AuditLogViewer";
import type { KillSwitchState } from "./KillSwitchPanel";
import { KillSwitchPanel } from "./KillSwitchPanel";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../ui/card";

// ---------------------------------------------------------------------------
// Polling interval — 5s per task description. Matches the alerting tier-1
// staleness threshold (30s) divided by ~6 for snappy operator feedback
// when arming/disarming under stress.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// API surface — fetch all kill switches' state.
// ---------------------------------------------------------------------------

export interface KillSwitchStateResponse {
  switches: KillSwitchState[];
  refreshed_at: string;
}

export async function fetchKillSwitchState(): Promise<KillSwitchStateResponse> {
  const response = await fetch("/api/kill-switch/state", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to load kill-switch state: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as KillSwitchStateResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; response: KillSwitchStateResponse }
  | { kind: "error"; message: string };

type SubView = "active" | "audit";

export function KillSwitchTab(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [subView, setSubView] = useState<SubView>("active");

  const load = useCallback(async () => {
    try {
      const response = await fetchKillSwitchState();
      setState({ kind: "loaded", response });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    setState({ kind: "loading" });
    void load();
    if (subView !== "active") return;
    const handle = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(handle);
    };
  }, [load, subView]);

  const armedCount =
    state.kind === "loaded"
      ? state.response.switches.filter((s) => s.armed).length
      : 0;

  return (
    <Card data-testid="kill-switch-tab">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-3">
              Kill switches
              {state.kind === "loaded" && armedCount > 0 ? (
                <Badge
                  variant="error"
                  data-testid="kill-switch-armed-count"
                >
                  {armedCount} ARMED
                </Badge>
              ) : null}
              {state.kind === "loaded" && armedCount === 0 ? (
                <Badge
                  variant="success"
                  data-testid="kill-switch-armed-count"
                >
                  0 armed
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              Per-switch arm / disarm + audit-log view. Polls{" "}
              <code>/api/kill-switch/state</code> every {POLL_INTERVAL_MS / 1000}s
              for real-time arming state.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant={subView === "active" ? "default" : "outline"}
              size="sm"
              onClick={() => setSubView("active")}
              data-testid="kill-switch-subview-active"
            >
              Active switches
            </Button>
            <Button
              variant={subView === "audit" ? "default" : "outline"}
              size="sm"
              onClick={() => setSubView("audit")}
              data-testid="kill-switch-subview-audit"
            >
              Audit log
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {subView === "active" ? (
          <ActiveSwitchesView state={state} onAction={() => void load()} />
        ) : (
          <AuditLogViewer />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active-switches sub-view — list of KillSwitchPanel.
// ---------------------------------------------------------------------------

interface ActiveSwitchesViewProps {
  state: LoadState;
  onAction: () => void;
}

function ActiveSwitchesView({
  state,
  onAction,
}: ActiveSwitchesViewProps): ReactElement {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <p
        data-testid="kill-switch-loading"
        className="text-sm text-[var(--color-text-muted)]"
      >
        Loading kill-switch state…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        data-testid="kill-switch-error"
        className="rounded-md border border-[var(--color-status-error-border-strong)] bg-[var(--color-status-error-bg)] p-4 text-sm text-[var(--color-accent-red)]"
      >
        <p className="font-medium">Failed to load kill-switch state</p>
        <p className="mt-1 text-[var(--color-text-secondary)]">
          {state.message}
        </p>
      </div>
    );
  }
  if (state.response.switches.length === 0) {
    return (
      <div
        data-testid="kill-switch-empty"
        className="rounded-md border border-dashed border-[var(--color-border-default)] p-6 text-center"
      >
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          No kill switches registered yet.
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Kill-switch registry seeds on deployment-api boot. If you expect
          switches to be present, verify the
          <code className="mx-1">/api/kill-switch/state</code> endpoint is
          wired per Phase 7.A.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="kill-switch-list">
      <p className="text-xs text-[var(--color-text-muted)]">
        Last refreshed:{" "}
        <time dateTime={state.response.refreshed_at}>
          {state.response.refreshed_at}
        </time>
      </p>
      {state.response.switches.map((sw) => (
        <KillSwitchPanel
          key={sw.switch_id}
          state={sw}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
