import { useEffect, useState } from "react";
import { fetchVmHealth, type VmHealthResult, type VmHealthState } from "../api/deploymentApi";

const STATE_CLASSES: Record<VmHealthState, string> = {
  green: "bg-green-100 text-green-800 border-green-200",
  amber: "bg-yellow-100 text-yellow-800 border-yellow-200",
  red: "bg-red-100 text-red-800 border-red-200",
  unknown: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATE_LABEL: Record<VmHealthState, string> = {
  green: "healthy",
  amber: "stale",
  red: "critical",
  unknown: "unknown",
};

interface Props {
  vmName: string;
  refreshKey?: number;
}

export function VmHealthBadge({ vmName, refreshKey = 0 }: Props) {
  const [health, setHealth] = useState<VmHealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    fetchVmHealth(vmName)
      .then((result) => {
        if (active) {
          setHealth(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [vmName, refreshKey]);

  if (loading) {
    return (
      <span
        data-testid={`health-badge-loading-${vmName}`}
        className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-gray-50 text-gray-400 border-gray-200"
      >
        …
      </span>
    );
  }

  if (error || !health) {
    return (
      <span
        data-testid={`health-badge-error-${vmName}`}
        className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-gray-100 text-gray-500 border-gray-200"
        title="Health check unavailable"
      >
        —
      </span>
    );
  }

  const state = health.state;
  return (
    <span
      data-testid={`health-badge-${vmName}`}
      data-state={state}
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${STATE_CLASSES[state]}`}
      title={health.message}
    >
      {STATE_LABEL[state]}
    </span>
  );
}
