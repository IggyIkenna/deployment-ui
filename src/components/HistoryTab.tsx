import { useEffect, useState } from "react";

interface RawDeployment {
  id: string;
  service: string;
  status: string;
  created_at: string;
  updated_at?: string;
  parameters?: { mode?: string; compute?: string; cloud_provider?: string };
  tag?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-500/20 text-green-400",
  running: "bg-blue-500/20 text-blue-400",
  failed: "bg-red-500/20 text-red-400",
  queued: "bg-yellow-500/20 text-yellow-400",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

interface Props {
  serviceName: string | null;
}

export function HistoryTab({ serviceName }: Props) {
  const [deployments, setDeployments] = useState<RawDeployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceName) return;
    setLoading(true);
    setError(null);
    fetch(`/api/deployments?service_id=${encodeURIComponent(serviceName)}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setDeployments(data as RawDeployment[]);
        } else if (data && typeof data === "object" && "deployments" in data) {
          const d = (data as { deployments: unknown }).deployments;
          setDeployments(Array.isArray(d) ? (d as RawDeployment[]) : []);
        } else {
          setDeployments([]);
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [serviceName]);

  if (loading) {
    return <div className="py-8 text-center text-[var(--color-text-secondary)] text-sm">Loading…</div>;
  }

  if (error) {
    return <div className="py-8 text-center text-red-400 text-sm">{error}</div>;
  }

  if (deployments.length === 0) {
    return <div className="py-8 text-center text-[var(--color-text-secondary)] text-sm">No deployments found.</div>;
  }

  return (
    <div className="space-y-2">
      {deployments.map((dep) => (
        <div
          key={dep.id}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 text-sm"
        >
          <span className="font-mono text-[var(--color-text-primary)]">{dep.id}</span>
          <div className="flex items-center gap-2">
            {dep.parameters?.mode === "live" && (
              <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-orange-500/20 text-orange-400 uppercase">
                LIVE
              </span>
            )}
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[dep.status.toLowerCase()] ?? "bg-gray-500/20 text-gray-400"}`}
            >
              {statusLabel(dep.status)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
