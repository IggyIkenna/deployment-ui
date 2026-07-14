import { useState, useEffect, useCallback } from "react";
import * as api from "../api/client";
import type { HealthResponse } from "../types";
import { useCloudProvider } from "../contexts/CloudProviderContext";
import { useVisibilityPausedInterval } from "./useVisibilityPausedInterval";

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { target } = useCloudProvider();

  const checkHealth = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.getHealth();
      setHealth(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "API not reachable");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth, target]); // Re-fetch when cloud target switches

  // Poll health every 30 seconds; pauses while the tab is hidden.
  useVisibilityPausedInterval(checkHealth, 30000);

  return { health, loading, error, isHealthy: health?.status === "healthy" };
}
