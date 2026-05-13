import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "./ui/table";
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

  const getStalenessColor = (
    stalenessSec: number,
  ): "default" | "secondary" | "destructive" => {
    if (stalenessSec < 300) return "default";
    if (stalenessSec < 900) return "secondary";
    return "destructive";
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

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Asset Group</TableCell>
            <TableCell>Data Type</TableCell>
            <TableCell>Venue / Chain</TableCell>
            <TableCell>Capture Status</TableCell>
            <TableCell>Staleness</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-medium">{row.asset_group}</TableCell>
              <TableCell>{row.data_type}</TableCell>
              <TableCell>{row.chain || row.venue}</TableCell>
              <TableCell>
                <Badge variant="outline">{row.capture_status}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={getStalenessColor(row.staleness_seconds)}
                  className="whitespace-nowrap"
                >
                  {getStalenessLabel(row.staleness_seconds)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
