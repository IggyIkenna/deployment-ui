import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  fetchVmFilteredEvents,
  type VMLifecycleEvent,
} from "../api/deploymentApi";

const SEVERITY_CLASSES: Record<string, string> = {
  INFO: "text-[var(--color-text-secondary)] border-[var(--color-border)]",
  WARNING: "text-yellow-400 border-yellow-500/40",
  ERROR: "text-red-400 border-red-500/40",
  CRITICAL: "text-red-300 border-red-400/60",
};

function EventRow({ evt }: { evt: VMLifecycleEvent }) {
  const [open, setOpen] = useState(false);
  const hasDetails = evt.details != null && Object.keys(evt.details).length > 0;
  const cls = SEVERITY_CLASSES[evt.severity] ?? SEVERITY_CLASSES.INFO;

  return (
    <li
      className={`border-l-2 pl-3 py-1.5 ${cls}`}
      data-testid={`event-row-${evt.event}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs text-[var(--color-text-muted)] font-mono shrink-0 w-20">
          {evt.timestamp.slice(11, 19)}
        </span>
        <span className="text-sm font-mono font-medium text-[var(--color-text-primary)]">
          {evt.event}
        </span>
        {hasDetails && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "collapse details" : "expand details"}
            className="ml-auto text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      {open && hasDetails && evt.details && (
        <pre className="mt-1 text-xs font-mono text-[var(--color-text-muted)] whitespace-pre-wrap break-all pl-24">
          {JSON.stringify(evt.details, null, 2)}
        </pre>
      )}
    </li>
  );
}

interface Props {
  vmName: string;
  typeFilter?: string;
  limit?: number;
  refreshKey?: number;
}

export function VmEventsTimeline({
  vmName,
  typeFilter,
  limit = 100,
  refreshKey = 0,
}: Props) {
  const [events, setEvents] = useState<VMLifecycleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalEvents, setTotalEvents] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchVmFilteredEvents(vmName, { type: typeFilter, limit })
      .then((res) => {
        setEvents(res.events);
        setTotalEvents(res.total_events);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => setLoading(false));
  }, [vmName, typeFilter, limit]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div data-testid="vm-events-timeline" className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-muted)]">
          {totalEvents} event{totalEvents !== 1 ? "s" : ""}
          {typeFilter ? ` — type: ${typeFilter}` : ""}
        </span>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Refresh events timeline"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 text-xs text-red-400 py-1"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && events.length === 0 && !error && (
        <p className="text-sm text-[var(--color-text-muted)] py-2 flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}

      {!error && !loading && events.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-2">
          No events found.
        </p>
      )}

      {events.length > 0 && (
        <ul className="space-y-1" aria-label={`Event timeline for ${vmName}`}>
          {events.map((evt, i) => (
            <EventRow key={`${evt.event}-${evt.timestamp}-${i}`} evt={evt} />
          ))}
        </ul>
      )}

      {totalEvents > events.length && (
        <p className="text-xs text-[var(--color-text-muted)] text-center pt-2">
          Showing {events.length} of {totalEvents} events — increase limit to
          see more
        </p>
      )}
    </div>
  );
}
