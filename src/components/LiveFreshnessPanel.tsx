import { useState, useEffect } from "react";
import { Badge } from "./ui/badge";
import { getLiveStatus, type LiveStatusRow } from "../api/deploymentApi";

export function LiveFreshnessPanel() {
  const [rows, setRows] = useState<LiveStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchLiveStatus = async () => {
      try {
        const response = await getLiveStatus();
        if (!isMounted) return;
        setRows(response.rows);
        setRefreshedAt(response.refreshed_at);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const getStalenessColor = (stalenessSec: number): string => {
    if (stalenessSec < 300) return "bg-green-100 text-green-800";
    if (stalenessSec < 900) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getStalenessLabel = (stalenessSec: number): string => {
    if (stalenessSec < 300) return `Fresh (${stalenessSec}s)`;
    if (stalenessSec < 900) return `Degraded (${stalenessSec}s)`;
    return `Stale (${stalenessSec}s)`;
  };

  if (loading) {
    return <div className="p-4 text-center">Loading live freshness...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error.message}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Live pipeline not yet active — awaiting live MTDS/MDPS producers
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live Data Freshness</h3>
        {refreshedAt && (
          <span className="text-xs text-gray-500">
            Last refreshed: {new Date(refreshedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-100 p-3 grid grid-cols-5 gap-2 font-semibold text-sm">
          <div>Asset Group</div>
          <div>Data Type</div>
          <div>Venue / Chain</div>
          <div>Capture Status</div>
          <div>Staleness</div>
        </div>
        <div className="divide-y">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="p-3 grid grid-cols-5 gap-2 items-center text-sm hover:bg-gray-50"
            >
              <div className="font-medium">{row.asset_group}</div>
              <div>{row.data_type}</div>
              <div>{row.chain || row.venue}</div>
              <div>
                <Badge variant="outline">{row.capture_status}</Badge>
              </div>
              <div>
                <Badge
                  className={`whitespace-nowrap ${getStalenessColor(row.staleness_seconds)}`}
                >
                  {getStalenessLabel(row.staleness_seconds)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
