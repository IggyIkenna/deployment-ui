/**
 * ChangeFreezeBanner — standing banner for an active change-freeze window (G5).
 *
 * Reads GET /api/change-freeze/status, which proxies the Firestore verdict-store
 * unified-trading-pm's change-freeze-check.yml (the inline bash recurrence/DST evaluator,
 * plans/ops/change-freeze-calendar.csv) writes on every invocation (cloud-build-router.yml /
 * cloud-build-router-aws.yml / freeze-deferred-build-replay.yml / overnight-agent-orchestrator.yml).
 *
 * **This banner is a pure READ — it never re-evaluates the recurrence/DST calendar logic itself.**
 * Reimplementing 6 recurrence types + DST notes in TypeScript would risk drifting from the real
 * gate (the exact trap flagged when this panel was first scoped). Renders nothing when both
 * PROD_DEPLOY and AUTONOMOUS read CLEAR — a freeze block is the actionable, standing-banner-worthy
 * state (mirrors the promotion-stalled banner's render-only-when-something's-wrong contract).
 *
 * Self-contained fetch + 60s poll (mirrors GhRateBudget / VersionCoherencePanel).
 *
 * Plan: unified-trading-pm/plans/active/monitoring_control_plane_master_2026_06_10.md (G5 item).
 */

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { getChangeFreezeStatus, type ChangeFreezeStatus } from "../api/client";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";

const REFRESH_INTERVAL_MS = 60_000;

const CHECK_TYPE_LABELS: Record<string, string> = {
  PROD_DEPLOY: "prod deploy",
  AUTONOMOUS: "autonomous ops",
};

export function ChangeFreezeBanner() {
  const [data, setData] = useState<ChangeFreezeStatus | null>(null);

  const load = useCallback(() => {
    getChangeFreezeStatus()
      .then(setData)
      .catch(() => {
        /* degrade silently — no banner shown; the panel's own overview API errors already surface
         * top-level page errors, this is a supplementary signal only. */
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useVisibilityPausedInterval(load, REFRESH_INTERVAL_MS);

  if (!data) return null;
  const blocked = Object.entries(data.checks).filter(([, v]) => v.verdict === "BLOCKED");
  if (blocked.length === 0) return null;

  return (
    <div
      data-testid="change-freeze-banner"
      className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <span className="text-red-300">
        <span className="font-medium">Change freeze active</span> —{" "}
        {blocked.map(([checkType, v], i) => (
          <span key={checkType} data-testid={`change-freeze-blocked-${checkType}`}>
            <span className="font-medium">{CHECK_TYPE_LABELS[checkType] ?? checkType}</span> blocked
            {v.reason ? `: ${v.reason}` : ""}
            {i < blocked.length - 1 ? "; " : ""}
          </span>
        ))}
      </span>
    </div>
  );
}
