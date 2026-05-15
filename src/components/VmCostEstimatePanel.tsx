import { useState } from "react";
import { fetchVmCostEstimate, type VmCostEstimateResponse } from "../api/deploymentApi";

const MACHINE_TYPES = [
  "n1-standard-1",
  "n1-standard-2",
  "n1-standard-4",
  "n1-standard-8",
  "n1-standard-16",
  "n1-highmem-4",
  "n1-highmem-8",
  "n2-standard-4",
  "n2-standard-8",
  "n2-highcpu-8",
] as const;

export function VmCostEstimatePanel() {
  const [machineType, setMachineType] = useState("n1-standard-4");
  const [runtimeHours, setRuntimeHours] = useState<string>("2");
  const [diskGb, setDiskGb] = useState<string>("50");
  const [count, setCount] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VmCostEstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hours = parseFloat(runtimeHours);
  const disk = parseInt(diskGb, 10);
  const cnt = parseInt(count, 10);
  const isValid = !isNaN(hours) && hours > 0 && !isNaN(disk) && disk >= 10 && !isNaN(cnt) && cnt >= 1;

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError(null);
    setResult(null);
    fetchVmCostEstimate({ machine_type: machineType, runtime_hours: hours, disk_gb: disk, count: cnt })
      .then((r) => { setResult(r); setLoading(false); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to estimate cost");
        setLoading(false);
      });
  }

  return (
    <div
      data-testid="vm-cost-estimate-panel"
      className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-3"
    >
      <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
        Cost Estimate
      </p>

      <form onSubmit={handleCalculate} data-testid="cost-estimate-form" className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="ce-machine-type">
            Machine type
          </label>
          <select
            id="ce-machine-type"
            data-testid="ce-machine-type"
            value={machineType}
            onChange={(e) => setMachineType(e.target.value)}
            className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
          >
            {MACHINE_TYPES.map((mt) => (
              <option key={mt} value={mt}>{mt}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="ce-hours">
            Runtime hours
          </label>
          <input
            id="ce-hours"
            data-testid="ce-hours"
            type="number"
            min="0.5"
            max="720"
            step="0.5"
            value={runtimeHours}
            onChange={(e) => setRuntimeHours(e.target.value)}
            className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs font-mono text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="ce-disk">
            Disk (GB)
          </label>
          <input
            id="ce-disk"
            data-testid="ce-disk"
            type="number"
            min="10"
            max="2000"
            step="10"
            value={diskGb}
            onChange={(e) => setDiskGb(e.target.value)}
            className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs font-mono text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="ce-count">
            Count
          </label>
          <input
            id="ce-count"
            data-testid="ce-count"
            type="number"
            min="1"
            max="100"
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-full rounded border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-2 py-1 text-xs font-mono text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
          />
        </div>

        <div className="col-span-2">
          <button
            type="submit"
            data-testid="calculate-cost-btn"
            disabled={loading || !isValid}
            className="rounded px-3 py-1 text-xs font-medium bg-[var(--color-accent-blue)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? "Calculating..." : "Calculate"}
          </button>
        </div>
      </form>

      {error && (
        <p className="text-xs text-[var(--color-error)]" data-testid="cost-estimate-error">
          {error}
        </p>
      )}

      {result && (
        <div data-testid="cost-estimate-result" className="space-y-2">
          {result.unknown_machine_type && (
            <p className="text-xs text-amber-500">
              Unknown machine type — using n1-standard-4 rate as proxy.
            </p>
          )}
          <dl
            className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            <dt className="text-[var(--color-text-muted)]">Compute</dt>
            <dd data-testid="cost-compute" className="text-[var(--color-text-primary)]">
              ${result.compute_cost_usd.toFixed(4)} USD
            </dd>
            <dt className="text-[var(--color-text-muted)]">Disk</dt>
            <dd data-testid="cost-disk" className="text-[var(--color-text-primary)]">
              ${result.disk_cost_usd.toFixed(4)} USD
            </dd>
            <dt className="text-[var(--color-text-muted)] font-semibold">Total</dt>
            <dd
              data-testid="cost-total"
              className="text-[var(--color-accent-green)] font-semibold"
            >
              ${result.total_cost_usd.toFixed(4)} USD
            </dd>
            <dt className="text-[var(--color-text-muted)]">Hourly rate</dt>
            <dd className="text-[var(--color-text-muted)]">
              ${result.hourly_rate_usd.toFixed(4)}/hr
            </dd>
            <dt className="text-[var(--color-text-muted)]">Region</dt>
            <dd className="text-[var(--color-text-muted)]">{result.region}</dd>
          </dl>
          {result.dry_run && (
            <p className="text-xs text-amber-500 font-mono">dry_run=true</p>
          )}
        </div>
      )}
    </div>
  );
}
