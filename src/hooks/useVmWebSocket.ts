import { useState, useEffect, useRef } from "react";

export interface WsVmEvent {
  event: string;
  service: string;
  timestamp: string;
  severity: string;
  correlation_id: string | null;
  details: Record<string, string> | null;
}

interface WsVmEventStreamState {
  events: WsVmEvent[];
  connected: boolean;
  error: string | null;
}

function buildWsUrl(vmName: string): string {
  const base = (import.meta.env.VITE_DEPLOYMENT_API_URL as string | undefined) ?? "";
  if (base) {
    const wsBase = base.replace(/^http/, "ws");
    return `${wsBase}/ws/vm/${encodeURIComponent(vmName)}/events`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/vm/${encodeURIComponent(vmName)}/events`;
}

const MAX_EVENTS = 200;

export function useVmWebSocket(vmName: string | null): WsVmEventStreamState {
  const [state, setState] = useState<WsVmEventStreamState>({
    events: [],
    connected: false,
    error: null,
  });
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!vmName || typeof WebSocket === "undefined") {
      setState({ events: [], connected: false, error: null });
      return;
    }

    let cancelled = false;

    const ws = new WebSocket(buildWsUrl(vmName));
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: true, error: null }));
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      if (cancelled) return;
      try {
        const parsed = JSON.parse(ev.data) as WsVmEvent;
        setState((prev) => {
          const next = [...prev.events, parsed];
          return {
            ...prev,
            events: next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next,
          };
        });
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: false }));
    };

    ws.onerror = () => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, connected: false, error: "Connection lost" }));
    };

    return () => {
      cancelled = true;
      ws.close();
      wsRef.current = null;
    };
  }, [vmName]);

  return state;
}
