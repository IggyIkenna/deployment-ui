/**
 * VmResourceComparison — cross-VM CPU/mem/disk rolling-window comparison.
 *
 * The right-sizing workflow the operator asked for (deployment_ui_observability_ux_tracker
 * 2026-07-17): "ten different VMs running instruments-service — what were their resources?"
 * Backed by the durable `resource_samples` BigQuery table via
 * GET /api/vm-resources/rolling (deployment_durable_operational_data_bigquery_2026_07_21.md).
 *
 * Route: /ops/vm-resources.
 */

import { Fragment, useEffect, useState } from "react";
import { Activity, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  getNetworkFlowSummary,
  getProcessCategoryBreakdown,
  getResourceRollingWindow,
  getWatchdogKillEvents,
  type NetworkFlowSummaryRow,
  type ProcessCategoryRow,
  type ResourceRollingWindowRow,
  type ResourceWindow,
  type WatchdogKillEventRow,
} from "../api/deploymentApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const RESOURCE_WINDOWS: ResourceWindow[] = ["1h", "4h", "24h", "1wk"];

// GET /api/watchdog/kill-events takes an `hours` lookback (1-168); map the UI window
// selector onto it so the kill-events panel tracks the same window as the resource view.
const WINDOW_HOURS: Record<ResourceWindow, number> = {
  "1h": 1,
  "4h": 4,
  "24h": 24,
  "1wk": 168,
};

// The AO/orchestrator host runs the resource-watchdog (RW_VM_NAME in its systemd unit)
// but is NOT a deployment-service-launched VM, so it has no resource_samples rows and
// never appears in the rolling table below. Its kill/violation events are still
// queryable via GET /api/watchdog/kill-events?vm_name=..., so we pin a dedicated surface
// for it here rather than gating on the resource table. SSOT:
// watchdog_kill_events_deployment_gaps_2026_08_05.md (Gap 2) +
// unified-trading-pm/scripts/infra/resource-watchdog/resource-watchdog.service.
const AO_HOST_VM_NAME = "ip-172-31-5-118";

type SortKey =
  | "vm_name"
  | "avg_cpu_pct"
  | "avg_mem_pct"
  | "avg_disk_pct"
  | "avg_net_recv_rate_bytes_sec"
  | "avg_net_sent_rate_bytes_sec";

// process_category_sampler.py's categorize() -- keep in sync with that SSOT.
const CATEGORY_COLORS: Record<string, string> = {
  worker_agent: "var(--color-accent-cyan)",
  ao_plan_work: "var(--color-accent-purple)",
  ci: "var(--color-accent-amber)",
  orchestrator: "var(--color-accent-green)",
  other: "var(--color-text-muted)",
};

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

/** Scales `v` bytes into the largest whole unit (B/KB/MB/GB), returning [value, unit]. */
function scaleBytes(v: number): [number, string] {
  const units = ["B", "KB", "MB", "GB"];
  let value = v;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return [value, units[unitIdx]];
}

/** Bytes/sec -> a human-scaled rate string (B/s, KB/s, MB/s, GB/s). */
function fmtBytesRate(v: number | null): string {
  if (v == null) return "—";
  const [value, unit] = scaleBytes(v);
  return `${value.toFixed(value >= 10 || unit === "B" ? 0 : 1)} ${unit}/s`;
}

/** A byte TOTAL (not a rate) -> a human-scaled string (B, KB, MB, GB) — no "/s" suffix. */
function fmtBytes(v: number | null): string {
  if (v == null) return "—";
  const [value, unit] = scaleBytes(v);
  return `${value.toFixed(value >= 10 || unit === "B" ? 0 : 1)} ${unit}`;
}

/** ProcessCategoryRow[] -> one recharts datum per category, stacked-bar shaped (mirrors
 * DeploymentFrequencyChart's stackId="a" pattern) so a single bar shows the CPU-share split. */
function toChartDatum(rows: ProcessCategoryRow[]): Record<string, string | number> {
  const datum: Record<string, string | number> = { window: "avg CPU %" };
  for (const row of rows) {
    datum[row.category] = row.avg_cpu_pct ?? 0;
  }
  return datum;
}

/** Shared watchdog kill/violation-events table, used by the per-VM expanded panel and the
 * AO-host surface. `testId` is distinct per call-site so specs can target each table
 * without a strict-mode ambiguity. */
function KillEventsTable({ rows, testId = "kill-events-table" }: { rows: WatchdogKillEventRow[]; testId?: string }) {
  return (
    <table className="w-full text-xs" data-testid={testId}>
      <thead>
        <tr className="text-left text-[var(--color-text-muted)]">
          <th className="py-1 pr-3">Timestamp</th>
          <th className="py-1 pr-3">Command</th>
          <th className="py-1 pr-3">Reason</th>
          <th className="py-1 pr-3">RSS / limit</th>
          <th className="py-1 pr-3">Killed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((k, idx) => (
          <tr key={`${k.ts}:${k.pid}:${idx}`} data-testid="kill-events-row">
            <td className="py-1 pr-3 font-mono whitespace-nowrap">{k.ts}</td>
            <td className="py-1 pr-3 font-mono">{k.command}</td>
            <td className="py-1 pr-3">{k.reason}</td>
            <td className="py-1 pr-3 font-mono">
              {k.rss_mb} / {k.limit_mb} MB
            </td>
            <td className="py-1 pr-3">{k.killed ? "yes" : "no"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function VmResourceComparison() {
  const [windowSel, setWindowSel] = useState<ResourceWindow>("1h");
  const [serviceFilter, setServiceFilter] = useState("");
  const [rows, setRows] = useState<ResourceRollingWindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("avg_cpu_pct");
  const [expandedVm, setExpandedVm] = useState<string | null>(null);
  const [categoryRows, setCategoryRows] = useState<Record<string, ProcessCategoryRow[]>>({});
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [killRows, setKillRows] = useState<Record<string, WatchdogKillEventRow[]>>({});
  const [killLoading, setKillLoading] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);
  const [networkFlowRows, setNetworkFlowRows] = useState<Record<string, NetworkFlowSummaryRow | null>>({});
  const [networkFlowLoading, setNetworkFlowLoading] = useState(false);
  const [networkFlowError, setNetworkFlowError] = useState<string | null>(null);
  // AO-host kill/violation events — always queried (the AO host has no resource_samples
  // row to gate on), tracking the same window selector as the resource view.
  const [aoHostKills, setAoHostKills] = useState<WatchdogKillEventRow[]>([]);
  const [aoHostKillLoading, setAoHostKillLoading] = useState(false);
  const [aoHostKillError, setAoHostKillError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getResourceRollingWindow(windowSel)
      .then((r) => active && setRows(r.rows))
      .catch(() => active && setError("Failed to load rolling-window data"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [windowSel]);

  useEffect(() => {
    if (!expandedVm) return;
    let active = true;
    setCategoryLoading(true);
    setCategoryError(null);
    getProcessCategoryBreakdown(expandedVm, windowSel)
      .then((r) => active && setCategoryRows((prev) => ({ ...prev, [expandedVm]: r.rows })))
      .catch(() => active && setCategoryError("Failed to load process-category breakdown"))
      .finally(() => active && setCategoryLoading(false));
    return () => {
      active = false;
    };
  }, [expandedVm, windowSel]);

  useEffect(() => {
    if (!expandedVm) return;
    let active = true;
    setKillLoading(true);
    setKillError(null);
    getWatchdogKillEvents(expandedVm, WINDOW_HOURS[windowSel])
      .then((r) => active && setKillRows((prev) => ({ ...prev, [expandedVm]: r.rows })))
      .catch(() => active && setKillError("Failed to load watchdog kill events"))
      .finally(() => active && setKillLoading(false));
    return () => {
      active = false;
    };
  }, [expandedVm, windowSel]);

  useEffect(() => {
    if (!expandedVm) return;
    let active = true;
    setNetworkFlowLoading(true);
    setNetworkFlowError(null);
    getNetworkFlowSummary(expandedVm, windowSel)
      .then((r) => active && setNetworkFlowRows((prev) => ({ ...prev, [expandedVm]: r.rows[0] ?? null })))
      .catch(() => active && setNetworkFlowError("Failed to load network flow summary"))
      .finally(() => active && setNetworkFlowLoading(false));
    return () => {
      active = false;
    };
  }, [expandedVm, windowSel]);

  // AO-host surface — independent of the resource table; reads the same kill-events
  // endpoint filtered to the AO host's vm_name (see AO_HOST_VM_NAME above).
  useEffect(() => {
    let active = true;
    setAoHostKillLoading(true);
    setAoHostKillError(null);
    getWatchdogKillEvents(AO_HOST_VM_NAME, WINDOW_HOURS[windowSel])
      .then((r) => active && setAoHostKills(r.rows))
      .catch(() => active && setAoHostKillError("Failed to load AO host watchdog kill events"))
      .finally(() => active && setAoHostKillLoading(false));
    return () => {
      active = false;
    };
  }, [windowSel]);

  function toggleExpanded(vmName: string) {
    setExpandedVm((prev) => (prev === vmName ? null : vmName));
  }

  const filtered = rows
    .filter((r) => !serviceFilter || r.service.toLowerCase().includes(serviceFilter.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === "vm_name") return a.vm_name.localeCompare(b.vm_name);
      return (b[sortKey] ?? -1) - (a[sortKey] ?? -1);
    });

  return (
    <div className="p-6 space-y-4" data-testid="vm-resource-comparison-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--color-accent-cyan)]" />
            VM Resource Comparison
          </h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            Rolling avg/p95 CPU · mem · disk · network in/out per VM, from the durable resource_samples BigQuery table.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by service…"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            data-testid="vm-resource-comparison-service-filter"
            className="text-xs px-2 py-1 rounded border border-[var(--color-border)] bg-transparent"
          />
          <div className="flex gap-1" data-testid="vm-resource-comparison-window-selector">
            {RESOURCE_WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                data-testid={`vm-resource-comparison-window-${w}`}
                onClick={() => setWindowSel(w)}
                className={`text-xs px-2 py-1 rounded border ${
                  windowSel === w
                    ? "bg-[var(--color-accent-cyan)] text-black border-transparent"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>
              {filtered.length} VM{filtered.length === 1 ? "" : "s"} — last {windowSel}
            </span>
            {loading && <RefreshCw className="h-3 w-3 animate-spin text-[var(--color-text-muted)]" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-xs text-red-400" data-testid="vm-resource-comparison-error">
              {error}
            </p>
          ) : !loading && filtered.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]" data-testid="vm-resource-comparison-empty">
              No resource_samples rows for this window yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="vm-resource-comparison-table">
                <thead>
                  <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("vm_name")}>
                      VM
                    </th>
                    <th className="py-1 pr-3">Service</th>
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("avg_cpu_pct")}>
                      CPU (avg/p95)
                    </th>
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("avg_mem_pct")}>
                      Mem (avg/p95)
                    </th>
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("avg_disk_pct")}>
                      Disk (avg/p95)
                    </th>
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("avg_net_recv_rate_bytes_sec")}>
                      Net In (avg/p95)
                    </th>
                    <th className="py-1 pr-3 cursor-pointer" onClick={() => setSortKey("avg_net_sent_rate_bytes_sec")}>
                      Net Out (avg/p95)
                    </th>
                    <th className="py-1 pr-3">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isExpanded = expandedVm === r.vm_name;
                    const breakdown = categoryRows[r.vm_name];
                    const kills = killRows[r.vm_name];
                    const netFlow = networkFlowRows[r.vm_name];
                    return (
                      <Fragment key={`${r.vm_name}:${r.service}`}>
                        <tr
                          className="border-b border-[var(--color-border)]/50 cursor-pointer hover:bg-[var(--color-accent-dim)]"
                          data-testid="vm-resource-comparison-row"
                          onClick={() => toggleExpanded(r.vm_name)}
                        >
                          <td className="py-1 pr-3 font-mono flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 shrink-0" data-testid="process-breakdown-chevron-open" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0" />
                            )}
                            {r.vm_name}
                          </td>
                          <td className="py-1 pr-3">{r.service}</td>
                          <td className="py-1 pr-3">
                            {fmtPct(r.avg_cpu_pct)} / {fmtPct(r.p95_cpu_pct)}
                          </td>
                          <td className="py-1 pr-3">
                            {fmtPct(r.avg_mem_pct)} / {fmtPct(r.p95_mem_pct)}
                          </td>
                          <td className="py-1 pr-3">
                            {fmtPct(r.avg_disk_pct)} / {fmtPct(r.p95_disk_pct)}
                          </td>
                          <td className="py-1 pr-3">
                            {fmtBytesRate(r.avg_net_recv_rate_bytes_sec)} /{" "}
                            {fmtBytesRate(r.p95_net_recv_rate_bytes_sec)}
                          </td>
                          <td className="py-1 pr-3">
                            {fmtBytesRate(r.avg_net_sent_rate_bytes_sec)} /{" "}
                            {fmtBytesRate(r.p95_net_sent_rate_bytes_sec)}
                          </td>
                          <td className="py-1 pr-3">{r.sample_count}</td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${r.vm_name}:${r.service}:breakdown`}>
                            <td colSpan={8} className="pb-3 pt-1 pl-6" data-testid="process-breakdown-panel">
                              {categoryLoading && !breakdown ? (
                                <p className="text-xs text-[var(--color-text-muted)]">Loading process breakdown…</p>
                              ) : categoryError ? (
                                <p className="text-xs text-red-400" data-testid="process-breakdown-error">
                                  {categoryError}
                                </p>
                              ) : !breakdown || breakdown.length === 0 ? (
                                <p
                                  className="text-xs text-[var(--color-text-muted)]"
                                  data-testid="process-breakdown-empty"
                                >
                                  No process_samples rows for this VM/window yet.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Process-category breakdown — {r.vm_name}, last {windowSel}
                                  </p>
                                  <div data-testid="process-breakdown-chart" style={{ width: "100%", height: 80 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart
                                        layout="vertical"
                                        data={[toChartDatum(breakdown)]}
                                        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis
                                          type="number"
                                          unit="%"
                                          tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                                        />
                                        <YAxis type="category" dataKey="window" hide />
                                        <Tooltip
                                          contentStyle={{
                                            backgroundColor: "var(--color-surface)",
                                            border: "1px solid var(--color-border)",
                                            borderRadius: "6px",
                                            fontSize: 12,
                                          }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 10 }} />
                                        {breakdown.map((row) => (
                                          <Bar
                                            key={row.category}
                                            dataKey={row.category}
                                            name={row.category}
                                            stackId="a"
                                            fill={CATEGORY_COLORS[row.category] ?? "var(--color-text-muted)"}
                                          />
                                        ))}
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <table className="w-full text-xs" data-testid="process-breakdown-table">
                                    <thead>
                                      <tr className="text-left text-[var(--color-text-muted)]">
                                        <th className="py-1 pr-3">Category</th>
                                        <th className="py-1 pr-3">CPU (avg/max)</th>
                                        <th className="py-1 pr-3">Mem (avg/max)</th>
                                        <th className="py-1 pr-3">Distinct PIDs</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {breakdown.map((row) => (
                                        <tr key={row.category} data-testid="process-breakdown-row">
                                          <td className="py-1 pr-3">{row.category}</td>
                                          <td className="py-1 pr-3">
                                            {fmtPct(row.avg_cpu_pct)} / {fmtPct(row.max_cpu_pct)}
                                          </td>
                                          <td className="py-1 pr-3">
                                            {fmtPct(row.avg_mem_pct)} / {fmtPct(row.max_mem_pct)}
                                          </td>
                                          <td className="py-1 pr-3">{row.distinct_pids}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              <div
                                className="pt-3 mt-3 border-t border-[var(--color-border)]/50"
                                data-testid="kill-events-panel"
                              >
                                <p className="text-xs text-[var(--color-text-muted)] mb-1">
                                  Watchdog kill events — {r.vm_name}, last {windowSel}
                                </p>
                                {killLoading && !kills ? (
                                  <p className="text-xs text-[var(--color-text-muted)]">Loading kill events…</p>
                                ) : killError ? (
                                  <p className="text-xs text-red-400" data-testid="kill-events-error">
                                    {killError}
                                  </p>
                                ) : !kills || kills.length === 0 ? (
                                  <p className="text-xs text-[var(--color-text-muted)]" data-testid="kill-events-empty">
                                    No watchdog kill events for this VM in the last {windowSel}.
                                  </p>
                                ) : (
                                  <KillEventsTable rows={kills} />
                                )}
                              </div>
                              <div
                                className="pt-3 mt-3 border-t border-[var(--color-border)]/50"
                                data-testid="network-flow-panel"
                              >
                                <p className="text-xs text-[var(--color-text-muted)] mb-1">
                                  Network flows (same-region / cross-region / external) — {r.vm_name}, last {windowSel}
                                </p>
                                {networkFlowLoading && !netFlow ? (
                                  <p className="text-xs text-[var(--color-text-muted)]">
                                    Loading network flow summary…
                                  </p>
                                ) : networkFlowError ? (
                                  <p className="text-xs text-red-400" data-testid="network-flow-error">
                                    {networkFlowError}
                                  </p>
                                ) : !netFlow ? (
                                  <p
                                    className="text-xs text-[var(--color-text-muted)]"
                                    data-testid="network-flow-empty"
                                  >
                                    No network_flow_summary rows for this VM/window yet.
                                  </p>
                                ) : (
                                  <table className="w-full text-xs" data-testid="network-flow-table">
                                    <thead>
                                      <tr className="text-left text-[var(--color-text-muted)]">
                                        <th className="py-1 pr-3">Same-region</th>
                                        <th className="py-1 pr-3">Cross-region</th>
                                        <th className="py-1 pr-3">External</th>
                                        <th className="py-1 pr-3">Flows</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr data-testid="network-flow-row">
                                        <td className="py-1 pr-3">{fmtBytes(netFlow.same_region_bytes)}</td>
                                        <td className="py-1 pr-3">{fmtBytes(netFlow.cross_region_bytes)}</td>
                                        <td className="py-1 pr-3">{fmtBytes(netFlow.external_bytes)}</td>
                                        <td className="py-1 pr-3">{netFlow.flow_count}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AO-host watchdog kill events — not gated on resource_samples rows: the AO host
          runs the resource-watchdog but is not a deployment-service-launched VM, so it
          never appears in the rolling table above. Its kill/violation events are read
          directly from /api/watchdog/kill-events filtered to AO_HOST_VM_NAME. */}
      <Card data-testid="ao-host-kill-events-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>
              AO host ({AO_HOST_VM_NAME}) — watchdog kill events, last {windowSel}
            </span>
            {aoHostKillLoading && <RefreshCw className="h-3 w-3 animate-spin text-[var(--color-text-muted)]" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">
            The AO host runs the resource-watchdog but has no resource_samples row, so its kill/violation events are
            surfaced here independently of the VM list.
          </p>
          {aoHostKillError ? (
            <p className="text-xs text-red-400" data-testid="ao-host-kill-events-error">
              {aoHostKillError}
            </p>
          ) : aoHostKillLoading && aoHostKills.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">Loading kill events…</p>
          ) : aoHostKills.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]" data-testid="ao-host-kill-events-empty">
              No watchdog kill events for the AO host in the last {windowSel}.
            </p>
          ) : (
            <KillEventsTable rows={aoHostKills} testId="ao-host-kill-events-table" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
