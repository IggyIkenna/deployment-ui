import { useState } from "react";
import { TrendingUp, Loader2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import {
  launchStrategyBacktest,
  type LaunchResult,
  type StrategyBacktestParams,
} from "../api/deploymentApi";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useNotifications } from "../contexts/NotificationContext";

const ARCHETYPES = ["carry_staked_basis", "arbitrage_price_dispersion"] as const;
const GRID_DENSITIES = ["low", "medium", "high"] as const;

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
            Backtest VM launched
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

export function StrategyBacktests() {
  const [archetype, setArchetype] = useState<string>("carry_staked_basis");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [gridDensity, setGridDensity] = useState<string>("medium");
  const [force, setForce] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startDateTouched, setStartDateTouched] = useState(false);
  const [endDateTouched, setEndDateTouched] = useState(false);
  const { addToast } = useNotifications();

  const startDateError = !startDate ? "Start date is required." : null;
  const endDateError = !endDate
    ? "End date is required."
    : startDate && endDate < startDate
      ? "End date must be on or after start date."
      : null;
  const isFormValid = !startDateError && !endDateError;
  const showStartDateError = startDateTouched && !!startDateError;
  const showEndDateError = endDateTouched && !!endDateError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const params: StrategyBacktestParams = {
      archetype,
      start_date: startDate,
      end_date: endDate,
      grid_density: gridDensity,
      force,
      dry_run: dryRun,
    };

    try {
      const res = await launchStrategyBacktest(params);
      setResult(res);
      addToast(
        `Backtest VM launched${res.dry_run ? " (dry run)" : ""}`,
        "success",
        res.vm_name,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Launch failed";
      setError(msg);
      addToast("Strategy backtest launch failed", "error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
          <TrendingUp className="h-5 w-5 text-[var(--color-accent-cyan)]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Strategy Backtests
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            Launch strategy parameter grid-search VMs
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="start-date-field" className="text-xs font-medium text-[var(--color-text-secondary)]">
              Start Date
            </label>
            <input
              id="start-date-field"
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setStartDateTouched(true); }}
              onBlur={() => setStartDateTouched(true)}
              aria-invalid={showStartDateError || undefined}
              aria-describedby={showStartDateError ? "start-date-error" : undefined}
              className={`w-full rounded-md border ${showStartDateError ? "border-[var(--color-accent-red)]" : "border-[var(--color-border-default)]"} bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]`}
              data-testid="start-date-input"
            />
            {showStartDateError && (
              <p id="start-date-error" className="text-xs text-[var(--color-accent-red)] mt-0.5">
                {startDateError}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="end-date-field" className="text-xs font-medium text-[var(--color-text-secondary)]">
              End Date
            </label>
            <input
              id="end-date-field"
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setEndDateTouched(true); }}
              onBlur={() => setEndDateTouched(true)}
              aria-invalid={showEndDateError || undefined}
              aria-describedby={showEndDateError ? "end-date-error" : undefined}
              className={`w-full rounded-md border ${showEndDateError ? "border-[var(--color-accent-red)]" : "border-[var(--color-border-default)]"} bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]`}
              data-testid="end-date-input"
            />
            {showEndDateError && (
              <p id="end-date-error" className="text-xs text-[var(--color-accent-red)] mt-0.5">
                {endDateError}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--color-text-secondary)]">
            Grid Density
          </label>
          <select
            value={gridDensity}
            onChange={(e) => setGridDensity(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            data-testid="grid-density-select"
          >
            {GRID_DENSITIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-6">
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
            disabled={loading || !isFormValid}
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
                <TrendingUp className="h-4 w-4" />
                Launch Backtest
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
