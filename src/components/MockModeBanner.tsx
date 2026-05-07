import { useEffect, useState } from "react";
import { MOCK_MODE as FRONTEND_MOCK } from "../lib/mock-api";

type HealthPayload = {
  status: string;
  service: string;
  cloud_provider: string;
  mock_mode: boolean;
  data_freshness?: { last_processed_date?: string; stale?: boolean };
};

type BackendState =
  | { kind: "loading" }
  | { kind: "starting"; reason: string }
  | { kind: "unreachable"; reason: string }
  | {
      kind: "ok";
      mock_mode: boolean;
      cloud_provider: string;
      last_processed_date?: string;
      stale?: boolean;
    };

// Real-mode cold start (Secret Manager + Redis + GCS init) typically takes
// 60-90s. Stay in the yellow "starting up" state until either (a) the first
// successful poll lands or (b) the grace window elapses, then flip to red.
const STARTUP_GRACE_MS = 120_000;
const STARTUP_POLL_MS = 4_000;
const STEADY_POLL_MS = 30_000;

/**
 * Polls /api/health to surface backend mock state + freshness.
 *
 * Cross-axis visibility: the frontend may be in mock (VITE_MOCK_API=true),
 * the backend may be in mock (CLOUD_MOCK_MODE=true), or both. Users need
 * to see which so nobody mistakes sample data for live capture.
 *
 * Boot phase: faster retries (4s) and a yellow "starting up" banner until
 * the first success — avoids a misleading red "unreachable" flash during
 * real-mode cold start. After first success, polls every 30s and only
 * shows red on genuine outages.
 */
function useBackendHealth(): BackendState {
  const [state, setState] = useState<BackendState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hasEverConnected = false;
    const mountedAt = Date.now();

    const poll = async () => {
      let nextDelay = STEADY_POLL_MS;
      try {
        // 15s timeout — long enough to absorb the deployment-api's per-VM
        // shard merge fallback path (kicks in when the consolidated manifest
        // blob is older than 120s; the live merge can take 5-10s on cold
        // caches). Short enough to surface a genuine backend outage within
        // half a poll interval.
        const res = await fetch("/api/health", { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          const reason = `HTTP ${res.status}`;
          if (!cancelled) {
            const inGrace = !hasEverConnected && Date.now() - mountedAt < STARTUP_GRACE_MS;
            setState({ kind: inGrace ? "starting" : "unreachable", reason });
            nextDelay = inGrace ? STARTUP_POLL_MS : STEADY_POLL_MS;
          }
          return;
        }
        const data = (await res.json()) as HealthPayload;
        if (!cancelled) {
          hasEverConnected = true;
          setState({
            kind: "ok",
            mock_mode: Boolean(data.mock_mode),
            cloud_provider: data.cloud_provider || "unknown",
            last_processed_date: data.data_freshness?.last_processed_date,
            stale: data.data_freshness?.stale,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const reason = err instanceof Error ? err.message : "fetch failed";
          const inGrace = !hasEverConnected && Date.now() - mountedAt < STARTUP_GRACE_MS;
          setState({ kind: inGrace ? "starting" : "unreachable", reason });
          nextDelay = inGrace ? STARTUP_POLL_MS : STEADY_POLL_MS;
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(() => void poll(), nextDelay);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return state;
}

export function MockModeBanner() {
  const backend = useBackendHealth();

  const backendMock = backend.kind === "ok" && backend.mock_mode;
  const backendUnreachable = backend.kind === "unreachable";
  const backendStarting = backend.kind === "starting";
  const dataStale = backend.kind === "ok" && Boolean(backend.stale);
  const lastDate = backend.kind === "ok" ? backend.last_processed_date : undefined;

  // Priority: unreachable > starting > both-mock > backend-mock > frontend-mock > stale.
  if (backendUnreachable) {
    return (
      <div className="w-full bg-red-500/20 border-b border-red-500/40 px-4 py-1.5 text-center text-xs font-medium text-red-300">
        Backend unreachable — {backend.reason} (UI may show stale cached data)
      </div>
    );
  }

  if (backendStarting) {
    return (
      <div className="w-full bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-1.5 text-center text-xs font-medium text-yellow-200">
        Backend starting up — waiting for initial connection ({backend.reason})
      </div>
    );
  }

  if (FRONTEND_MOCK && backendMock) {
    return (
      <div className="w-full bg-amber-500/25 border-b border-amber-500/40 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
        Mock Mode — frontend interceptors + backend <code>CLOUD_MOCK_MODE=true</code> (no real cloud data)
      </div>
    );
  }

  if (backendMock) {
    return (
      <div className="w-full bg-amber-500/20 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
        Backend Mock Mode — API has <code>CLOUD_MOCK_MODE=true</code> (sample data, not live GCS/AWS)
      </div>
    );
  }

  if (FRONTEND_MOCK) {
    return (
      <div className="w-full bg-amber-500/20 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
        Frontend Mock Mode — UI intercepts <code>/api/*</code> calls with sample data (backend live but unused)
      </div>
    );
  }

  if (dataStale) {
    return (
      <div className="w-full bg-yellow-500/15 border-b border-yellow-500/30 px-4 py-1.5 text-center text-xs font-medium text-yellow-200">
        Data freshness stale — last processed date {lastDate ?? "unknown"}
      </div>
    );
  }

  return null;
}
