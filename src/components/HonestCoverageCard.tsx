import { AlertTriangle, BarChart3, Info, Loader2 } from "lucide-react";
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
 *  - `couldExistPct` — the shards-weighted could-exist ratio
 *    (`completion_pct_shards_weighted`, captured / full UAC-declared universe)
 *    when the payload carries it, else `null` (the real cron payload doesn't
 *    emit it — the row is hidden rather than shown as a fake 0). This is the
 *    operator-chosen canonical metric surfaced elsewhere (e.g. the turbo
 *    /manifest drilldown), typically much lower than `manifestCapturePct`
 *    since it counts the never-fetched pending universe too.
 *  - `outOfWindow` — pre-genesis/delisted/deprecated cells, excluded from
 *    every ratio above; defaults to 0 when absent.
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
  const couldExistPct = s.completion_pct_shards_weighted ?? null;
  const outOfWindow = s.out_of_window ?? 0;
  // Honest-Coverage v2 layered-coverage gate (codex/02-data/honest-coverage-model.md
  // "When is Layer-2 coverage trustworthy?"): `instrument_gates_download === true`
  // means Layer-1 (the instrument-denominator audit) is NOT yet 100% for this AG, so
  // every Layer-2 figure above (manifestCapturePct/capturedPct/couldExistPct) is only
  // a LOWER BOUND, not authoritative, until Layer-1 closes. `layer1CompletenessPct` is
  // hidden (not faked as 0) when the payload is v1 and doesn't carry it.
  const layer1CompletenessPct = s.layer1_completeness_pct ?? null;
  const layer2Gated = s.instrument_gates_download ?? false;
  // GCS storage size (TB), split per-service — additive v2 fields (originally
  // shipped 2026-08-14 as one combined `storage_bytes_tb`, split same-day into
  // independent IS/MTDS fields). Older coverage.json payloads, and either
  // bucket's own Cloud Monitoring call failing independently of the other,
  // omit the field entirely, so each is hidden rather than faked as
  // 0/"undefined TB" (same pattern as couldExistPct/layer1CompletenessPct).
  const storageBytesTbIs = s.storage_bytes_tb_is ?? null;
  const storageBytesTbMtds = s.storage_bytes_tb_mtds ?? null;
  return {
    knownEmpty,
    pendingFetch,
    manifestCapturePct,
    capturedPct,
    couldExistPct,
    outOfWindow,
    layer1CompletenessPct,
    layer2Gated,
    storageBytesTbIs,
    storageBytesTbMtds,
  };
}

/** Format a GCS storage-size figure (already in TB, 1e12 bytes) to 2-3
 * significant figures for compact tile display — "0.43 TB", "12.7 TB",
 * "156 TB". Matches the measured examples in
 * honest_coverage_storage_size_stat_2026_08_14.md. */
function formatStorageTb(tb: number): string {
  const digits = tb < 10 ? 2 : tb < 100 ? 1 : 0;
  return `${tb.toFixed(digits)} TB`;
}

/** Whole days between the coverage file's own `date` (YYYY-MM-DD, UTC) and today
 * (UTC). 0 = current. Flags a stale card when the daily cron missed and the endpoint
 * served an older file via its 14-day fallback. */
function daysStale(coverageDate: string): number {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const [y, m, d] = coverageDate.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.max(0, Math.round((todayUtc - Date.UTC(y, m - 1, d)) / 86_400_000));
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
  const stale = data?.date ? daysStale(data.date) : 0;

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
          {data?.date && (
            <span
              className={`text-[10px] ml-auto ${stale >= 1 ? "text-amber-600" : "text-[var(--color-text-muted)]"}`}
              title={stale >= 1 ? `Stale — measurement is ${stale} day${stale === 1 ? "" : "s"} old` : undefined}
            >
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
            Coverage data not yet computed for{date ? ` ${date}` : " this date"}.
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : data?.by_asset_group ? (
          <div className="space-y-2">
            {data.partial ? (
              <div
                className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600"
                data-testid="honest-coverage-partial-banner"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Coverage incomplete — {data.asset_groups_failed?.length ?? 0} asset group
                  {(data.asset_groups_failed?.length ?? 0) === 1 ? "" : "s"} failed to load
                  {data.asset_groups_failed?.length ? `: ${data.asset_groups_failed.join(", ")}` : ""}. Showing{" "}
                  {Object.keys(data.by_asset_group).length} of{" "}
                  {data.asset_groups_requested?.length ?? Object.keys(data.by_asset_group).length}.
                </span>
              </div>
            ) : stale >= 1 ? (
              <div
                className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600"
                data-testid="honest-coverage-stale-banner"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Showing coverage as of {data.date} ({stale} day{stale === 1 ? "" : "s"} old) — today&apos;s daily
                  measurement isn&apos;t available yet.
                </span>
              </div>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {AG_ORDER.filter((ag) => ag in data.by_asset_group).map((ag) => {
                const s = data.by_asset_group[ag];
                const {
                  knownEmpty,
                  pendingFetch,
                  manifestCapturePct,
                  capturedPct,
                  couldExistPct,
                  outOfWindow,
                  layer1CompletenessPct,
                  layer2Gated,
                  storageBytesTbIs,
                  storageBytesTbMtds,
                } = deriveCoverage(s);
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
                          `coverage_pct`. Honest-Coverage v2: when Layer-1 (the
                          instrument-denominator audit) is not yet 100% for this AG
                          (`layer2Gated`), this figure is only a LOWER BOUND — rendered
                          in the amber warning tone regardless of its numeric value,
                          matching the codex SSOT's "surfaced with a ⚠ DENOMINATOR
                          INCOMPLETE annotation" rule. */}
                      <span
                        className={`text-xs font-mono font-bold ${
                          layer2Gated
                            ? "text-amber-500"
                            : manifestCapturePct >= 99
                              ? "text-emerald-600"
                              : manifestCapturePct >= 95
                                ? "text-yellow-600"
                                : "text-red-600"
                        }`}
                        title={
                          layer2Gated
                            ? "coverage (of attempted) — LOWER BOUND: Layer-1 instrument-denominator audit is not yet 100% complete for this asset_group, so Layer-2 download coverage is gated and may under-report the real figure."
                            : "coverage (of attempted) — (captured + empty_confirmed + known_empty) / (that + attempted_failed). Matches the TURBO 'Data Coverage' widget."
                        }
                        data-testid="coverage-manifest-capture"
                        data-layer2-gated={layer2Gated ? "true" : undefined}
                      >
                        {manifestCapturePct.toFixed(1)}%
                      </span>
                    </div>
                    {layer2Gated && (
                      <div
                        className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-500"
                        title="Layer-1 (instrument-denominator audit) is incomplete for this asset_group — every Layer-2 figure above is a lower bound, not the authoritative coverage number."
                        data-testid="coverage-denominator-incomplete-badge"
                      >
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                        DENOMINATOR INCOMPLETE
                      </div>
                    )}
                    {/* Layer-1 completeness — the instrument-denominator audit fraction
                        that GATES the Layer-2 figures above (Honest-Coverage v2). Hidden
                        (not faked as 0) when the payload is v1 and doesn't carry it. */}
                    {layer1CompletenessPct !== null && (
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] text-[var(--color-text-muted)]"
                          title="Layer-1 completeness — |EXPECTED ∩ ENUMERATED| / |EXPECTED| for this asset_group's instrument denominator. Layer-2 download coverage is only trustworthy once this reaches 100%."
                        >
                          layer-1 (denominator)
                        </span>
                        <span
                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                          title="layer1_completeness_pct"
                          data-testid="coverage-layer1-completeness"
                        >
                          {layer1CompletenessPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
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
                    {/* Third distinct value: shards-weighted could-exist ratio — the
                        operator-chosen canonical metric surfaced elsewhere (e.g. the
                        turbo /manifest drilldown). Typically much lower than the "of
                        attempted" pair above since it counts the never-fetched pending
                        universe too — shown separately, clearly labelled, so the two
                        surfaces don't read as contradictory. Hidden (not faked as 0)
                        when the payload doesn't carry the field. */}
                    {couldExistPct !== null && (
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] text-[var(--color-text-muted)]"
                          title="Shards-weighted could-exist ratio — captured / full UAC-declared universe (shards_expected). The operator-chosen canonical metric elsewhere in the UI (e.g. the turbo /manifest drilldown); counts the never-fetched pending universe, so it reads lower than 'of attempted' above."
                        >
                          of could-exist
                        </span>
                        <span
                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                          title="completion_pct_shards_weighted"
                          data-testid="coverage-could-exist"
                        >
                          {couldExistPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {/* Third/fourth distinct value: out_of_window as an explicit
                        labelled count, not just a bar segment/tooltip — pre-genesis /
                        delisted / deprecated cells, never collectable, excluded from
                        every ratio above. */}
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px] text-[var(--color-text-muted)]"
                        title="pre-genesis / delisted / deprecated — never collectable, excluded from every ratio above (not a gap)"
                      >
                        out of window
                      </span>
                      <span
                        className="text-[10px] text-[var(--color-text-muted)] font-mono"
                        data-testid="coverage-out-of-window"
                      >
                        {outOfWindow.toLocaleString()}
                      </span>
                    </div>
                    {/* GCS storage size (TB), split IS/MTDS — additive Honest-Coverage
                        v2 fields sourced from Cloud Monitoring's storage/total_bytes
                        metric (soft-deleted objects already excluded). Originally one
                        combined tile, split same-day into two independent rows so each
                        service's footprint is visible. Each row is hidden (not faked as
                        "0 TB"/"undefined TB") when its own field is absent — one
                        service's Cloud Monitoring call can fail while the other
                        succeeds. */}
                    {storageBytesTbIs !== null && (
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] text-[var(--color-text-muted)]"
                          title="GCS storage size of this asset_group's instruments-store (IS) bucket (storage.googleapis.com/storage/total_bytes, soft-deleted objects excluded)"
                        >
                          IS storage
                        </span>
                        <span
                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                          title="storage_bytes_tb_is"
                          data-testid="coverage-storage-tb-is"
                        >
                          {formatStorageTb(storageBytesTbIs)}
                        </span>
                      </div>
                    )}
                    {storageBytesTbMtds !== null && (
                      <div className="flex items-center justify-between">
                        <span
                          className="text-[10px] text-[var(--color-text-muted)]"
                          title="GCS storage size of this asset_group's market-data-tick (MTDS) bucket (storage.googleapis.com/storage/total_bytes, soft-deleted objects excluded)"
                        >
                          MTDS storage
                        </span>
                        <span
                          className="text-[10px] text-[var(--color-text-muted)] font-mono"
                          title="storage_bytes_tb_mtds"
                          data-testid="coverage-storage-tb-mtds"
                        >
                          {formatStorageTb(storageBytesTbMtds)}
                        </span>
                      </div>
                    )}
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
