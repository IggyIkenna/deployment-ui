import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { FlaskConical, Square, RotateCcw, AlertCircle } from "lucide-react";
import { useLifecyclePrefetch } from "../../contexts/LifecyclePrefetchContext";
import { useCloudProvider } from "../../contexts/CloudProviderContext";

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

interface ExperimentJobEntry {
  deployment_id: string;
  vm_name: string;
  experiment_kind: string;
  asset_group: string;
  task: string;
  status: string;
  started_at: string;
  last_heartbeat_at: string;
  completed_at: string | null;
  exit_code: number | null;
  rows_in: number;
  rows_out: number;
  rows_error: number;
  log_uri: string;
}

interface ExperimentMonitorResponse {
  jobs: ExperimentJobEntry[];
  total: number;
  queried_at: string;
  cloud: string;
  env: string;
}

function statusVariant(
  status: string,
): "running" | "success" | "error" | "pending" | "outline" {
  if (status === "running") return "running";
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "cancelled") return "pending";
  return "outline";
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    ml_training: "ML Training",
    strategy_backtest: "Strategy Backtest",
    execution_backtest: "Execution Backtest",
  };
  return map[kind] ?? kind;
}

export function ExperimentsSubTab() {
  const { experiments } = useLifecyclePrefetch();
  const { target } = useCloudProvider();
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loading = experiments.loading;
  const error = experiments.error;
  const response = experiments.data as ExperimentMonitorResponse | null;
  const jobs = response?.jobs ?? [];

  async function handleAction(vmName: string, action: "stop" | "restart") {
    setActionInFlight(`${vmName}:${action}`);
    setActionError(null);
    try {
      const resp = await fetch(
        `${DEPLOYMENT_API}/api/monitor/experiments/${encodeURIComponent(vmName)}/${action}?dry_run=false`,
        { method: "POST" },
      );
      if (!resp.ok) {
        const body = await resp.text();
        setActionError(`${action} failed (${resp.status}): ${body}`);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionInFlight(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Experiment Tracker
          </CardTitle>
          <CardDescription>Loading experiment jobs…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5" />
            Experiment Tracker
          </CardTitle>
          <CardDescription className="text-destructive flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            {error.message}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" />
          Experiment Tracker
          <Badge variant="outline" className="ml-auto text-xs">
            {target.toUpperCase()}
          </Badge>
        </CardTitle>
        <CardDescription>
          {jobs.length === 0
            ? "No experiment jobs in the last 3 days"
            : `${jobs.length} experiment job${jobs.length !== 1 ? "s" : ""}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {actionError && (
          <div className="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {actionError}
          </div>
        )}
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ML training, strategy backtest, or execution backtest VMs found.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const inFlight = actionInFlight?.startsWith(job.vm_name);
              return (
                <div
                  key={job.deployment_id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate font-mono text-xs">
                      {job.vm_name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{kindLabel(job.experiment_kind)}</span>
                      <span>·</span>
                      <span>{job.asset_group}</span>
                      <span>·</span>
                      <span>{job.started_at.slice(0, 10)}</span>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                    {job.status === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!inFlight}
                        onClick={() => handleAction(job.vm_name, "stop")}
                        title="Stop VM"
                      >
                        <Square className="w-3 h-3" />
                      </Button>
                    )}
                    {(job.status === "failed" || job.status === "completed") && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!inFlight}
                        onClick={() => handleAction(job.vm_name, "restart")}
                        title="Restart VM"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
