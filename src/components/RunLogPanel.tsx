/**
 * RunLogPanel — the actual run.log viewer (WS-4 decision 3): size, a capped tail, and a
 * working download. A separate component from the lifecycle-events panel (VmEventsTimeline /
 * StreamingLogsPanel), which reads a different bucket entirely and is not log content.
 *
 * Honest states: "no log available" (neither the live vm-logs/ path nor the durable
 * final-snapshot archive path has an object — e.g. a VM that completed before the
 * final-snapshot writer shipped), "log expired (14-day TTL), showing archive copy" (the
 * live path missed and the archive fallback resolved), and surfaced errors — never a
 * silent blank panel.
 *
 * Plan: deployment_ui_vm_log_viewer_2026_07_20.md, todo [UI] P0.
 */
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, ScrollText } from "lucide-react";
import {
  getRunLogDownload,
  getRunLogMetadata,
  getRunLogTail,
  type RunLogMetadata,
  type RunLogTail,
} from "../api/deploymentApi";
import { Button } from "./ui/button";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RunLogPanel({ name }: { name: string }) {
  const [metadata, setMetadata] = useState<RunLogMetadata | null>(null);
  const [tail, setTail] = useState<RunLogTail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([getRunLogMetadata(name), getRunLogTail(name)])
      .then(([meta, t]) => {
        setMetadata(meta);
        setTail(t);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = () => {
    setDownloading(true);
    setDownloadError(null);
    getRunLogDownload(name)
      .then((d) => {
        if (!d.exists || !d.download_url) {
          setDownloadError("no log available to download");
          return;
        }
        window.open(d.download_url, "_blank", "noopener,noreferrer");
      })
      .catch((e: unknown) => setDownloadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDownloading(false));
  };

  return (
    <div data-testid="run-log-panel">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <ScrollText className="h-3.5 w-3.5" />
          {loading && !metadata ? (
            <span>Loading…</span>
          ) : metadata?.exists ? (
            <span data-testid="run-log-size">
              {formatBytes(metadata.size_bytes)}
              {metadata.last_modified ? ` · last modified ${metadata.last_modified}` : ""}
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="run-log-refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={downloading || !metadata?.exists}
            data-testid="run-log-download"
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-2 text-xs text-red-400" data-testid="run-log-error">
          {error}
        </div>
      )}
      {downloadError && (
        <div role="alert" className="mb-2 text-xs text-red-400" data-testid="run-log-download-error">
          {downloadError}
        </div>
      )}

      {!loading && metadata != null && !metadata.exists ? (
        <p className="text-xs text-[var(--color-text-muted)]" data-testid="run-log-empty">
          No log available — this run predates the durable run.log snapshot, or the live copy has expired past its
          14-day TTL with no archive copy either.
        </p>
      ) : (
        <>
          {metadata?.location === "archive" && (
            <p
              className="mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400"
              data-testid="run-log-archive-notice"
            >
              Log expired (14-day TTL) — showing archive copy.
            </p>
          )}
          <div
            className="h-[320px] overflow-y-auto rounded bg-gray-900 p-3 font-mono text-xs text-gray-100"
            data-testid="run-log-tail"
          >
            {loading && !tail && <div className="text-blue-400">Loading run.log…</div>}
            {tail && tail.lines.length === 0 && <div className="text-gray-500">Log is empty.</div>}
            {tail?.lines.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap py-0.5">
                {line}
              </div>
            ))}
          </div>
          {tail && tail.exists && (
            <p className="mt-1 text-[10px] text-[var(--color-text-muted)]" data-testid="run-log-tail-label">
              last {tail.line_count} lines of {formatBytes(tail.size_bytes)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
