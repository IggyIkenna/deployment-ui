import { useState, useRef, useEffect } from "react";
import { useVmEventStream } from "../hooks/useVmEventStream";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Download, Pause, Play } from "lucide-react";
import type { VmEvent } from "../api/deploymentApi";

interface StreamingLogsPanelProps {
  vmName: string;
  date?: string;
  onClose?: () => void;
}

export function StreamingLogsPanel({
  vmName,
  date,
  onClose,
}: StreamingLogsPanelProps) {
  const { events, loading, error } = useVmEventStream(vmName, date);
  const [searchText, setSearchText] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, isPaused]);

  const filteredEvents = searchText
    ? events.filter(
        (event) =>
          event.message?.toLowerCase().includes(searchText.toLowerCase()) ||
          event.event_type?.toLowerCase().includes(searchText.toLowerCase()),
      )
    : events;

  const handleDownload = () => {
    const csv =
      "timestamp,event_type,message\n" +
      filteredEvents
        .map(
          (e: VmEvent) =>
            `"${e.timestamp}","${e.event_type}","${(e.message || "").replace(/"/g, '""')}"`,
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${new Date().toISOString()}.csv`;
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
          disabled={filteredEvents.length === 0}
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
        {loading && <div className="text-blue-400">Loading events...</div>}
        {error && <div className="text-red-400">Error: {error.message}</div>}
        {!loading && filteredEvents.length === 0 && searchText && (
          <div className="text-gray-500">No matching logs found</div>
        )}
        {!loading && filteredEvents.length === 0 && !searchText && (
          <div className="text-gray-500">No events yet</div>
        )}
        {filteredEvents.map((event: VmEvent, idx: number) => (
          <div key={idx} className="py-1 border-b border-gray-800">
            <span className="text-gray-400">{event.timestamp}</span>
            {" | "}
            <span className="text-blue-400">{event.event_type}</span>
            {" | "}
            <span className="text-green-400">{event.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="text-xs text-gray-500">
        Showing {filteredEvents.length} of {events.length} events
      </div>
    </div>
  );
}
