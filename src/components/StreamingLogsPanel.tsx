import { useState, useRef, useEffect } from "react";
import { useVmEventStream } from "../hooks/useVmEventStream";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Download, Pause, Play } from "lucide-react";
import type { VmEvent, VmLogLine } from "../api/deploymentApi";

const _API_BASE = import.meta.env.VITE_DEPLOYMENT_API_URL ?? "";

interface LogEntry {
  timestamp: string;
  event: string;
  message: string;
}

interface StreamingLogsPanelProps {
  /** Legacy WebSocket path: pass vmName (+optional date) for backfill sub-tab rows */
  vmName?: string;
  date?: string;
  /** SSE path (c5): pass targetRef to use GET /api/logs/stream/{targetRef} */
  targetRef?: string;
  onClose?: () => void;
}

function useSSELogStream(targetRef: string | undefined): {
  entries: LogEntry[];
  loading: boolean;
  error: Error | null;
} {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(targetRef !== undefined);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!targetRef) return;

    setLoading(true);
    setEntries([]);
    setError(null);

    const es = new EventSource(`${_API_BASE}/api/logs/stream/${encodeURIComponent(targetRef)}`);

    es.addEventListener("vm_event", (ev) => {
      try {
        const line = JSON.parse(ev.data) as VmLogLine;
        setEntries((prev) => [
          ...prev,
          { timestamp: line.timestamp, event: line.event, message: line.message },
        ]);
        setLoading(false);
      } catch {
        // skip malformed event
      }
    });

    es.addEventListener("heartbeat", () => {
      setLoading(false);
    });

    es.addEventListener("done", () => {
      es.close();
    });

    es.onerror = () => {
      setError(new Error("Stream connection lost"));
      setLoading(false);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [targetRef]);

  return { entries, loading, error };
}

export function StreamingLogsPanel({
  vmName,
  date,
  targetRef,
  onClose,
}: StreamingLogsPanelProps) {
  const wsStream = useVmEventStream(targetRef ? "" : (vmName ?? ""), date);
  const sseStream = useSSELogStream(targetRef);

  const useSSE = Boolean(targetRef);

  const rawEntries: LogEntry[] = useSSE
    ? sseStream.entries
    : wsStream.events.map((e: VmEvent) => ({
        timestamp: e.timestamp,
        event: e.event_type,
        message: e.message ?? "",
      }));

  const loading = useSSE ? sseStream.loading : wsStream.loading;
  const error = useSSE ? sseStream.error : wsStream.error;

  const [searchText, setSearchText] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [rawEntries, isPaused]);

  const filteredEntries = searchText
    ? rawEntries.filter(
        (e) =>
          e.message.toLowerCase().includes(searchText.toLowerCase()) ||
          e.event.toLowerCase().includes(searchText.toLowerCase()),
      )
    : rawEntries;

  const handleDownload = () => {
    const csv =
      "timestamp,event,message\n" +
      filteredEntries
        .map(
          (e) =>
            `"${e.timestamp}","${e.event}","${e.message.replace(/"/g, '""')}"`,
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${targetRef ?? vmName ?? "vm"}-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Search logs..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? (
            <>
              <Play className="w-4 h-4 mr-2" /> Resume
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 mr-2" /> Pause
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={filteredEntries.length === 0}
        >
          <Download className="w-4 h-4 mr-2" /> Download
        </Button>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-900 text-gray-100 p-3 rounded font-mono text-xs">
        {loading && <div className="text-blue-400">Connecting to log stream…</div>}
        {error && <div className="text-red-400">Error: {error.message}</div>}
        {!loading && filteredEntries.length === 0 && searchText && (
          <div className="text-gray-500">No matching logs found</div>
        )}
        {!loading && filteredEntries.length === 0 && !searchText && (
          <div className="text-gray-500">No events yet — waiting for stream</div>
        )}
        {filteredEntries.map((entry, idx) => (
          <div key={idx} className="py-1 border-b border-gray-800">
            <span className="text-gray-400">{entry.timestamp}</span>
            {" | "}
            <span className="text-blue-400">{entry.event}</span>
            {" | "}
            <span className="text-green-400">{entry.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="text-xs text-gray-500">
        Showing {filteredEntries.length} of {rawEntries.length} events
        {useSSE ? " (SSE stream)" : " (WebSocket)"}
      </div>
    </div>
  );
}
