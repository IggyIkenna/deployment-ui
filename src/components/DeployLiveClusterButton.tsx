/**
 * DeployLiveClusterButton — Phase 11.4 UI for the "Deploy live cluster" action.
 *
 * Plan: live_pipeline_mtds_mdps_features_2026_05_08.md Phase 11.4.
 *
 * Operator picks (a) live-cluster role from the closed set + (b) asset_group
 * (where applicable) + (c) env tier (prod/staging/dev) + (d) replay window
 * fields (when role=replay-cascade). The component POSTs to
 * `/api/data-status/deploy-live-cluster-preview` and renders the resulting
 * bash launcher command for copy-to-clipboard.
 *
 * Backed by deployment-api `_LIVE_CLUSTER_LAUNCHER_SCRIPTS` registry per
 * `unified-trading-pm/codex/05-infrastructure/runtime-tiers-and-deployment.md`
 * § "Live-pipeline VM topology (2026-05-08 cutover)".
 *
 * Operational launch boundary: Phase 15 of the live-pipeline plan is the
 * named runner for ACTUAL live VM bootstrap. This button surfaces the
 * launcher COMMAND for operator paste-and-run (preview mode); auto-launch
 * is a separate plan pending security review of the deployment-api → gcloud
 * permission boundary.
 */

import type { ReactElement } from "react";
import { useState } from "react";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const LIVE_CLUSTER_ROLES = [
  "mtds-live",
  "mdps-features-live",
  "features-cross-cutting",
  "replay-cascade",
] as const;

const PER_ASSET_GROUP_ROLES = new Set<string>([
  "mtds-live",
  "mdps-features-live",
  "replay-cascade",
]);

const WINDOW_PARAMETERISED_ROLES = new Set<string>(["replay-cascade"]);

const ASSET_GROUPS = [
  "cefi",
  "defi",
  "tradfi",
  "sports",
  "prediction",
] as const;
const DEPLOYMENT_ENVS = ["prod", "staging", "dev"] as const;

type LiveClusterRole = (typeof LIVE_CLUSTER_ROLES)[number];
type AssetGroup = (typeof ASSET_GROUPS)[number];
type DeploymentEnv = (typeof DEPLOYMENT_ENVS)[number];

interface LiveClusterPreviewResponse {
  role: string;
  asset_group: string | null;
  deployment_env: string;
  launcher_script: string;
  command: string;
  notes: string[];
  warnings: string[];
}

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; preview: LiveClusterPreviewResponse }
  | { kind: "error"; message: string };

export async function fetchLiveClusterPreview(
  body: Record<string, string | null>,
): Promise<LiveClusterPreviewResponse> {
  const response = await fetch("/api/data-status/deploy-live-cluster-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to build live-cluster preview: ${response.status} ${response.statusText} — ${detail}`,
    );
  }
  return (await response.json()) as LiveClusterPreviewResponse;
}

export function DeployLiveClusterButton(): ReactElement {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<LiveClusterRole>("mtds-live");
  const [assetGroup, setAssetGroup] = useState<AssetGroup>("cefi");
  const [deploymentEnv, setDeploymentEnv] = useState<DeploymentEnv>("prod");
  const [replayStart, setReplayStart] = useState("");
  const [replayEnd, setReplayEnd] = useState("");
  const [replayShardKey, setReplayShardKey] = useState("");
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const isPerAssetGroup = PER_ASSET_GROUP_ROLES.has(role);
  const isWindowParameterised = WINDOW_PARAMETERISED_ROLES.has(role);

  const handleSubmit = async () => {
    setState({ kind: "loading" });
    try {
      const body: Record<string, string | null> = {
        role,
        asset_group: isPerAssetGroup ? assetGroup : null,
        deployment_env: deploymentEnv,
      };
      if (isWindowParameterised) {
        body.replay_start = replayStart;
        body.replay_end = replayEnd;
        body.replay_shard_key = replayShardKey;
      }
      const preview = await fetchLiveClusterPreview(body);
      setState({ kind: "ready", preview });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleCopy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Clipboard API may be unavailable in non-secure contexts; operator
      // can select + copy manually from the <pre> block.
    }
  };

  const reset = () => {
    setState({ kind: "idle" });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="deploy-live-cluster-button"
      >
        Deploy live cluster
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle>Deploy live-cluster VM</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Builds the launcher command for ONE live-pipeline VM type. Operator
            pastes the command into a terminal with gcloud access. Operational
            launch boundary: Phase 15 of the live-pipeline plan.
          </p>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div data-testid="deploy-live-cluster-form">
              <label className="block text-sm font-medium">Role</label>
              <select
                data-testid="deploy-live-cluster-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as LiveClusterRole);
                  reset();
                }}
                className="mt-1 w-full rounded border p-2 text-sm"
              >
                {LIVE_CLUSTER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {isPerAssetGroup ? (
              <div>
                <label className="block text-sm font-medium">Asset group</label>
                <select
                  data-testid="deploy-live-cluster-asset-group"
                  value={assetGroup}
                  onChange={(e) => {
                    setAssetGroup(e.target.value as AssetGroup);
                    reset();
                  }}
                  className="mt-1 w-full rounded border p-2 text-sm"
                >
                  {ASSET_GROUPS.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium">Env</label>
              <select
                data-testid="deploy-live-cluster-env"
                value={deploymentEnv}
                onChange={(e) => {
                  setDeploymentEnv(e.target.value as DeploymentEnv);
                  reset();
                }}
                className="mt-1 w-full rounded border p-2 text-sm"
              >
                {DEPLOYMENT_ENVS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </select>
            </div>

            {isWindowParameterised ? (
              <>
                <div>
                  <label className="block text-sm font-medium">
                    Replay start (ISO-8601 UTC)
                  </label>
                  <input
                    data-testid="deploy-live-cluster-replay-start"
                    type="text"
                    placeholder="2026-05-11T12:00:00Z"
                    value={replayStart}
                    onChange={(e) => {
                      setReplayStart(e.target.value);
                      reset();
                    }}
                    className="mt-1 w-full rounded border p-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Replay end (ISO-8601 UTC)
                  </label>
                  <input
                    data-testid="deploy-live-cluster-replay-end"
                    type="text"
                    placeholder="2026-05-11T13:30:00Z"
                    value={replayEnd}
                    onChange={(e) => {
                      setReplayEnd(e.target.value);
                      reset();
                    }}
                    className="mt-1 w-full rounded border p-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Shard key</label>
                  <input
                    data-testid="deploy-live-cluster-replay-shard-key"
                    type="text"
                    placeholder="BTC-USDT"
                    value={replayShardKey}
                    onChange={(e) => {
                      setReplayShardKey(e.target.value);
                      reset();
                    }}
                    className="mt-1 w-full rounded border p-2 text-sm font-mono"
                  />
                </div>
              </>
            ) : null}

            <Button
              data-testid="deploy-live-cluster-submit"
              onClick={() => void handleSubmit()}
              disabled={state.kind === "loading"}
            >
              {state.kind === "loading"
                ? "Building…"
                : "Build launcher command"}
            </Button>

            {state.kind === "ready" ? (
              <div
                data-testid="deploy-live-cluster-preview"
                className="space-y-2 rounded border p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Launcher command</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopy(state.preview.command)}
                    data-testid="deploy-live-cluster-copy"
                  >
                    Copy
                  </Button>
                </div>
                <pre
                  className="overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs"
                  data-testid="deploy-live-cluster-command"
                >
                  {state.preview.command}
                </pre>
                {state.preview.warnings.length > 0 ? (
                  <div
                    data-testid="deploy-live-cluster-warnings"
                    className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-xs"
                  >
                    <p className="font-medium">Warnings</p>
                    <ul className="ml-4 list-disc">
                      {state.preview.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Notes</summary>
                  <ul className="ml-4 mt-1 list-disc">
                    {state.preview.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </details>
              </div>
            ) : null}

            {state.kind === "error" ? (
              <div
                data-testid="deploy-live-cluster-error"
                className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs"
              >
                {state.message}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
