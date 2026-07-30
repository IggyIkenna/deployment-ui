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
 * Per-AG/VM picker (residual from data_pipeline_alert_substrate_residual_2026_07_24.md):
 * the free-text box below requires already knowing the exact VM name. The
 * asset-group → VM dropdowns derive their options from the SAME
 * `GET /api/deployments/inventory` census `Deployments.tsx`'s own filters use
 * (client-side option-derivation, no new backend endpoint) so an operator can
 * find a VM to tail without leaving the pane.
 *
 * Plan: unified_deployment_health_cockpit_2026_06_23.md Phase 0.7.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Radio } from "lucide-react";
import { AlertsContent } from "../../pages/Alerts";
import { StreamingLogsPanel } from "../StreamingLogsPanel";
import { getDeploymentInventory, type DeploymentItem } from "../../api/deploymentApi";

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

  // Per-AG/VM picker — one inventory fetch on mount, VM-kind rows only (Cloud Run
  // jobs/services don't stream VM lifecycle events). A malformed/empty response
  // (e.g. a test route stubbing a different shape) degrades to an empty list, never
  // a crash — honest absence, not a fabricated dropdown.
  const [vmItems, setVmItems] = useState<DeploymentItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    getDeploymentInventory({})
      .then((inv) => {
        if (cancelled) return;
        setVmItems((inv.items ?? []).filter((i) => i.kind === "VM"));
      })
      .catch(() => {
        /* keep the empty list — the manual text box still works */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [agSelect, setAgSelect] = useState("");
  const [vmSelect, setVmSelect] = useState("");

  const assetGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of vmItems) if (i.asset_group) set.add(i.asset_group);
    return Array.from(set).sort();
  }, [vmItems]);

  const vmOptions = useMemo(
    () =>
      agSelect
        ? vmItems
            .filter((i) => i.asset_group === agSelect)
            .map((i) => i.name)
            .sort()
        : [],
    [vmItems, agSelect],
  );

  const selectVm = useCallback(
    (name: string) => {
      setVmSelect(name);
      if (!name) return;
      setDraft(name);
      stream(name);
    },
    [stream],
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
          Live event stream{" "}
          <span className="font-normal text-[var(--color-text-tertiary)]">
            — per asset-group/VM tail, or a live cluster by name
          </span>
        </h2>
        <div className="mb-3 flex gap-2">
          <select
            data-testid="cockpit-logs-ag-select"
            value={agSelect}
            onChange={(e) => {
              setAgSelect(e.target.value);
              setVmSelect("");
            }}
            className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)]"
          >
            <option value="">Asset group…</option>
            {assetGroupOptions.map((ag) => (
              <option key={ag} value={ag}>
                {ag}
              </option>
            ))}
          </select>
          <select
            data-testid="cockpit-logs-vm-select"
            value={vmSelect}
            disabled={!agSelect}
            onChange={(e) => selectVm(e.target.value)}
            className="flex-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] disabled:opacity-50"
          >
            <option value="">{agSelect ? "VM…" : "Pick an asset group first"}</option>
            {vmOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
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
            placeholder="Or enter a VM name / live cluster manually (e.g. strategy-live-csb-001, execution-service)"
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
