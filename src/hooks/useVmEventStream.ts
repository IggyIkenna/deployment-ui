import { useState, useEffect, useRef } from "react";
import { getVmEvents, type VmEvent } from "../api/deploymentApi";
import { useVisibilityPausedInterval } from "./useVisibilityPausedInterval";

interface UseVmEventStreamState {
  events: VmEvent[];
  loading: boolean;
  error: Error | null;
}

export function useVmEventStream(vmName: string, date?: string) {
  const [state, setState] = useState<UseVmEventStreamState>({
    events: [],
    loading: true,
    error: null,
  });
  // Forwards each interval tick to the CURRENT generation's fetchEvents
  // (rebound below whenever vmName/date changes), without needing to
  // restart the interval on every date change.
  const fetchEventsRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!vmName) {
      setState({ events: [], loading: false, error: null });
      fetchEventsRef.current = () => {};
      return;
    }

    let isMounted = true;
    const seenEventIds = new Set<string>();

    const fetchEvents = async () => {
      try {
        const response = await getVmEvents(vmName, date);
        if (!isMounted) return;

        setState((prev) => {
          const allEvents = [...prev.events];
          const newEventIds = new Set(seenEventIds);

          for (const event of response.events) {
            if (!newEventIds.has(event.event_id)) {
              allEvents.push(event);
              newEventIds.add(event.event_id);
            }
          }

          for (const eventId of newEventIds) {
            seenEventIds.add(eventId);
          }

          const trimmed = allEvents.length > 500 ? allEvents.slice(-500) : allEvents;

          return {
            events: trimmed,
            loading: false,
            error: null,
          };
        });
      } catch (err) {
        if (isMounted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          }));
        }
      }
    };

    fetchEventsRef.current = () => {
      void fetchEvents();
    };
    fetchEvents();

    return () => {
      isMounted = false;
    };
  }, [vmName, date]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(() => fetchEventsRef.current(), vmName ? 10000 : null);

  return state;
}
