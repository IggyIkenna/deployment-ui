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

import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { getResourceRollingWindow, type ResourceRollingWindowRow, type ResourceWindow } from "../api/deploymentApi";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const RESOURCE_WINDOWS: ResourceWindow[] = ["1h", "4h", "24h", "1wk"];

type SortKey = "vm_name" | "avg_cpu_pct" | "avg_mem_pct" | "avg_disk_pct";

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}

export function VmResourceComparison() {
  const [windowSel, setWindowSel] = useState<ResourceWindow>("1h");
  const [serviceFilter, setServiceFilter] = useState("");
  const [rows, setRows] = useState<ResourceRollingWindowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("avg_cpu_pct");

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
            Rolling avg/p95 CPU · mem · disk per VM, from the durable resource_samples BigQuery table.
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
                    <th className="py-1 pr-3">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={`${r.vm_name}:${r.service}`}
                      className="border-b border-[var(--color-border)]/50"
                      data-testid="vm-resource-comparison-row"
                    >
                      <td className="py-1 pr-3 font-mono">{r.vm_name}</td>
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
                      <td className="py-1 pr-3">{r.sample_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
