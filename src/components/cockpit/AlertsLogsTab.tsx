/**
 * AlertsLogsTab — the cockpit's unified "Alerts & Logs" surface (Phase 0.7).
 *
 * Operator intent: ONE place that streams the Slack-bound alerts AND the live
 * VM / cluster logs, so the alert → cockpit → logs → redeploy walk happens here.
 * Folds the existing `AlertsContent` (the CI + DP_* alert ledger) and adds a
 * live log-tail driven by the unified SSE endpoint `GET /api/logs/stream/{ref}`
 * (which now covers live/long-lived clusters too — the 501 is closed).
 *
 * Deep-link: an alert row's "Stream logs" button routes to
 * `/cockpit?tab=alerts&logs=<target_ref>` — the cockpit owns `?tab`, this tab
 * owns the `?logs` sub-param (no collision). When `?logs` is present the log
 * tail auto-streams that target.
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md Phase 0.7.
 */

import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Radio } from "lucide-react";
import { AlertsContent } from "../../pages/Alerts";
import { StreamingLogsPanel } from "../StreamingLogsPanel";

export function AlertsLogsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const logsTarget = searchParams.get("logs") ?? "";
  const [draft, setDraft] = useState(logsTarget);

  const stream = useCallback(
    (target: string) => {
      const next = new URLSearchParams(searchParams);
      if (target) next.set("logs", target);
      else next.delete("logs");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div data-testid="cockpit-alerts-logs" className="space-y-6">
      <section data-testid="cockpit-alerts-section">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent-amber)]" />
          Alerts <span className="font-normal text-[var(--color-text-tertiary)]">— Slack-bound alert ledger</span>
        </h2>
        <AlertsContent />
      </section>

      <section data-testid="cockpit-logs-section">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Radio className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          Live logs <span className="font-normal text-[var(--color-text-tertiary)]">— VM backfill or live cluster</span>
        </h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            stream(draft.trim());
          }}
        >
          <input
            data-testid="cockpit-logs-target"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="VM name or live cluster (e.g. strategy-live-csb-001, execution-service)"
            className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)]"
          />
          <button
            type="submit"
            data-testid="cockpit-logs-stream-btn"
            className="rounded-md border border-[var(--color-accent-cyan)]/40 bg-[var(--color-accent-cyan)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-accent-cyan)]"
          >
            Stream logs
          </button>
        </form>
        {logsTarget ? (
          <StreamingLogsPanel targetRef={logsTarget} onClose={() => stream("")} />
        ) : (
          <p className="text-xs text-[var(--color-text-tertiary)]" data-testid="cockpit-logs-empty">
            Enter a target above, or click an alert's "Stream logs" deep-link, to tail its logs here.
          </p>
        )}
      </section>
    </div>
  );
}
