import { ChevronDown, ChevronRight, Info, ListChecks, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TurboDataStatusResponse, TurboLeagueStatus, TurboSubDimension } from "../api/client";
import { getDataStatusTurbo } from "../api/client";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

// Honest per-league sports-feature coverage — Phase 8.A of
// features_sports_honest_coverage_2026_05_05.plan.md (see
// unified-trading-pm/plans/active/issues/features_sports_deployment_ui_coverage_tab_and_registry_playbook_2026_07_21.md).
//
// The Phase-3 `sports_honest_coverage()` axis (deployment-api
// `services/data_status/sports_helpers.py`) is already reachable over HTTP
// for the 3 feature-ROLLUP data_types (FIXTURE_FEATURES / ODDS_FEATURES /
// DERIVED_FEATURES) via `GET /api/data-status/turbo?service=features-sports-
// -service` — `_build_sports_entity_entry` calls it for every data_type
// present in `FEATURES_SPORTS_DATA_TYPE_META`, and the honest per-league
// breakdown (`leagues`) already reaches the TS `TurboSubDimension` type.
// Today that data is only visible 5 levels deep inside the generic
// category -> data_type drilldown in DataStatusTab; this card promotes it
// to a dedicated, glanceable surface for the features-sports-service tab.
//
// PER-CALCULATOR (34-calculator, `FEATURES_SPORTS_PER_CALC_META`) coverage
// and the drift-comparator's `DriftEvent` output are NOT yet reachable over
// HTTP — no route wraps `sports_honest_coverage()` per calculator, and
// `coverage_drift.py` has zero route/cron wiring (verified: no caller in
// `deployment_api/routes/` or `deployment_api/main.py`). Rendering those
// here would mean inventing a shape the backend doesn't return, which the
// UI-testing-layers SSOT forbids ("render exactly what the API returns").
// The card says so explicitly instead of a silent gap — the backend
// wiring is tracked as item 3 (INFRA, deployment-api) in the same issue
// doc; the per-calculator HTTP surface is a follow-up beyond this card.
const ROLLUP_LABELS: Record<string, string> = {
  FIXTURE_FEATURES: "Fixture features",
  ODDS_FEATURES: "Odds features",
  DERIVED_FEATURES: "Derived features",
};

const ROLLUP_ORDER = ["FIXTURE_FEATURES", "ODDS_FEATURES", "DERIVED_FEATURES"];

const DEFAULT_LOOKBACK_DAYS = 90;

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS);
  return d.toISOString().split("T")[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function completionPct(entry: TurboSubDimension): number {
  const found = entry.found_shards ?? entry.dates_found ?? 0;
  const expected = entry.expected_shards ?? entry.dates_expected ?? 0;
  if (expected <= 0) return 0;
  return Math.min(100, Math.round((found / expected) * 1000) / 10);
}

function colorForPct(pct: number): string {
  if (pct >= 99) return "text-emerald-600";
  if (pct >= 90) return "text-yellow-600";
  return "text-red-600";
}

function LeagueRow({ leagueId, data }: { leagueId: string; data: TurboLeagueStatus }) {
  const found = data.found_shards ?? data.dates_found ?? 0;
  const expected = data.expected_shards ?? data.dates_expected ?? 0;
  const missing = data.missing_dates ?? [];
  return (
    <div
      className="flex items-center justify-between gap-2 py-1 px-2 text-[11px] border-b border-[var(--color-border)] last:border-b-0"
      data-testid="sports-feature-league-row"
    >
      <span className="font-mono">{leagueId}</span>
      <span className="text-[var(--color-text-muted)]">
        {found}/{expected} {data.unit ?? "fixture_dates"}
        {missing.length > 0 && <span className="text-amber-600 ml-1">({missing.length} missing)</span>}
      </span>
    </div>
  );
}

function RollupCategoryCard({ calcName, entry }: { calcName: string; entry: TurboSubDimension }) {
  const [expanded, setExpanded] = useState(false);
  const pct = completionPct(entry);
  const leagues = entry.leagues ?? {};
  const leagueNames = Object.keys(leagues).sort();
  const missingLeagueCount = leagueNames.filter((l) => (leagues[l].missing_dates?.length ?? 0) > 0).length;

  return (
    <div
      className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
      data-testid={`sports-feature-rollup-${calcName}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-2 text-left"
        data-testid={`sports-feature-rollup-toggle-${calcName}`}
      >
        <span className="flex items-center gap-1.5">
          {leagueNames.length > 0 ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 text-[var(--color-text-muted)]" />
            ) : (
              <ChevronRight className="h-3 w-3 text-[var(--color-text-muted)]" />
            )
          ) : null}
          <span className="text-xs font-medium">{ROLLUP_LABELS[calcName] ?? calcName}</span>
        </span>
        <span className="flex items-center gap-2">
          {missingLeagueCount > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/40">
              {missingLeagueCount} league{missingLeagueCount === 1 ? "" : "s"} with gaps
            </Badge>
          )}
          <span
            className={`text-xs font-mono font-bold ${colorForPct(pct)}`}
            data-testid={`sports-feature-pct-${calcName}`}
          >
            {pct.toFixed(1)}%
          </span>
        </span>
      </button>
      {expanded && leagueNames.length > 0 && (
        <div className="border-t border-[var(--color-border)]">
          {leagueNames.map((lid) => (
            <LeagueRow key={lid} leagueId={lid} data={leagues[lid]} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SportsFeatureCoverageCard() {
  const [data, setData] = useState<TurboDataStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDataStatusTurbo({
      service: "features-sports-service",
      start_date: getDefaultStartDate(),
      end_date: getTodayDate(),
      include_sub_dimensions: true,
    })
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
  }, []);

  // The category key's casing isn't a stable contract from this component's
  // point of view (verified only lowercase "sports" is used by the sibling
  // honest-coverage endpoint) — resolve case-insensitively rather than
  // hardcoding a casing that could silently break the card.
  const sportsCategory = useMemo(() => {
    if (!data?.asset_groups) return null;
    const key = Object.keys(data.asset_groups).find((k) => k.toLowerCase() === "sports");
    return key ? data.asset_groups[key] : null;
  }, [data]);

  const rollups = useMemo(() => {
    const dataTypes = sportsCategory?.data_types;
    if (!dataTypes) return [];
    return ROLLUP_ORDER.filter((name) => name in dataTypes).map((name) => ({ name, entry: dataTypes[name] }));
  }, [sportsCategory]);

  return (
    <Card data-testid="sports-feature-coverage-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          <CardTitle className="text-base">Sports Feature Coverage (Honest)</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            PHASE 3
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading feature coverage…
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : rollups.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)]" data-testid="sports-feature-no-data">
            No feature-rollup coverage in the manifest for this window yet.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1.5">
              {rollups.map(({ name, entry }) => (
                <RollupCategoryCard key={name} calcName={name} entry={entry} />
              ))}
            </div>
            <div
              className="flex items-start gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[11px] text-[var(--color-text-muted)]"
              data-testid="sports-feature-per-calculator-pending"
            >
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Per-calculator breakdown (34 calculators) and the coverage-drift comparator aren&apos;t wired to an API
                route yet — only the 3 feature-rollup categories above are reachable over HTTP today. See{" "}
                <code>features_sports_deployment_ui_coverage_tab_and_registry_playbook_2026_07_21.md</code>.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SportsFeatureCoverageCard;
