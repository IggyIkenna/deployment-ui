// Shared VM-run formatting helpers. Originally lived alongside the standalone /vm-deployments
// page (VmDeploymentsContent) — that page + its active/archive tables were deleted 2026-07-21
// (redundant with /deployments' own unified VM-kind inventory, which already has an archive/
// "all" status view; see plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md).
// These functions survive because DeploymentDetail's per-target History card (VmRunHistoryCard)
// still needs them; kept in this file (not renamed/relocated) to avoid an import-path churn
// across DeploymentDetail.tsx for a same-session cleanup with no functional payoff.

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return "—";
    const totalMin = Math.floor(ms / 60_000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${totalMin}m`;
  } catch {
    return "—";
  }
}

export function getOutcomeVariant(
  status: string,
  exitCode: number | null,
): "success" | "warning" | "error" | "default" {
  if (status === "completed" && (exitCode === null || exitCode === 0)) return "success";
  if (status === "failed" || (exitCode !== null && exitCode !== 0)) return "error";
  if (status === "reaped") return "warning";
  return "default";
}

export function getOutcomeLabel(status: string, exitCode: number | null): string {
  if (status === "completed" && (exitCode === null || exitCode === 0)) return "COMPLETED";
  if (status === "failed") return exitCode !== null ? `FAILED (rc=${exitCode})` : "FAILED";
  if (status === "reaped") return "reaped";
  if (exitCode !== null && exitCode !== 0) return `${status.toUpperCase()} (rc=${exitCode})`;
  return status.toUpperCase();
}

export function logUriToConsoleUrl(logUri: string): string | null {
  if (!logUri || !logUri.startsWith("gs://")) return null;
  const withoutScheme = logUri.slice(5);
  const slashIdx = withoutScheme.indexOf("/");
  if (slashIdx === -1) return null;
  const bucket = withoutScheme.slice(0, slashIdx);
  const path = withoutScheme.slice(slashIdx + 1);
  return `https://console.cloud.google.com/storage/browser/_details/${bucket}/${path}`;
}
