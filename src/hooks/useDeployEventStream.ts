import { useState, useRef, useCallback, useEffect } from "react";
import { MOCK_MODE } from "../lib/mock-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployEventStatus =
  | "pending"
  | "running"
  | "completed"
  | "completed_pending_delete"
  | "completed_with_errors"
  | "completed_with_warnings"
  | "clean"
  | "failed"
  | "cancelled"
  | "partial";

export interface DeployStreamEvent {
  deployment_id: string;
  service: string;
  status: DeployEventStatus;
  message: string;
  timestamp: string;
  /** Optional progress percentage (0-100). */
  progress_pct?: number;
  /** Optional shard-level detail. */
  shard_id?: string;
  shard_status?: string;
  total_shards?: number;
  completed_shards?: number;
  failed_shards?: number;
}

export interface UseDeployEventStreamOptions {
  /** SSE endpoint path. Defaults to per-deployment events endpoint. */
  url?: string;
  /** Whether the SSE connection is enabled (default: true). */
  enabled?: boolean;
  /** Called on every incoming event. */
  onEvent?: (event: DeployStreamEvent) => void;
  /** Called when connected. */
  onConnect?: () => void;
  /** Called on error. */
  onError?: (error: Event) => void;
}

export interface UseDeployEventStreamReturn {
  /** Most recently received event payload. */
  lastEvent: DeployStreamEvent | null;
  /** All events received in this session (capped at 200). */
  events: DeployStreamEvent[];
  /** Whether the EventSource is currently open. */
  isConnected: boolean;
  /** Last error event, if any. */
  error: Event | null;
  /** Number of automatic reconnections that have occurred. */
  reconnectCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const MAX_EVENT_BUFFER = 200;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for consuming deployment event SSE streams.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s -> 30s cap).
 * - Heartbeat monitoring -- reconnects if silent for 60s.
 * - Event buffer (last 200 events).
 * - Mock mode skips real connections.
 * - Cleanup on unmount.
 */
export function useDeployEventStream(
  deploymentId: string,
  options: UseDeployEventStreamOptions = {},
): UseDeployEventStreamReturn {
  const {
    url: customUrl,
    enabled = true,
    onEvent,
    onConnect,
    onError,
  } = options;

  // State
  const [lastEvent, setLastEvent] = useState<DeployStreamEvent | null>(null);
  const [events, setEvents] = useState<DeployStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Event | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // Refs for stable callbacks & timers
  const onEventRef = useRef(onEvent);
  const onConnectRef = useRef(onConnect);
  const onErrorRef = useRef(onError);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  // Keep callback refs fresh
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  useEffect(() => {
    onConnectRef.current = onConnect;
  });
  useEffect(() => {
    onErrorRef.current = onError;
  });

  // Heartbeat reset
  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      // No event for 60s -- force reconnect
      esRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  // Real SSE connection
  useEffect(() => {
    if (!enabled || MOCK_MODE || !deploymentId) return;

    let disposed = false;

    function connect() {
      if (disposed) return;

      const sseUrl = customUrl ?? `/api/deployments/${deploymentId}/stream`;

      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.onopen = () => {
        if (disposed) return;
        setIsConnected(true);
        setError(null);
        backoffRef.current = INITIAL_BACKOFF_MS;
        resetHeartbeat();
        onConnectRef.current?.();
      };

      // Handle named "updated" events (backend pattern)
      es.addEventListener("updated", (event: MessageEvent) => {
        if (disposed) return;
        resetHeartbeat();
        handleMessage(event);
      });

      // Handle generic messages
      es.onmessage = (event: MessageEvent) => {
        if (disposed) return;
        resetHeartbeat();
        handleMessage(event);
      };

      es.onerror = (evt: Event) => {
        if (disposed) return;
        setIsConnected(false);
        setError(evt);
        onErrorRef.current?.(evt);
        es.close();
        esRef.current = null;

        if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);

        // Exponential backoff reconnect
        const delay = backoffRef.current;
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        setReconnectCount((c) => c + 1);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    function handleMessage(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data as string) as DeployStreamEvent;
        setLastEvent(parsed);
        setEvents((prev) => {
          const next = [...prev, parsed];
          if (next.length > MAX_EVENT_BUFFER) {
            return next.slice(next.length - MAX_EVENT_BUFFER);
          }
          return next;
        });
        onEventRef.current?.(parsed);
      } catch {
        // Non-JSON payload (e.g. heartbeat ping) -- trigger refetch anyway
        onEventRef.current?.({
          deployment_id: deploymentId,
          service: "",
          status: "running",
          message: "SSE update received",
          timestamp: new Date().toISOString(),
        });
      }
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
      setIsConnected(false);
    };
  }, [enabled, deploymentId, customUrl, resetHeartbeat]);

  return {
    lastEvent,
    events,
    isConnected,
    error,
    reconnectCount,
  };
}
