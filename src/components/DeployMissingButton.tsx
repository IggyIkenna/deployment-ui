/**
 * Deploy-Missing copy-to-clipboard + auto-launch widget — drilldown plan Phase 3 + Phase 2 auto-launch.
 *
 * Renders next to a leaf in the HierarchicalShardDrilldown tree. On
 * click, posts the leaf's ``row_key`` to ``/data-status/deploy-missing-
 * preview`` and shows the surgical bash invocation the operator should
 * run. Operator copies + executes from their authenticated terminal.
 *
 * Phase 2 auto-launch (deploy_missing_auto_launch_2026_05_07):
 * Operators who opt in via the "Auto-launch" toggle can click "Launch VM"
 * to directly invoke POST /api/data-status/deploy-missing-launch. An
 * inline confirmation gate prevents accidental launches. The preference
 * persists in localStorage (key: _AUTO_LAUNCH_PREF_KEY), defaulting to
 * false for new operators.
 *
 * Live event streaming (Phase 3 scope, DEFERRED):
 * The events_uri in the launch result points to the GCS event stream.
 * A proper SSE tail panel is post-Phase-2; the current UI just exposes
 * the link so operators can monitor via gcloud/gsutil directly.
 */

import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../auth/GoogleAuth";

import {
  type DeployMissingLaunchResult,
  type DeployMissingMode,
  type DeployMissingPreviewResponse,
  postDeployMissingLaunch,
  postDeployMissingPreview,
} from "../api/client";

const _TARBALL_BLOCKED_ENVS = new Set(["staging", "production", "prod"]);
const _AUTO_LAUNCH_PREF_KEY = "deployment-ui/deploy-missing-auto-launch-enabled";

function _readAutoLaunchPref(): boolean {
  try {
    return localStorage.getItem(_AUTO_LAUNCH_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

function _writeAutoLaunchPref(enabled: boolean): void {
  try {
    localStorage.setItem(_AUTO_LAUNCH_PREF_KEY, String(enabled));
  } catch {
    // ignore write failures (private browsing, storage quota)
  }
}

interface DeployMissingButtonProps {
  service: string;
  assetGroup: string;
  rowKey: Record<string, string>;
  /** Optional label override; default "Deploy Missing". */
  label?: string;
}

export function DeployMissingButton({
  service,
  assetGroup,
  rowKey,
  label = "Deploy Missing",
}: DeployMissingButtonProps) {
  const [preview, setPreview] = useState<DeployMissingPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<DeployMissingMode>("preview");
  const [deploymentEnv, setDeploymentEnv] = useState<string>("development");

  // Auto-launch preference (item 6): persisted in localStorage, default false.
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState<boolean>(_readAutoLaunchPref);

  // Auto-launch state (item 5).
  const [confirmPending, setConfirmPending] = useState(false);
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchResult, setLaunchResult] = useState<DeployMissingLaunchResult | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config/region", { headers: authHeaders() })
      .then((r) => r.json() as Promise<{ deployment_env?: string }>)
      .then((data) => {
        if (data.deployment_env) {
          setDeploymentEnv(data.deployment_env);
        }
      })
      .catch(() => {});
  }, []);

  const tarballBlocked = _TARBALL_BLOCKED_ENVS.has(deploymentEnv);

  const fetchPreview = useCallback(
    (nextMode: DeployMissingMode) => {
      setLoading(true);
      setError(null);
      postDeployMissingPreview({
        service,
        asset_group: assetGroup,
        row_key: rowKey,
        mode: nextMode,
      })
        .then((res) => {
          setPreview(res);
        })
        .catch((e: unknown) => {
          setError(String(e));
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [service, assetGroup, rowKey],
  );

  const handleClick = useCallback(() => {
    fetchPreview(mode);
  }, [fetchPreview, mode]);

  const handleSwitchMode = useCallback(
    (nextMode: DeployMissingMode) => {
      setMode(nextMode);
      if (preview) {
        fetchPreview(nextMode);
      }
    },
    [fetchPreview, preview],
  );

  const handleCopy = useCallback(() => {
    if (!preview) {
      return;
    }
    navigator.clipboard
      .writeText(preview.command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch((e: unknown) => {
        setError(`Copy failed: ${String(e)}`);
      });
  }, [preview]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setError(null);
    setConfirmPending(false);
    setLaunchResult(null);
    setLaunchError(null);
  }, []);

  const handleToggleAutoLaunch = useCallback(() => {
    setAutoLaunchEnabled((prev) => {
      const next = !prev;
      _writeAutoLaunchPref(next);
      return next;
    });
  }, []);

  const handleLaunchClick = useCallback(() => {
    setConfirmPending(true);
    setLaunchError(null);
  }, []);

  const handleLaunchCancel = useCallback(() => {
    setConfirmPending(false);
    setLaunchError(null);
  }, []);

  const handleLaunchConfirm = useCallback(() => {
    setConfirmPending(false);
    setLaunchLoading(true);
    setLaunchError(null);
    setLaunchResult(null);
    postDeployMissingLaunch({
      service,
      asset_group: assetGroup,
      row_key: rowKey,
    })
      .then((res) => {
        setLaunchResult(res);
      })
      .catch((e: unknown) => {
        setLaunchError(String(e));
      })
      .finally(() => {
        setLaunchLoading(false);
      });
  }, [service, assetGroup, rowKey]);

  return (
    <span className="deploy-missing-button-wrap">
      <button
        type="button"
        className="deploy-missing-trigger"
        onClick={handleClick}
        disabled={loading}
        title="Generate the surgical --shard-key recovery command for this leaf"
      >
        {loading ? "Building..." : label}
      </button>

      {error && (
        <span className="deploy-missing-error" role="alert">
          {error}
        </span>
      )}

      {preview && (
        <div className="deploy-missing-preview" role="dialog" aria-label="Deploy-Missing preview">
          <div className="deploy-missing-header">
            <span className="title">Surgical recovery command</span>
            <button type="button" onClick={handleClose} aria-label="Close" className="close">
              ×
            </button>
          </div>

          <div
            className="deploy-missing-mode-toggle"
            role="radiogroup"
            aria-label="Deploy mode"
            style={{
              display: "flex",
              gap: "8px",
              fontSize: "11px",
              marginBottom: "6px",
            }}
          >
            <label style={{ cursor: "pointer" }}>
              <input
                type="radio"
                name={`deploy-missing-mode-${preview.shard_key}`}
                checked={mode === "preview"}
                onChange={() => handleSwitchMode("preview")}
              />{" "}
              preview (current GCS tarball)
            </label>
            <label
              style={{
                cursor: tarballBlocked ? "not-allowed" : "pointer",
                opacity: tarballBlocked ? 0.45 : 1,
              }}
              title={tarballBlocked ? `Tarball deploy blocked in ${deploymentEnv} — use image deploy` : undefined}
            >
              <input
                type="radio"
                name={`deploy-missing-mode-${preview.shard_key}`}
                checked={mode === "tarball-from-local"}
                onChange={() => handleSwitchMode("tarball-from-local")}
                disabled={tarballBlocked}
                aria-label={`tarball-from-local (bundle my local code first)${tarballBlocked ? " — blocked" : ""}`}
              />{" "}
              tarball-from-local (bundle my local code first)
              {tarballBlocked && (
                <span
                  style={{
                    marginLeft: "6px",
                    fontSize: "10px",
                    color: "#ffcc66",
                    fontWeight: "bold",
                  }}
                >
                  blocked in {deploymentEnv}
                </span>
              )}
            </label>
          </div>

          {preview.warnings.length > 0 && (
            <div
              className="deploy-missing-warnings"
              role="alert"
              style={{
                background: "#3a1f00",
                border: "1px solid #8a5a00",
                color: "#ffcc66",
                padding: "6px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                marginBottom: "6px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>⚠ Mode warning</strong>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {preview.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <pre className="deploy-missing-command">{preview.command}</pre>
          <div className="deploy-missing-actions">
            <button type="button" onClick={handleCopy} className="copy">
              {copied ? "Copied" : "Copy"}
            </button>

            {/* Auto-launch section (Phase 2). Toggle defaults to false for new operators. */}
            <label
              style={{
                fontSize: "11px",
                cursor: "pointer",
                marginLeft: "12px",
              }}
              title="Enable to launch a GCE VM directly from the UI instead of copying the command"
            >
              <input
                type="checkbox"
                checked={autoLaunchEnabled}
                onChange={handleToggleAutoLaunch}
                style={{ marginRight: "4px" }}
                aria-label="Enable auto-launch"
              />
              Auto-launch
            </label>

            {autoLaunchEnabled && !launchLoading && !launchResult && (
              <button
                type="button"
                className="deploy-missing-launch-btn"
                onClick={handleLaunchClick}
                disabled={confirmPending}
                style={{
                  marginLeft: "8px",
                  background: "#1a3a1a",
                  border: "1px solid #2a6a2a",
                  color: "#66cc66",
                  cursor: "pointer",
                  borderRadius: "3px",
                  padding: "2px 8px",
                  fontSize: "11px",
                }}
                aria-label="Launch VM for this shard"
              >
                Launch VM
              </button>
            )}

            {autoLaunchEnabled && launchLoading && (
              <span style={{ marginLeft: "8px", fontSize: "11px", color: "#aaa" }} aria-live="polite">
                Launching… (up to 90s)
              </span>
            )}
          </div>

          {/* Confirmation gate — shown only after clicking "Launch VM". */}
          {confirmPending && (
            <div
              className="deploy-missing-confirm"
              role="alertdialog"
              aria-label="Confirm VM launch"
              style={{
                background: "#1a1a2a",
                border: "1px solid #4444aa",
                padding: "8px",
                borderRadius: "4px",
                fontSize: "11px",
                marginTop: "6px",
              }}
            >
              <strong style={{ display: "block", marginBottom: "4px" }}>⚠ Launch GCE VM for shard:</strong>
              <code style={{ fontSize: "10px", wordBreak: "break-all" }}>{preview.shard_key}</code>
              <div style={{ marginTop: "6px", display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleLaunchConfirm}
                  style={{
                    background: "#1a3a1a",
                    border: "1px solid #2a6a2a",
                    color: "#66cc66",
                    cursor: "pointer",
                    borderRadius: "3px",
                    padding: "2px 10px",
                    fontSize: "11px",
                  }}
                  aria-label="Confirm VM launch"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={handleLaunchCancel}
                  style={{
                    background: "#2a1a1a",
                    border: "1px solid #6a2a2a",
                    color: "#cc6666",
                    cursor: "pointer",
                    borderRadius: "3px",
                    padding: "2px 10px",
                    fontSize: "11px",
                  }}
                  aria-label="Cancel VM launch"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Launch result panel — shown after a successful auto-launch. */}
          {launchResult && (
            <div
              className="deploy-missing-launch-result"
              role="status"
              aria-live="polite"
              style={{
                background: "#1a2a1a",
                border: "1px solid #2a5a2a",
                padding: "8px",
                borderRadius: "4px",
                fontSize: "11px",
                marginTop: "6px",
              }}
            >
              <strong
                style={{
                  display: "block",
                  marginBottom: "4px",
                  color: "#66cc66",
                }}
              >
                {launchResult.inflight_vm_name
                  ? "↻ Existing in-flight VM returned"
                  : launchResult.started_confirmed
                    ? "✓ VM launched + STARTED"
                    : "✓ VM launched (STARTED poll timed out)"}
              </strong>
              <div style={{ color: "#ccc" }}>
                <div>
                  <span style={{ color: "#888" }}>VM: </span>
                  <code style={{ fontSize: "10px" }}>{launchResult.vm_name}</code>
                </div>
                <div style={{ marginTop: "2px" }}>
                  <span style={{ color: "#888" }}>Events: </span>
                  <code style={{ fontSize: "10px", wordBreak: "break-all" }}>{launchResult.events_uri}</code>
                </div>
                {launchResult.dry_run && <div style={{ marginTop: "2px", color: "#ffcc66" }}>dry_run=true</div>}
              </div>
            </div>
          )}

          {/* Launch error panel. */}
          {launchError && (
            <div
              className="deploy-missing-launch-error"
              role="alert"
              style={{
                background: "#2a1a1a",
                border: "1px solid #6a2a2a",
                color: "#ff8888",
                padding: "6px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                marginTop: "6px",
              }}
            >
              <strong>Launch failed: </strong>
              {launchError}
            </div>
          )}

          <div className="deploy-missing-meta">
            <code className="shard-key">{preview.shard_key}</code>
            <span
              className="deploy-missing-mode-badge"
              style={{
                marginLeft: "8px",
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "3px",
                background: mode === "tarball-from-local" ? "#8a5a00" : "#1f3a5a",
                color: "#fff",
              }}
            >
              {preview.mode}
            </span>
          </div>
          {preview.notes.length > 0 && (
            <ul className="deploy-missing-notes">
              {preview.notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}

export default DeployMissingButton;
