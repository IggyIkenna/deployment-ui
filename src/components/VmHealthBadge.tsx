import { useEffect, useState } from "react";
import { fetchVmHealth, type VmHealthResult, type VmHealthState } from "../api/deploymentApi";

const STATE_CLASSES: Record<VmHealthState, string> = {
  green: "bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] border-[var(--color-accent-green)]/40",
  amber: "bg-[var(--color-status-warning-bg)] text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/40",
  red: "bg-[var(--color-status-error-bg)] text-[var(--color-accent-red)] border-[var(--color-accent-red)]/40",
  unknown: "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-[var(--color-border-default)]",
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
        className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"
      >
        …
      </span>
    );
  }

  if (error || !health) {
    return (
      <span
        data-testid={`health-badge-error-${vmName}`}
        className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] border-[var(--color-border-default)]"
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
