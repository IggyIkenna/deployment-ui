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

interface LifecyclePrefetchState {
  backfill: PrefetchCacheState;
  live: PrefetchCacheState;
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
  | { type: "LIVE_ERROR"; payload: Error };

const initialState: LifecyclePrefetchState = {
  backfill: {
    data: null,
    loading: false,
    error: null,
    fetchedAt: null,
  },
  live: {
    data: null,
    loading: false,
    error: null,
    fetchedAt: null,
  },
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
        backfill: {
          data: null,
          loading: false,
          error: action.payload,
          fetchedAt: null,
        },
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
        live: {
          data: null,
          loading: false,
          error: action.payload,
          fetchedAt: null,
        },
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
      isCacheFresh(state.live.fetchedAt)
    ) {
      return;
    }

    let isMounted = true;
    dispatch({ type: "FETCH_START" });

    const fetchData = async () => {
      try {
        const [backfillResponse, liveResponse] = await Promise.all([
          fetchVmDeployments(7),
          getLiveStatus(),
        ]);

        if (!isMounted) return;

        dispatch({
          type: "BACKFILL_SUCCESS",
          payload: backfillResponse,
        });
        dispatch({
          type: "LIVE_SUCCESS",
          payload: liveResponse,
        });
      } catch (err) {
        if (!isMounted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        if (!isCacheFresh(state.backfill.fetchedAt)) {
          dispatch({ type: "BACKFILL_ERROR", payload: error });
        }
        if (!isCacheFresh(state.live.fetchedAt)) {
          dispatch({ type: "LIVE_ERROR", payload: error });
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [target, state.backfill.fetchedAt, state.live.fetchedAt]);

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
