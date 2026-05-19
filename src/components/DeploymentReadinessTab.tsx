/**
 * DeploymentReadinessTab — per-repo QG deploy-readiness panel (B-013).
 *
 * Consumes GET /api/repos/deploy-ready from deployment-api.
 * Auto-refreshes every 60 s; manual refresh button available.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 4.B.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRepoReadiness } from "../api/repoReadiness";
import type { RepoReadiness } from "../api/repoReadiness";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

const REFRESH_INTERVAL_MS = 60_000;

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <Badge variant={ready ? "success" : "error"}>
      {ready ? "Ready" : "Not Ready"}
    </Badge>
  );
}

function fmtReason(reason: string): string {
  return reason.replace(/_/g, " ").replace(/:/g, ": ");
}

function fmtSnapshotAge(lastSnapshotDate: string | null): string {
  if (!lastSnapshotDate) return "—";
  const ms = Date.now() - new Date(lastSnapshotDate).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function SnapshotAgeBadge({
  lastSnapshotDate,
}: {
  lastSnapshotDate: string | null;
}) {
  if (!lastSnapshotDate) {
    return <Badge variant="error">no snapshot</Badge>;
  }
  const ms = Date.now() - new Date(lastSnapshotDate).getTime();
  const days = Math.floor(ms / 86_400_000);
  const variant = days >= 2 ? "error" : days === 1 ? "warning" : "success";
  return <Badge variant={variant}>{fmtSnapshotAge(lastSnapshotDate)}</Badge>;
}

function fmtLastRefreshed(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString();
}

export function DeploymentReadinessTab() {
  const [rows, setRows] = useState<RepoReadiness[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRepoReadiness();
      setRows(data);
      setLastRefreshed(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  const readyCount = rows ? rows.filter((r) => r.deploy_ready).length : 0;
  const totalCount = rows ? rows.length : 0;

  return (
    <Card data-testid="deployment-readiness-tab">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Repo Deploy Readiness</CardTitle>
          <CardDescription>
            deploy_ready = true iff last 5 QG snapshots green, zero open P0
            issues, and no in-flight refactor banner.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {rows !== null && (
            <span className="text-sm text-[var(--color-text-secondary)]">
              {readyCount}/{totalCount} ready · last{" "}
              {fmtLastRefreshed(lastRefreshed)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void load();
            }}
            disabled={loading}
            data-testid="readiness-refresh-btn"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p
            className="text-sm text-[var(--color-accent-red)] mb-4"
            data-testid="readiness-error"
          >
            {error}
          </p>
        )}
        {!error && rows === null && loading && (
          <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>
        )}
        {rows !== null && rows.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No data — QG snapshot cron not yet running.
          </p>
        )}
        {rows !== null && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
                <th className="text-left py-2 pr-6">Repo</th>
                <th className="text-left py-2 pr-6">Status</th>
                <th className="text-left py-2 pr-6">Snapshot</th>
                <th className="text-left py-2">Reason</th>
              </tr>
            </thead>
            <tbody data-testid="readiness-table-body">
              {rows.map((row) => (
                <tr
                  key={row.repo}
                  className="border-b border-[var(--color-border-primary)]/30 text-[var(--color-text-primary)]"
                  data-testid={`readiness-row-${row.repo}`}
                >
                  <td className="py-2 pr-6 font-mono text-xs">{row.repo}</td>
                  <td className="py-2 pr-6">
                    <ReadinessBadge ready={row.deploy_ready} />
                  </td>
                  <td
                    className="py-2 pr-6"
                    data-testid={`snapshot-age-${row.repo}`}
                  >
                    <SnapshotAgeBadge
                      lastSnapshotDate={row.last_snapshot_date}
                    />
                  </td>
                  <td className="py-2 text-[var(--color-text-secondary)] text-xs">
                    {fmtReason(row.reason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
