import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { setApiBaseUrl, clearCache } from "../api/client";

export type CloudTarget = "gcp" | "aws";

interface CloudProviderState {
  /** Active cloud backend */
  target: CloudTarget;
  /** Switch to the other backend — clears cached data */
  switchTarget: (t: CloudTarget) => void;
  /** API base URL for the active backend */
  apiBaseUrl: string;
  /** Whether a switch is in progress (clearing cache) */
  switching: boolean;
}

/**
 * Port mapping — each backend runs on its own port:
 *   GCP  → 8004 (CLOUD_PROVIDER=gcp)
 *   AWS  → 8005 (CLOUD_PROVIDER=aws)
 */
const PORT_MAP: Record<CloudTarget, number> = {
  gcp: 8004,
  aws: 8005,
};

function getApiBaseUrl(t: CloudTarget): string {
  return `http://localhost:${PORT_MAP[t]}/api`;
}

const CloudProviderContext = createContext<CloudProviderState | null>(null);

export function CloudProviderProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<CloudTarget>("gcp");
  const [switching, setSwitching] = useState(false);

  // Sync API client base URL whenever target changes
  useEffect(() => {
    setApiBaseUrl(getApiBaseUrl(target));
  }, [target]);

  const switchTarget = useCallback(
    async (t: CloudTarget) => {
      if (t === target) return;
      setSwitching(true);
      try {
        // Clear backend cache so stale GCP data doesn't show for AWS and vice versa
        await clearCache().catch(() => {});
      } finally {
        // Switch to new backend
        setTarget(t);
        setSwitching(false);
      }
    },
    [target],
  );

  const apiBaseUrl = getApiBaseUrl(target);

  return (
    <CloudProviderContext.Provider
      value={{ target, switchTarget, apiBaseUrl, switching }}
    >
      {children}
    </CloudProviderContext.Provider>
  );
}

export function useCloudProvider(): CloudProviderState {
  const ctx = useContext(CloudProviderContext);
  if (!ctx) {
    throw new Error(
      "useCloudProvider must be used within CloudProviderProvider",
    );
  }
  return ctx;
}
