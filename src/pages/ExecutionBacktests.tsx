import { useState } from "react";
import { Cpu, Loader2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import {
  launchExecutionBacktest,
  type LaunchResult,
  type ExecutionBacktestParams,
} from "../api/deploymentApi";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

const ARCHETYPES = ["carry_staked_basis", "arbitrage_price_dispersion"] as const;

function ResultPanel({ result, onDismiss }: { result: LaunchResult; onDismiss: () => void }) {
  return (
    <div
      data-testid="launch-result"
      className="rounded-lg border border-[var(--color-accent-green)]/30 bg-[var(--color-accent-green)]/5 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-accent-green)]" />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Execution backtest launched
          </span>
          {result.dry_run && (
            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-300">
              DRY RUN
            </Badge>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Dismiss
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
        <dt className="text-[var(--color-text-muted)]">VM</dt>
        <dd className="text-[var(--color-text-primary)]">{result.vm_name}</dd>
        <dt className="text-[var(--color-text-muted)]">Zone</dt>
        <dd className="text-[var(--color-text-primary)]">{result.zone}</dd>
        <dt className="text-[var(--color-text-muted)]">Launched</dt>
        <dd className="text-[var(--color-text-primary)]">{result.launched_at}</dd>
        <dt className="text-[var(--color-text-muted)]">Correlation</dt>
        <dd className="text-[var(--color-text-primary)] truncate">{result.correlation_id}</dd>
      </dl>
      {result.events_uri && (
        <a
          href={result.events_uri}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-accent-cyan)] hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Events log
        </a>
      )}
    </div>
  );
}

export function ExecutionBacktests() {
  const [archetype, setArchetype] = useState<string>("carry_staked_basis");
  const [tickInterval, setTickInterval] = useState<string>("300");
  const [continuous, setContinuous] = useState(false);
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tickIntervalNum = parseInt(tickInterval, 10);
    if (isNaN(tickIntervalNum) || tickIntervalNum < 60 || tickIntervalNum > 86400) {
      setError("Tick interval must be between 60 and 86400 seconds.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    const params: ExecutionBacktestParams = {
      archetype,
      tick_interval: tickIntervalNum,
      continuous,
      force,
      dry_run: dryRun,
    };

    try {
      const res = await launchExecutionBacktest(params);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
          <Cpu className="h-5 w-5 text-[var(--color-accent-cyan)]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Execution Backtests
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            Measure execution alpha on historical fills
          </p>
        </div>
      </div>

      {result && <ResultPanel result={result} onDismiss={() => setResult(null)} />}

      {error && (
        <div
          data-testid="launch-error"
          className="flex items-start gap-3 rounded-lg border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/5 p-4"
        >
          <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)] shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">Archetype</label>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            data-testid="archetype-select"
          >
            {ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Tick Interval (seconds){" "}
            <span className="text-[var(--color-text-muted)]">60–86400</span>
          </label>
          <input
            type="number"
            value={tickInterval}
            onChange={(e) => setTickInterval(e.target.value)}
            step={60}
            className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            data-testid="tick-interval-input"
          />
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(e) => setContinuous(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-default)]"
              data-testid="continuous-checkbox"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">Continuous mode</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-default)]"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">Force re-run</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border-default)]"
              data-testid="dry-run-checkbox"
            />
            <span className="text-sm text-[var(--color-text-secondary)]">Dry run</span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={loading}
            className="gap-2"
            data-testid="launch-button"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Launching…
              </>
            ) : (
              <>
                <Cpu className="h-4 w-4" />
                Launch Backtest
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
