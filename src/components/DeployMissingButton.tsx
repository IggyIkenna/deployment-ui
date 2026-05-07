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

import { useCallback, useState } from "react";

import {
  type DeployMissingPreviewResponse,
  postDeployMissingPreview,
} from "../api/client";

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

  const handleClick = useCallback(() => {
    setLoading(true);
    setError(null);
    postDeployMissingPreview({ service, asset_group: assetGroup, row_key: rowKey })
      .then((res) => {
        setPreview(res);
      })
      .catch((e: unknown) => {
        setError(String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [service, assetGroup, rowKey]);

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
          <pre className="deploy-missing-command">{preview.command}</pre>
          <div className="deploy-missing-actions">
            <button type="button" onClick={handleCopy} className="copy">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="deploy-missing-meta">
            <code className="shard-key">{preview.shard_key}</code>
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
