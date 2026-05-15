import { useState } from "react";
import { FlaskConical, Loader2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import {
  launchMlExperiment,
  type LaunchResult,
  type MlExperimentParams,
} from "../api/deploymentApi";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useNotifications } from "../contexts/NotificationContext";
import { VmCostEstimatePanel } from "../components/VmCostEstimatePanel";

const ASSET_GROUPS = ["cefi", "defi", "tradfi", "sports", "prediction"] as const;
const OPERATIONS = ["train", "evaluate", "grid-search", "pipeline"] as const;
const MACHINES = ["cpu", "gpu", "high"] as const;

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
            VM launched
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

export function MlExperiments() {
  const [assetGroup, setAssetGroup] = useState<string>("defi");
  const [instruments, setInstruments] = useState("");
  const [targetTypes, setTargetTypes] = useState("swing_high,swing_low");
  const [timeframes, setTimeframes] = useState("1m");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [operation, setOperation] = useState<string>("train");
  const [machine, setMachine] = useState<string>("cpu");
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instrumentsTouched, setInstrumentsTouched] = useState(false);
  const { addToast } = useNotifications();

  const instrumentsList = instruments
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const instrumentsError =
    instrumentsList.length === 0 ? "At least one instrument is required." : null;
  const isFormValid = !instrumentsError;
  const showInstrumentsError = instrumentsTouched && !!instrumentsError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const params: MlExperimentParams = {
      asset_group: assetGroup,
      instruments: instrumentsList,
      target_types: targetTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      timeframes: timeframes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      operation,
      machine,
      dry_run: dryRun,
    };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;

    try {
      const res = await launchMlExperiment(params);
      setResult(res);
      addToast(
        `VM launched${res.dry_run ? " (dry run)" : ""}`,
        "success",
        res.vm_name,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Launch failed";
      setError(msg);
      addToast("ML experiment launch failed", "error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
          <FlaskConical className="h-5 w-5 text-[var(--color-accent-cyan)]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">ML Experiments</h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            Launch ML training / evaluation VMs
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Asset Group
            </label>
            <select
              value={assetGroup}
              onChange={(e) => setAssetGroup(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
              data-testid="asset-group-select"
            >
              {ASSET_GROUPS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Operation
            </label>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            >
              {OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="instruments-field" className="text-xs font-medium text-[var(--color-text-secondary)]">
            Instruments <span className="text-[var(--color-text-muted)]">(comma-separated)</span>
          </label>
          <input
            id="instruments-field"
            type="text"
            value={instruments}
            onChange={(e) => { setInstruments(e.target.value); setInstrumentsTouched(true); }}
            onBlur={() => setInstrumentsTouched(true)}
            placeholder="ETH-USDT, BTC-USDT"
            aria-invalid={showInstrumentsError || undefined}
            aria-describedby={showInstrumentsError ? "instruments-error" : undefined}
            className={`w-full rounded-md border ${showInstrumentsError ? "border-[var(--color-accent-red)]" : "border-[var(--color-border-default)]"} bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]`}
            data-testid="instruments-input"
          />
          {showInstrumentsError && (
            <p id="instruments-error" className="text-xs text-[var(--color-accent-red)] mt-0.5">
              {instrumentsError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Target Types <span className="text-[var(--color-text-muted)]">(comma-sep)</span>
            </label>
            <input
              type="text"
              value={targetTypes}
              onChange={(e) => setTargetTypes(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Timeframes <span className="text-[var(--color-text-muted)]">(comma-sep)</span>
            </label>
            <input
              type="text"
              value={timeframes}
              onChange={(e) => setTimeframes(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Start Date <span className="text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              End Date <span className="text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-secondary)]">
              Machine Type
            </label>
            <select
              value={machine}
              onChange={(e) => setMachine(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
            >
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-1">
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
        </div>

        <VmCostEstimatePanel />

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
                <FlaskConical className="h-4 w-4" />
                Launch Experiment
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
