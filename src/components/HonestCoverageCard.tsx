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
  expected_unattempted_known_empty,
  expected_unattempted_pending_fetch,
  out_of_window = 0,
  total,
}: {
  captured: number;
  empty_confirmed: number;
  attempted_failed: number;
  expected_unattempted_known_empty: number;
  expected_unattempted_pending_fetch: number;
  out_of_window?: number;
  total: number;
}) {
  // `total` is the denominator from the API (excludes out_of_window already).
  // We render the bar across all cells including OOW so the full width = total + oow.
  const barTotal = total + out_of_window;
  if (barTotal === 0) return <div className="h-2 rounded bg-[var(--color-bg-tertiary)]" />;
  const pct = (n: number) => `${((n / barTotal) * 100).toFixed(1)}%`;
  return (
    <div className="flex h-2 rounded overflow-hidden w-full">
      <div className="bg-emerald-500" style={{ width: pct(captured) }} title={`captured: ${captured}`} />
      <div
        className="bg-teal-400"
        style={{ width: pct(empty_confirmed) }}
        title={`empty_confirmed: ${empty_confirmed}`}
      />
      <div
        className="bg-sky-300"
        style={{ width: pct(expected_unattempted_known_empty) }}
        title={`expected_unattempted_known_empty: ${expected_unattempted_known_empty}`}
      />
      <div
        className="bg-red-500"
        style={{ width: pct(attempted_failed) }}
        title={`attempted_failed: ${attempted_failed}`}
      />
      <div
        className="bg-[var(--color-bg-tertiary)]"
        style={{ width: pct(expected_unattempted_pending_fetch) }}
        title={`expected_unattempted_pending_fetch: ${expected_unattempted_pending_fetch}`}
      />
      {out_of_window > 0 && (
        <div
          className="bg-slate-300 opacity-40"
          style={{ width: pct(out_of_window) }}
          title={`outside window — not a gap: ${out_of_window}`}
        />
      )}
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
            title="Primary (canonical): shards-weighted could-exist ratio = captured / UAC-declared universe. Secondary: manifest-capture ratio = (captured + empty_confirmed + expected_unattempted_known_empty) / attempted shards. out_of_window cells (pre-genesis/delisted/deprecated) are excluded from both denominators."
          >
            reachable
          </span>
          {data?.date && <span className="text-[10px] text-[var(--color-text-muted)] ml-auto">{data.date}</span>}
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
            Coverage data not yet computed for{date ? ` ${date}` : " this date"}.
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : data?.by_asset_group ? (
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
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {ag}
                      </Badge>
                      {/* Primary (canonical): shards-weighted could-exist ratio */}
                      {s.completion_pct_shards_weighted != null ? (
                        <span
                          className={`text-xs font-mono font-bold ${
                            s.completion_pct_shards_weighted >= 99
                              ? "text-emerald-600"
                              : s.completion_pct_shards_weighted >= 50
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                          title="coverage (of could-exist) — shards-weighted UAC universe denominator"
                          data-testid="coverage-could-exist"
                        >
                          {s.completion_pct_shards_weighted.toFixed(1)}%
                        </span>
                      ) : (
                        <span
                          className={`text-xs font-mono font-bold ${
                            s.coverage_pct >= 99
                              ? "text-emerald-600"
                              : s.coverage_pct >= 95
                                ? "text-yellow-600"
                                : "text-red-600"
                          }`}
                        >
                          {s.coverage_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    {/* Secondary metric: manifest-capture ratio (of attempted shards only) */}
                    {s.completion_pct_shards_weighted != null && (
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] text-[var(--color-text-muted)]"
                          title="coverage (of could-exist) — shards-weighted UAC universe denominator (canonical operator metric)"
                        >
                          of could-exist
                        </span>
                        <span
                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                          title="manifest-capture ratio: of attempted shards only"
                          data-testid="coverage-manifest-capture"
                        >
                          {s.coverage_pct.toFixed(1)}% of attempted
                        </span>
                      </div>
                    )}
                    <CoverageBar
                      captured={s.captured}
                      empty_confirmed={s.empty_confirmed}
                      attempted_failed={s.attempted_failed}
                      expected_unattempted_known_empty={s.expected_unattempted_known_empty}
                      expected_unattempted_pending_fetch={s.expected_unattempted_pending_fetch}
                      out_of_window={s.out_of_window}
                      total={s.total}
                    />
                    <div className="text-[10px] text-[var(--color-text-muted)]">{s.total.toLocaleString()} shards</div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-[var(--color-text-muted)]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
                captured
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-teal-400" />
                empty_confirmed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-sky-300" />
                exp_unattempted_known_empty
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-red-500" />
                attempted_failed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-[var(--color-bg-tertiary)]" />
                exp_unattempted_pending_fetch
              </span>
              <span
                className="flex items-center gap-1"
                title="pre-genesis / delisted / deprecated — never collectable, excluded from denominator"
              >
                <span className="inline-block w-2 h-2 rounded-sm bg-slate-300 opacity-40" />
                outside window — not a gap
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
