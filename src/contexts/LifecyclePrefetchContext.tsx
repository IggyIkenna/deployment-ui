import { createContext, useContext, useReducer, useEffect } from "react";
import { useCloudProvider } from "./CloudProviderContext";
import {
  fetchVmDeployments,
  getLiveStatus,
  type VmDeploymentsListResponse,
  type LiveStatusResponse,
} from "../api/deploymentApi";

interface PrefetchCacheState {
  data: unknown;
  loading: boolean;
  error: Error | null;
  fetchedAt: number | null;
}

// b7: all four Monitor sub-tabs prefetched on mount + cloud-target change.
// experiments + scheduled slots are wired; their backend endpoints land in
// Phase C (c2 / c4) — until then, fetch() will 404 → error state (graceful).
interface LifecyclePrefetchState {
  backfill: PrefetchCacheState;
  live: PrefetchCacheState;
  experiments: PrefetchCacheState;
  scheduled: PrefetchCacheState;
}

type PrefetchAction =
  | { type: "FETCH_START" }
  | {
      type: "BACKFILL_SUCCESS";
      payload: VmDeploymentsListResponse;
    }
  | { type: "BACKFILL_ERROR"; payload: Error }
  | {
      type: "LIVE_SUCCESS";
      payload: LiveStatusResponse;
    }
  | { type: "LIVE_ERROR"; payload: Error }
  | { type: "EXPERIMENTS_SUCCESS"; payload: unknown }
  | { type: "EXPERIMENTS_ERROR"; payload: Error }
  | { type: "SCHEDULED_SUCCESS"; payload: unknown }
  | { type: "SCHEDULED_ERROR"; payload: Error };

const EMPTY_SLOT: PrefetchCacheState = {
  data: null,
  loading: false,
  error: null,
  fetchedAt: null,
};

const initialState: LifecyclePrefetchState = {
  backfill: EMPTY_SLOT,
  live: EMPTY_SLOT,
  experiments: EMPTY_SLOT,
  scheduled: EMPTY_SLOT,
};

function reducer(
  state: LifecyclePrefetchState,
  action: PrefetchAction,
): LifecyclePrefetchState {
  switch (action.type) {
    case "FETCH_START":
      return {
        backfill: { ...state.backfill, loading: true },
        live: { ...state.live, loading: true },
        experiments: { ...state.experiments, loading: true },
        scheduled: { ...state.scheduled, loading: true },
      };
    case "BACKFILL_SUCCESS":
      return {
        ...state,
        backfill: {
          data: action.payload,
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      };
    case "BACKFILL_ERROR":
      return {
        ...state,
        backfill: { data: null, loading: false, error: action.payload, fetchedAt: null },
      };
    case "LIVE_SUCCESS":
      return {
        ...state,
        live: {
          data: action.payload,
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      };
    case "LIVE_ERROR":
      return {
        ...state,
        live: { data: null, loading: false, error: action.payload, fetchedAt: null },
      };
    case "EXPERIMENTS_SUCCESS":
      return {
        ...state,
        experiments: {
          data: action.payload,
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      };
    case "EXPERIMENTS_ERROR":
      return {
        ...state,
        experiments: { data: null, loading: false, error: action.payload, fetchedAt: null },
      };
    case "SCHEDULED_SUCCESS":
      return {
        ...state,
        scheduled: {
          data: action.payload,
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      };
    case "SCHEDULED_ERROR":
      return {
        ...state,
        scheduled: { data: null, loading: false, error: action.payload, fetchedAt: null },
      };
    default:
      return state;
  }
}

interface LifecyclePrefetchContextValue {
  state: LifecyclePrefetchState;
}

const LifecyclePrefetchContext = createContext<
  LifecyclePrefetchContextValue | undefined
>(undefined);

const CACHE_TTL_MS = 60000;

const DEPLOYMENT_API = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

async function fetchMonitorEndpoint(path: string): Promise<unknown> {
  const resp = await fetch(`${DEPLOYMENT_API}${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

interface LifecyclePrefetchProviderProps {
  children: React.ReactNode;
}

export function LifecyclePrefetchProvider({
  children,
}: LifecyclePrefetchProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { target } = useCloudProvider();

  useEffect(() => {
    const isCacheFresh = (fetchedAt: number | null) => {
      if (!fetchedAt) return false;
      return Date.now() - fetchedAt < CACHE_TTL_MS;
    };

    if (
      isCacheFresh(state.backfill.fetchedAt) &&
      isCacheFresh(state.live.fetchedAt) &&
      isCacheFresh(state.experiments.fetchedAt) &&
      isCacheFresh(state.scheduled.fetchedAt)
    ) {
      return;
    }

    let isMounted = true;
    dispatch({ type: "FETCH_START" });

    const cloud = target === "aws" ? "aws" : "gcp";

    const fetchData = async () => {
      const [backfillResult, liveResult, experimentsResult, scheduledResult] =
        await Promise.allSettled([
          fetchVmDeployments(7),
          getLiveStatus(),
          fetchMonitorEndpoint(`/api/monitor/experiments?cloud=${cloud}`),
          fetchMonitorEndpoint(`/api/monitor/scheduled?cloud=${cloud}`),
        ]);

      if (!isMounted) return;

      if (backfillResult.status === "fulfilled") {
        dispatch({ type: "BACKFILL_SUCCESS", payload: backfillResult.value });
      } else {
        const error =
          backfillResult.reason instanceof Error
            ? backfillResult.reason
            : new Error(String(backfillResult.reason));
        dispatch({ type: "BACKFILL_ERROR", payload: error });
      }

      if (liveResult.status === "fulfilled") {
        dispatch({ type: "LIVE_SUCCESS", payload: liveResult.value });
      } else {
        const error =
          liveResult.reason instanceof Error
            ? liveResult.reason
            : new Error(String(liveResult.reason));
        dispatch({ type: "LIVE_ERROR", payload: error });
      }

      if (experimentsResult.status === "fulfilled") {
        dispatch({ type: "EXPERIMENTS_SUCCESS", payload: experimentsResult.value });
      } else {
        const error =
          experimentsResult.reason instanceof Error
            ? experimentsResult.reason
            : new Error(String(experimentsResult.reason));
        dispatch({ type: "EXPERIMENTS_ERROR", payload: error });
      }

      if (scheduledResult.status === "fulfilled") {
        dispatch({ type: "SCHEDULED_SUCCESS", payload: scheduledResult.value });
      } else {
        const error =
          scheduledResult.reason instanceof Error
            ? scheduledResult.reason
            : new Error(String(scheduledResult.reason));
        dispatch({ type: "SCHEDULED_ERROR", payload: error });
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [target, state.backfill.fetchedAt, state.live.fetchedAt, state.experiments.fetchedAt, state.scheduled.fetchedAt]);

  return (
    <LifecyclePrefetchContext.Provider value={{ state }}>
      {children}
    </LifecyclePrefetchContext.Provider>
  );
}

export function useLifecyclePrefetch() {
  const context = useContext(LifecyclePrefetchContext);
  if (!context) {
    throw new Error(
      "useLifecyclePrefetch must be used within LifecyclePrefetchProvider",
    );
  }
  return context.state;
}
