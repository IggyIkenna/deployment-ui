/**
 * AuditLogViewer — paginated kill-switch audit log.
 *
 * Plan: `disaster_recovery_circuit_breakers_2026_05_10.md` Phase 7.B.
 *
 * Reads from `/api/kill-switch/audit-log` (shipped under Phase 7.A by
 * Sub-L). If that endpoint isn't yet wired (e.g. running against a stale
 * deployment-api), the viewer gracefully degrades to a
 * "audit log not yet available" empty state — same shape as the
 * LiveDataStatusTab pre-Phase-5/6 empty state.
 *
 * Per-row display:
 *   switch_id · provenance · requested_by/disarmed_by · arm/disarm timestamp · metadata
 *
 * Filters: switch_id + date range (start_date / end_date). Both are
 * query-string params forwarded to the API.
 */

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "../../../auth/GoogleAuth";

import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

// ---------------------------------------------------------------------------
// Contract types — mirror the deployment-api `/api/kill-switch/audit-log`
// response shape per Phase 7.A. Inlined as a Phase 7.B stub.
// ---------------------------------------------------------------------------

export type KillSwitchAction = "arm" | "disarm";

export interface KillSwitchAuditEntry {
  entry_id: string;
  switch_id: string;
  action: KillSwitchAction;
  provenance: "operator" | "breaker" | "scenario" | "scheduled";
  requested_by: string | null;
  disarmed_by: string | null;
  timestamp: string;
  metadata: Record<string, string>;
}

export interface KillSwitchAuditResponse {
  entries: KillSwitchAuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

interface AuditFilters {
  switchId: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
}

export async function fetchAuditLog(filters: AuditFilters): Promise<KillSwitchAuditResponse> {
  const params = new URLSearchParams();
  if (filters.switchId.trim().length > 0) {
    params.append("switch_id", filters.switchId.trim());
  }
  if (filters.startDate.trim().length > 0) {
    params.append("start_date", filters.startDate.trim());
  }
  if (filters.endDate.trim().length > 0) {
    params.append("end_date", filters.endDate.trim());
  }
  params.append("page", String(filters.page));
  params.append("page_size", String(filters.pageSize));
  const response = await fetch(`/api/kill-switch/audit-log?${params.toString()}`, {
    headers: authHeaders({ Accept: "application/json" }),
  });
  if (response.status === 404) {
    // Endpoint not yet wired — graceful "not available" sentinel.
    throw new Error("AUDIT_LOG_ENDPOINT_NOT_AVAILABLE");
  }
  if (!response.ok) {
    throw new Error(`Failed to load audit log: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as KillSwitchAuditResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; response: KillSwitchAuditResponse }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export function AuditLogViewer(): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [switchId, setSwitchId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetchAuditLog({
        switchId,
        startDate,
        endDate,
        page,
        pageSize: 25,
      });
      setState({ kind: "loaded", response });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "AUDIT_LOG_ENDPOINT_NOT_AVAILABLE") {
        setState({ kind: "unavailable" });
      } else {
        setState({ kind: "error", message: msg });
      }
    }
  }, [switchId, startDate, endDate, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-testid="kill-switch-audit-log" className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Filter audit entries</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label htmlFor="filter-switch-id">Switch id</Label>
            <Input
              id="filter-switch-id"
              data-testid="audit-filter-switch-id"
              value={switchId}
              onChange={(e) => {
                setSwitchId(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. GLOBAL_TRADING_HALT"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-start">Start date</Label>
            <Input
              id="filter-start"
              data-testid="audit-filter-start-date"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-end">End date</Label>
            <Input
              id="filter-end"
              data-testid="audit-filter-end-date"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => void load()} data-testid="audit-refresh">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {state.kind === "idle" || state.kind === "loading" ? (
        <p data-testid="audit-log-loading" className="text-sm text-[var(--color-text-muted)]">
          Loading audit log…
        </p>
      ) : null}

      {state.kind === "unavailable" ? (
        <div
          data-testid="audit-log-unavailable"
          className="rounded-md border border-dashed border-[var(--color-border-default)] p-6 text-center"
        >
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">Audit log not yet available</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            The <code>/api/kill-switch/audit-log</code> endpoint is not wired on this deployment-api. Phase 7.A (Sub-L)
            ships this endpoint; once it lands, this viewer renders the live entries.
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          data-testid="audit-log-error"
          className="rounded-md border border-[var(--color-status-error-border-strong)] bg-[var(--color-status-error-bg)] p-4 text-sm text-[var(--color-accent-red)]"
        >
          <p className="font-medium">Failed to load audit log</p>
          <p className="mt-1 text-[var(--color-text-secondary)]">{state.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === "loaded" && state.response.entries.length === 0 ? (
        <div
          data-testid="audit-log-empty"
          className="rounded-md border border-dashed border-[var(--color-border-default)] p-6 text-center"
        >
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            No audit entries match the current filters.
          </p>
        </div>
      ) : null}

      {state.kind === "loaded" && state.response.entries.length > 0 ? (
        <AuditLogTable response={state.response} onPage={setPage} page={page} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Populated table sub-component
// ---------------------------------------------------------------------------

interface AuditLogTableProps {
  response: KillSwitchAuditResponse;
  page: number;
  onPage: (page: number) => void;
}

function AuditLogTable({ response, page, onPage }: AuditLogTableProps): ReactElement {
  const lastPage = Math.max(1, Math.ceil(response.total / response.page_size));

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-bg-elevated)] text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Timestamp</th>
            <th className="px-3 py-2 font-medium">Switch id</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Provenance</th>
            <th className="px-3 py-2 font-medium">Actor</th>
            <th className="px-3 py-2 font-medium">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {response.entries.map((entry) => (
            <tr
              key={entry.entry_id}
              data-testid={`audit-row-${entry.entry_id}`}
              className="border-t border-[var(--color-border-default)]"
            >
              <td className="px-3 py-2 font-mono text-xs">
                <time dateTime={entry.timestamp}>{entry.timestamp}</time>
              </td>
              <td className="px-3 py-2 font-mono">{entry.switch_id}</td>
              <td className="px-3 py-2">
                <Badge variant={entry.action === "arm" ? "error" : "success"}>{entry.action.toUpperCase()}</Badge>
              </td>
              <td className="px-3 py-2">{entry.provenance}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {entry.action === "arm" ? (entry.requested_by ?? "—") : (entry.disarmed_by ?? "—")}
              </td>
              <td className="px-3 py-2 text-xs">
                {Object.entries(entry.metadata).map(([k, v]) => (
                  <div key={k}>
                    <span className="font-medium">{k}:</span> {v}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg-elevated)] text-xs">
        <span>
          Page {page} of {lastPage} ({response.total} total entries)
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            data-testid="audit-page-prev"
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => onPage(page + 1)}
            data-testid="audit-page-next"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
