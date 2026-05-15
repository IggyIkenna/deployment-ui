import { useState, useEffect, useCallback } from "react";
import { DollarSign, RefreshCw, AlertCircle, Calendar } from "lucide-react";
import {
  fetchDailyCosts,
  type DailyCostResponse,
  type AssetGroupCostRow,
  type ArchetypeCostRow,
  type VmCostRow,
} from "../api/deploymentApi";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmt(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function AssetGroupTable({ rows }: { rows: AssetGroupCostRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-[var(--color-text-muted)] py-2">No data.</p>;
  return (
    <table
      className="w-full text-sm"
      aria-label="Cost by asset group"
    >
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className="text-left py-1 text-[var(--color-text-muted)] font-medium">Asset group</th>
          <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">VMs</th>
          <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Total USD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.asset_group} className="border-b border-[var(--color-border)]/40">
            <td className="py-1 font-mono text-[var(--color-text-primary)]">{r.asset_group}</td>
            <td className="py-1 text-right text-[var(--color-text-secondary)]">{r.vm_count}</td>
            <td className="py-1 text-right font-mono text-[var(--color-text-primary)]">
              {fmt(r.total_usd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ArchetypeTable({ rows }: { rows: ArchetypeCostRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-[var(--color-text-muted)] py-2">No data.</p>;
  return (
    <table
      className="w-full text-sm"
      aria-label="Cost by archetype"
    >
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className="text-left py-1 text-[var(--color-text-muted)] font-medium">Archetype</th>
          <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">VMs</th>
          <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Total USD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.archetype} className="border-b border-[var(--color-border)]/40">
            <td className="py-1 font-mono text-[var(--color-text-primary)] truncate max-w-[200px]">
              {r.archetype}
            </td>
            <td className="py-1 text-right text-[var(--color-text-secondary)]">{r.vm_count}</td>
            <td className="py-1 text-right font-mono text-[var(--color-text-primary)]">
              {fmt(r.total_usd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VmTable({ rows }: { rows: VmCostRow[] }) {
  if (rows.length === 0)
    return <p className="text-sm text-[var(--color-text-muted)] py-2">No VM data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Cost by VM">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="text-left py-1 text-[var(--color-text-muted)] font-medium">VM</th>
            <th className="text-left py-1 text-[var(--color-text-muted)] font-medium">Asset group</th>
            <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Hours</th>
            <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Compute</th>
            <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Disk</th>
            <th className="text-right py-1 text-[var(--color-text-muted)] font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.vm_name} className="border-b border-[var(--color-border)]/40">
              <td className="py-1 font-mono text-[var(--color-text-primary)] truncate max-w-[180px]">
                {r.vm_name}
              </td>
              <td className="py-1 text-[var(--color-text-secondary)]">{r.asset_group}</td>
              <td className="py-1 text-right text-[var(--color-text-secondary)]">
                {r.runtime_hours.toFixed(1)}h
              </td>
              <td className="py-1 text-right font-mono text-[var(--color-text-secondary)]">
                {fmt(r.compute_usd)}
              </td>
              <td className="py-1 text-right font-mono text-[var(--color-text-secondary)]">
                {fmt(r.disk_usd)}
              </td>
              <td className="py-1 text-right font-mono text-[var(--color-text-primary)] font-medium">
                {fmt(r.total_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DailyCosts() {
  const [date, setDate] = useState<string>(todayString());
  const [data, setData] = useState<DailyCostResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (d: string) => {
      setLoading(true);
      setError(null);
      fetchDailyCosts(d)
        .then((res) => {
          setData(res);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to load cost data");
        })
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(date);
  }, [date, load]);

  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1280px] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-[var(--color-accent-green)]" />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Daily VM Costs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--color-text-muted)]" />
          <input
            type="date"
            aria-label="Select date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] px-2 py-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(date)}
            disabled={loading}
            aria-label="Refresh cost data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Total */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Total for {data.date}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              data-testid="total-usd"
              className="text-3xl font-mono font-bold text-[var(--color-text-primary)]"
            >
              {fmt(data.total_usd)}
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {data.by_vm.length} VM{data.by_vm.length !== 1 ? "s" : ""} ·{" "}
              {data.by_asset_group.length} asset group{data.by_asset_group.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tables */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By Asset Group</CardTitle>
            </CardHeader>
            <CardContent>
              <AssetGroupTable rows={data.by_asset_group} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By Archetype</CardTitle>
            </CardHeader>
            <CardContent>
              <ArchetypeTable rows={data.by_archetype} />
            </CardContent>
          </Card>
        </div>
      )}

      {data && data.by_vm.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By VM (descending cost)</CardTitle>
          </CardHeader>
          <CardContent>
            <VmTable rows={data.by_vm} />
          </CardContent>
        </Card>
      )}

      {data && data.by_vm.length === 0 && !error && (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-6">
          No cost data for {data.date}.
        </p>
      )}
    </main>
  );
}
