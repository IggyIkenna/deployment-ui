/**
 * RepoCoverageTab — per-repo test coverage panel (Phase 8.E.2).
 *
 * Consumes GET /api/repos/coverage from deployment-api.
 * Auto-refreshes every 60 s; manual refresh button available.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 8.E.2.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRepoCoverage } from "../api/repoCoverage";
import type { RepoCoverage } from "../api/repoCoverage";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const REFRESH_INTERVAL_MS = 60_000;

function CoverageBadge({ aboveTarget }: { aboveTarget: boolean }) {
  return <Badge variant={aboveTarget ? "success" : "error"}>{aboveTarget ? "All green" : "Below target"}</Badge>;
}

function fmtSnapshotAge(snapshotAt: string | null): string {
  if (!snapshotAt) return "—";
  const ms = Date.now() - new Date(snapshotAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function SnapshotAgeBadge({ snapshotAt }: { snapshotAt: string | null }) {
  if (!snapshotAt) {
    return <Badge variant="error">no snapshot</Badge>;
  }
  const ms = Date.now() - new Date(snapshotAt).getTime();
  const days = Math.floor(ms / 86_400_000);
  const variant = days >= 2 ? "error" : days === 1 ? "warning" : "success";
  return <Badge variant={variant}>{fmtSnapshotAge(snapshotAt)}</Badge>;
}

function fmtLastRefreshed(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString();
}

export function RepoCoverageTab() {
  const [rows, setRows] = useState<RepoCoverage[] | null>(null);
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
      const data = await fetchRepoCoverage();
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

  const greenCount = rows ? rows.filter((r) => r.all_above_target).length : 0;
  const totalCount = rows ? rows.length : 0;

  return (
    <Card data-testid="repo-coverage-tab">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Repo Test Coverage</CardTitle>
          <CardDescription>
            Per-repo coverage status from latest snapshot. Green = all surfaces above target; red = worst surface
            details shown.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {rows !== null && (
            <span className="text-sm text-[var(--color-text-secondary)]">
              {greenCount}/{totalCount} green · last {fmtLastRefreshed(lastRefreshed)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void load();
            }}
            disabled={loading}
            data-testid="coverage-refresh-btn"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-[var(--color-accent-red)] mb-4" data-testid="coverage-error">
            {error}
          </p>
        )}
        {!error && rows === null && loading && <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>}
        {rows !== null && rows.length === 0 && (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No data — coverage snapshot cron not yet running.
          </p>
        )}
        {rows !== null && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
                <th className="text-left py-2 pr-6">Repo</th>
                <th className="text-left py-2 pr-6">Coverage</th>
                <th className="text-left py-2 pr-6">Snapshot</th>
                <th className="text-left py-2">Worst surface</th>
              </tr>
            </thead>
            <tbody data-testid="coverage-table-body">
              {rows.map((row) => (
                <tr
                  key={row.repo}
                  className="border-b border-[var(--color-border-primary)]/30 text-[var(--color-text-primary)]"
                  data-testid={`coverage-row-${row.repo}`}
                >
                  <td className="py-2 pr-6 font-mono text-xs">{row.repo}</td>
                  <td className="py-2 pr-6">
                    <CoverageBadge aboveTarget={row.all_above_target} />
                  </td>
                  <td className="py-2 pr-6" data-testid={`coverage-snapshot-age-${row.repo}`}>
                    <SnapshotAgeBadge snapshotAt={row.snapshot_at} />
                  </td>
                  <td className="py-2 text-[var(--color-text-secondary)] text-xs">
                    {row.all_above_target
                      ? "—"
                      : `${row.worst_surface ?? "unknown"} ${row.worst_actual_pct != null ? `${row.worst_actual_pct.toFixed(1)}%` : ""} / ${row.worst_target_pct ?? "?"}% target`}
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
