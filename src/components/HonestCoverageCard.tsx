import { BarChart3, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { HonestCoverageResponse } from "../api/client";
import { getHonestCoverage } from "../api/client";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const AG_ORDER = ["cefi", "defi", "tradfi", "sports", "prediction"] as const;

function CoverageBar({
  captured,
  empty_confirmed,
  attempted_failed,
  expected_unattempted,
  total,
}: {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted: number;
  total: number;
}) {
  if (total === 0)
    return <div className="h-2 rounded bg-[var(--color-bg-tertiary)]" />;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div className="flex h-2 rounded overflow-hidden w-full">
      <div
        className="bg-emerald-500"
        style={{ width: pct(captured) }}
        title={`captured: ${captured}`}
      />
      <div
        className="bg-yellow-400"
        style={{ width: pct(empty_confirmed) }}
        title={`empty_confirmed: ${empty_confirmed}`}
      />
      <div
        className="bg-red-500"
        style={{ width: pct(attempted_failed) }}
        title={`attempted_failed: ${attempted_failed}`}
      />
      <div
        className="bg-[var(--color-bg-tertiary)]"
        style={{ width: pct(expected_unattempted) }}
        title={`expected_unattempted: ${expected_unattempted}`}
      />
    </div>
  );
}

export function HonestCoverageCard({ date }: { date?: string }) {
  const [data, setData] = useState<HonestCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHonestCoverage(date)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const notYetComputed = !loading && data === null && error === null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          <CardTitle className="text-base">Honest Coverage</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            MANIFEST
          </Badge>
          <span
            className="text-[10px] text-[var(--color-text-muted)] cursor-help"
            title="captured / (captured + attempted_failed + expected_unattempted) — empty_confirmed excluded (legitimate absence)"
          >
            reachable
          </span>
          {data?.date && (
            <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">
              {data.date}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading coverage…
          </div>
        ) : notYetComputed ? (
          <div
            className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]"
            data-testid="honest-coverage-not-yet-computed"
          >
            <Info className="h-4 w-4" />
            Coverage data not yet computed for{date ? ` ${date}` : " this date"}
            .
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : data ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {AG_ORDER.filter((ag) => ag in data.by_asset_group).map((ag) => {
                const s = data.by_asset_group[ag];
                return (
                  <div
                    key={ag}
                    className="p-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono uppercase"
                      >
                        {ag}
                      </Badge>
                      <span
                        className={`text-xs font-mono font-bold ${
                          s.coverage_pct >= 95
                            ? "text-emerald-600"
                            : s.coverage_pct >= 80
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {s.coverage_pct.toFixed(1)}%
                      </span>
                    </div>
                    <CoverageBar
                      captured={s.captured}
                      empty_confirmed={s.empty_confirmed}
                      attempted_failed={s.attempted_failed}
                      expected_unattempted={s.expected_unattempted}
                      total={s.total}
                    />
                    <div className="text-[10px] text-[var(--color-text-muted)]">
                      {s.total.toLocaleString()} shards
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 text-[10px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
                captured
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-yellow-400" />
                empty_confirmed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />
                attempted_failed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-[var(--color-bg-tertiary)]" />
                expected_unattempted
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
