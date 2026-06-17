import { BarChart3, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { HonestCoverageResponse } from "../api/client";
import { getHonestCoverage } from "../api/client";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const AG_ORDER = ["cefi", "defi", "tradfi", "sports", "prediction"] as const;

/**
 * Accessible, clearly-distinguishable palette for the 6 coverage segments.
 *
 * The previous palette used three near-indistinguishable greens
 * (emerald-500 / teal-400 / sky-300) for captured / empty_confirmed /
 * known_empty plus two low-contrast greys for pending_fetch / outside-window.
 * This palette walks distinct hues (green → cyan → blue → amber → red → slate)
 * so each state is separable by colour alone, with the legend swatches kept in
 * lockstep with the bar. Chosen from Tailwind 500/600 stops for sufficient
 * contrast against the dark card background (no <40% opacity fills).
 */
const SEGMENT_COLORS = {
  captured: "bg-emerald-500",
  empty_confirmed: "bg-cyan-500",
  known_empty: "bg-blue-500",
  attempted_failed: "bg-red-500",
  pending_fetch: "bg-amber-500",
  out_of_window: "bg-slate-500",
} as const;

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
      <div className={SEGMENT_COLORS.captured} style={{ width: pct(captured) }} title={`captured: ${captured}`} />
      <div
        className={SEGMENT_COLORS.empty_confirmed}
        style={{ width: pct(empty_confirmed) }}
        title={`empty_confirmed: ${empty_confirmed}`}
      />
      <div
        className={SEGMENT_COLORS.known_empty}
        style={{ width: pct(expected_unattempted_known_empty) }}
        title={`expected_unattempted_known_empty: ${expected_unattempted_known_empty}`}
      />
      <div
        className={SEGMENT_COLORS.attempted_failed}
        style={{ width: pct(attempted_failed) }}
        title={`attempted_failed: ${attempted_failed}`}
      />
      <div
        className={SEGMENT_COLORS.pending_fetch}
        style={{ width: pct(expected_unattempted_pending_fetch) }}
        title={`expected_unattempted_pending_fetch: ${expected_unattempted_pending_fetch}`}
      />
      {out_of_window > 0 && (
        <div
          className={SEGMENT_COLORS.out_of_window}
          style={{ width: pct(out_of_window) }}
          title={`outside window — not a gap: ${out_of_window}`}
        />
      )}
    </div>
  );
}

/**
 * Derive consistent, well-labelled coverage metrics from the RAW capture-status
 * counts the cron reliably emits — never the precomputed `coverage_pct` (which
 * is captured-only and disagrees with the "Data Coverage" widget).
 *
 * Returns:
 *  - `manifestCapturePct` — "of attempted": (captured + empty_confirmed +
 *    known_empty) / (captured + empty_confirmed + known_empty +
 *    attempted_failed). This is the SAME honest-answer ratio the TURBO "Data
 *    Coverage" widget surfaces (empty_confirmed counts as covered), so the two
 *    headline numbers agree for the same asset_group.
 *  - `capturedPct` — "captured of attempted": captured / attempted-denominator.
 *  - the resolved `knownEmpty` / `pendingFetch` split for the bar (handles the
 *    collapsed `expected_unattempted` the cron emits).
 */
function deriveCoverage(s: HonestCoverageResponse["by_asset_group"][string]) {
  const captured = s.captured;
  const empty = s.empty_confirmed;
  const failed = s.attempted_failed;
  // The cron emits a single collapsed `expected_unattempted`; the older split
  // fields may be present on richer payloads. Prefer the split when given,
  // else treat the whole collapsed bucket as pending_fetch (never-fetched).
  const knownEmpty = s.expected_unattempted_known_empty ?? 0;
  const pendingFetch = s.expected_unattempted_pending_fetch ?? s.expected_unattempted ?? 0;
  // "Of attempted" denominator: everything we have an answer for, plus the
  // failures — EXCLUDES the never-fetched pending universe (the cell type that
  // tanked the old headline to ~11.7%). empty_confirmed is a covered answer.
  const attemptedDenom = captured + empty + knownEmpty + failed;
  const manifestCapturePct = attemptedDenom > 0 ? (100 * (captured + empty + knownEmpty)) / attemptedDenom : 0;
  const capturedPct = attemptedDenom > 0 ? (100 * captured) / attemptedDenom : 0;
  return { knownEmpty, pendingFetch, manifestCapturePct, capturedPct };
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
            title="Headline = manifest-capture ratio (of attempted): (captured + empty_confirmed + known_empty) / (that + attempted_failed). empty_confirmed counts as a covered answer, so this MATCHES the TURBO 'Data Coverage' widget for the same asset_group. The never-fetched pending universe is shown as a bar segment but excluded from the headline denominator (counting it would mislabel a vast 'not yet attempted' set as a gap). out_of_window cells (pre-genesis/delisted) are excluded from both."
          >
            of attempted
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
                const { knownEmpty, pendingFetch, manifestCapturePct, capturedPct } = deriveCoverage(s);
                return (
                  <div
                    key={ag}
                    className="p-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {ag}
                      </Badge>
                      {/* Headline: manifest-capture ratio (of attempted) — the SAME
                          honest-answer metric the TURBO "Data Coverage" widget shows,
                          so the two headlines agree for the same asset_group. Computed
                          from raw counts, never the cron's mislabeled captured-only
                          `coverage_pct`. */}
                      <span
                        className={`text-xs font-mono font-bold ${
                          manifestCapturePct >= 99
                            ? "text-emerald-600"
                            : manifestCapturePct >= 95
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                        title="coverage (of attempted) — (captured + empty_confirmed + known_empty) / (that + attempted_failed). Matches the TURBO 'Data Coverage' widget."
                        data-testid="coverage-manifest-capture"
                      >
                        {manifestCapturePct.toFixed(1)}%
                      </span>
                    </div>
                    {/* Secondary: captured-only ratio (of attempted) — strict "do we
                        actually have the data" (empty_confirmed does NOT count). */}
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px] text-[var(--color-text-muted)]"
                        title="(captured + empty_confirmed + known_empty) / (that + attempted_failed) — empty confirmations count as a covered answer"
                      >
                        of attempted
                      </span>
                      <span
                        className="text-[10px] text-[var(--color-text-muted)] font-mono"
                        title="captured-only ratio (of attempted) — strict 'do we actually have data' (empty_confirmed excluded)"
                        data-testid="coverage-captured"
                      >
                        {capturedPct.toFixed(1)}% captured
                      </span>
                    </div>
                    <CoverageBar
                      captured={s.captured}
                      empty_confirmed={s.empty_confirmed}
                      attempted_failed={s.attempted_failed}
                      expected_unattempted_known_empty={knownEmpty}
                      expected_unattempted_pending_fetch={pendingFetch}
                      out_of_window={s.out_of_window}
                      total={s.total}
                    />
                    <div className="text-[10px] text-[var(--color-text-muted)]">{s.total.toLocaleString()} shards</div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.captured}`} />
                captured
              </span>
              <span className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.empty_confirmed}`} />
                empty_confirmed
              </span>
              <span className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.known_empty}`} />
                exp_unattempted_known_empty
              </span>
              <span className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.attempted_failed}`} />
                attempted_failed
              </span>
              <span className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.pending_fetch}`} />
                exp_unattempted_pending_fetch
              </span>
              <span
                className="flex items-center gap-1"
                title="pre-genesis / delisted / deprecated — never collectable, excluded from denominator"
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${SEGMENT_COLORS.out_of_window}`} />
                outside window — not a gap
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
