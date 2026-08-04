import { AlertTriangle, CheckCircle2, Loader2, Route, XCircle } from "lucide-react";
import { useCallback, useState } from "react";
import type { PipelineTraceHop, PipelineTraceResponse } from "../api/client";
import { fetchPipelineTrace } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const ASSET_GROUP_OPTIONS = ["cefi", "tradfi", "defi", "sports", "prediction"];

const SELECT_CLASSNAME =
  "select-compact flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_BADGE_VARIANT: Record<PipelineTraceHop["status"], "success" | "warning" | "error" | "outline"> = {
  captured: "success",
  empty_confirmed: "outline",
  attempted_failed: "error",
  never_attempted: "warning",
};

function HopStatusIcon({ status }: { status: PipelineTraceHop["status"] }) {
  if (status === "captured") return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent-green)]" />;
  if (status === "attempted_failed") return <XCircle className="h-3.5 w-3.5 text-[var(--color-accent-red)]" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-accent-amber)]" />;
}

/**
 * "Pipeline Trace" — GAP G-TRACE, consuming `GET /data-status/pipeline-trace`
 * (deployment-api `routes/data_status/_pipeline_trace.py`).
 *
 * Threads one (instrument, date) through every pipeline stage
 * (IS -> MTDS -> MDPS -> features-* -> strategy -> execution) and shows each
 * hop's manifest `capture_status`, so an operator can answer "where did this
 * instrument/date get stuck" in one view instead of checking each service's
 * own data-status panel separately. The first non-`captured` hop (in pipeline
 * order) is highlighted as the stuck point.
 */
export function PipelineTraceCard() {
  const [instrument, setInstrument] = useState("");
  const [date, setDate] = useState("");
  const [assetGroup, setAssetGroup] = useState("cefi");
  const [data, setData] = useState<PipelineTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = instrument.trim().length > 0 && date.trim().length > 0;

  const runTrace = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPipelineTrace({
        instrument: instrument.trim(),
        date: date.trim(),
        asset_group: assetGroup,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pipeline trace");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [instrument, date, assetGroup, canSubmit]);

  return (
    <Card data-testid="pipeline-trace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          <div>
            <CardTitle className="text-base">Pipeline Trace</CardTitle>
            <CardDescription className="text-xs">
              Thread one instrument/date through every pipeline stage (IS→MTDS→MDPS→features→strategy→execution) and see
              per-hop capture status in one call.
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1 min-w-[12rem]">
            <Label htmlFor="pt-instrument" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Instrument
            </Label>
            <Input
              id="pt-instrument"
              className="h-8 text-xs"
              placeholder="e.g. BINANCE-FUTURES:PERPETUAL:BTC-USDT@LIN"
              value={instrument}
              onChange={(ev) => setInstrument(ev.target.value)}
              data-testid="pipeline-trace-instrument-input"
            />
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="pt-date" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Date
            </Label>
            <Input
              id="pt-date"
              type="date"
              className="h-8 text-xs"
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
              data-testid="pipeline-trace-date-input"
            />
          </div>
          <div className="space-y-1 min-w-[8rem]">
            <Label htmlFor="pt-asset-group" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Asset group
            </Label>
            <select
              id="pt-asset-group"
              className={SELECT_CLASSNAME}
              value={assetGroup}
              onChange={(ev) => setAssetGroup(ev.target.value)}
              data-testid="pipeline-trace-asset-group-select"
            >
              {ASSET_GROUP_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void runTrace()}
            disabled={!canSubmit || loading}
            data-testid="pipeline-trace-run"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Trace
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="pipeline-trace-error">
            {error}
          </div>
        )}
        {!data && !loading && !error && (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="pipeline-trace-empty">
            Enter an instrument, date, and asset group, then click Trace.
          </p>
        )}
        {data && (
          <div data-testid="pipeline-trace-result">
            <div className="flex items-center gap-2 pb-3 text-xs">
              {data.stuck_at ? (
                <Badge variant="warning" data-testid="pipeline-trace-stuck-at">
                  Stuck at: {data.stuck_at}
                </Badge>
              ) : (
                <Badge variant="success" data-testid="pipeline-trace-stuck-at-none">
                  All hops captured
                </Badge>
              )}
            </div>
            <ol className="space-y-1.5" data-testid="pipeline-trace-hops">
              {data.hops.map((hop, idx) => (
                <li
                  key={`${hop.stage}-${hop.service}`}
                  className="flex items-center gap-2 rounded-md border border-[var(--color-border-subtle)] px-2 py-1.5"
                  data-testid={`pipeline-trace-hop-${hop.service}`}
                >
                  <span className="text-[10px] text-[var(--color-text-muted)] w-5 text-right">{idx + 1}</span>
                  <HopStatusIcon status={hop.status} />
                  <span className="text-xs font-mono flex-1">{hop.service}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[hop.status]} className="text-[9px]">
                    {hop.status}
                  </Badge>
                  {hop.error_reason && (
                    <span className="text-[10px] text-[var(--color-accent-red)]">{hop.error_reason}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
