/**
 * Deploy-Missing copy-to-clipboard widget — drilldown plan Phase 3.
 *
 * Renders next to a leaf in the HierarchicalShardDrilldown tree. On
 * click, posts the leaf's ``row_key`` to ``/data-status/deploy-missing-
 * preview`` and shows the surgical bash invocation the operator should
 * run. Operator copies + executes from their authenticated terminal --
 * same security boundary as today's manual backfills (auto-launch is
 * a follow-up plan pending the API->gcloud perm-boundary review).
 *
 * Why the button exists: the drilldown tree shows ``empty_confirmed`` /
 * ``attempted_failed`` leaves with their structured ``row_key``. The
 * operator needs to re-run JUST that one shard rather than the whole
 * asset_group, and the deploy-missing-preview endpoint composes the
 * exact ``--shard-key=...`` invocation the MTDS handlers' decomposer
 * (Phase 4) honors.
 */

import { useCallback, useEffect, useState } from "react";

import {
  type DeployMissingMode,
  type DeployMissingPreviewResponse,
  postDeployMissingPreview,
} from "../api/client";

const _TARBALL_BLOCKED_ENVS = new Set(["staging", "production", "prod"]);

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

  useEffect(() => {
    fetch("/api/config/region")
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
      // Re-fetch immediately if a preview is already open so the
      // displayed command + warnings stay in sync with the toggle.
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
  }, []);

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

          {/* Mode toggle: preview (against current GCS tarball) vs
              tarball-from-local (bundle local working tree first). The
              tarball-from-local mode renders prominent warnings below
              because it ONLY works from the operator's workstation. */}
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
              title={
                tarballBlocked
                  ? `Tarball deploy blocked in ${deploymentEnv} — use image deploy`
                  : undefined
              }
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
              <strong style={{ display: "block", marginBottom: "4px" }}>
                ⚠ Mode warning
              </strong>
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
          </div>
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
