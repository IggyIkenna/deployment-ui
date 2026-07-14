import { useEffect, useRef } from "react";

/**
 * Drop-in replacement for the common
 *   const id = setInterval(callback, intervalMs);
 *   return () => clearInterval(id);
 * pattern that additionally PAUSES the interval while the tab is hidden
 * (`document.hidden`) and, when the tab becomes visible again, fires an
 * immediate refresh before resuming the same cadence.
 *
 * Does NOT change the configured cadence (30s stays 30s, etc.) and does NOT
 * fire an extra call at mount time — it behaves exactly like a plain
 * `setInterval` except around visibility transitions. Pass `intervalMs =
 * null` to disable polling entirely (mirrors the common `if (!cond) return;`
 * early-exit guard some call sites use before starting their interval).
 *
 * Decided 2026-07-14 (deployment_ui_ux_caching_walkthrough): applied to every
 * interval-based poll in this app EXCEPT the kill-switch tab's 5s poll,
 * which intentionally keeps ticking in a backgrounded tab (safety-critical).
 */
export function useVisibilityPausedInterval(callback: () => void, intervalMs: number | null): void {
  // Latest-ref pattern: callers pass a fresh closure every render without
  // needing useCallback, and without the effect below re-subscribing.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (intervalMs === null) return undefined;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id === null) {
        id = setInterval(() => callbackRef.current(), intervalMs);
      }
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Tab just became visible again — refresh immediately, then resume
        // the normal cadence from now.
        callbackRef.current();
        start();
      }
    };

    if (!document.hidden) {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs]);
}
