import { useState, useEffect } from "react";
import { getVmEvents, type VmEvent } from "../api/deploymentApi";

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

  useEffect(() => {
    if (!vmName) {
      setState({ events: [], loading: false, error: null });
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

          const trimmed =
            allEvents.length > 500 ? allEvents.slice(-500) : allEvents;

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

    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [vmName, date]);

  return state;
}
