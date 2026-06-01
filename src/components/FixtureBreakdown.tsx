/**
 * Per-fixture coverage drilldown for SPORTS (day, league_id).
 *
 * Surfaces the fixture leaf one level below the existing per-league date
 * badges in DataStatusTab. Shows each fixture's per-entity coverage + wires
 * a CSV / JSON download link per fixture. Red days without a master schedule
 * render "no schedule recorded" rather than failing.
 */

import { useEffect, useState } from "react";
import {
  buildFixtureDownloadUrl,
  fetchFixtureBreakdown,
  type FixtureBreakdownEntry,
  type FixtureBreakdownResponse,
  type FixtureCoverageStatus,
} from "../api/client";

interface FixtureBreakdownProps {
  day: string;
  league_id: string;
  /**
   * When true (red date click), suppress the per-fixture download buttons —
   * there's nothing to download. Breakdown still renders so the operator can
   * see what was expected vs captured.
   */
  readOnly?: boolean;
}

function coverageColor(status: FixtureCoverageStatus): string {
  switch (status) {
    case "captured":
      return "var(--color-accent-green)";
    case "empty_confirmed":
      return "var(--color-text-muted)";
    case "missing":
      return "var(--color-accent-red)";
    case "attempted_failed":
      return "var(--color-accent-red)";
  }
}

type FixtureRollup = "green" | "amber" | "red";

function rollupStatus(entry: FixtureBreakdownEntry): FixtureRollup {
  const { captured, empty_confirmed, missing, failed } = entry.coverage_summary;
  const covered = captured + empty_confirmed;
  const uncovered = missing + failed;
  if (uncovered === 0) return "green";
  if (covered === 0) return "red";
  return "amber";
}

function rollupColor(r: FixtureRollup): string {
  if (r === "green") return "var(--color-accent-green)";
  if (r === "red") return "var(--color-accent-red)";
  return "var(--color-accent-amber)";
}

function rollupSummary(entry: FixtureBreakdownEntry): string {
  const { captured, empty_confirmed, missing, failed } = entry.coverage_summary;
  const total = captured + empty_confirmed + missing + failed;
  return `rollup · ${captured}/${total} captured · ${empty_confirmed} empty · ${missing} missing · ${failed} failed`;
}

interface HoveredDot {
  fixtureId: string;
  label: string;
}

export function FixtureBreakdown({
  day,
  league_id,
  readOnly = false,
}: FixtureBreakdownProps) {
  const [data, setData] = useState<FixtureBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredDot | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchFixtureBreakdown({ day, league_id })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [day, league_id]);

  if (loading) {
    return (
      <div
        data-testid="fixture-breakdown-loading"
        className="ml-5 pl-2 text-[8px] text-[var(--color-text-muted)] italic py-1"
      >
        Loading fixtures for {league_id} on {day}…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="fixture-breakdown-error"
        className="ml-5 pl-2 text-[8px] text-[var(--color-accent-red)] py-1"
      >
        Breakdown failed: {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.status === "no_schedule") {
    return (
      <div
        data-testid="fixture-breakdown-no-schedule"
        className="ml-5 pl-2 text-[8px] text-[var(--color-text-muted)] italic py-1"
      >
        No schedule recorded for {league_id} on {day} — master fixtures parquet
        absent.
      </div>
    );
  }

  if (data.fixtures.length === 0) {
    return (
      <div
        data-testid="fixture-breakdown-empty"
        className="ml-5 pl-2 text-[8px] text-[var(--color-text-muted)] italic py-1"
      >
        Schedule loaded but no fixtures match league {league_id} on {day}.
      </div>
    );
  }

  return (
    <div
      data-testid="fixture-breakdown"
      className="ml-5 pl-2 border-l border-[var(--color-border-subtle)] py-1 space-y-0.5"
    >
      {data.fixtures.map((fx) => {
        const rollup = rollupStatus(fx);
        const showHover = hovered?.fixtureId === fx.fixture_id;
        return (
          <div
            key={fx.fixture_id}
            data-testid={`fixture-row-${fx.fixture_id}`}
            className="relative flex items-center gap-2 text-[9px] font-mono"
          >
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0 cursor-help"
              style={{ backgroundColor: rollupColor(rollup) }}
              aria-label={`fixture rollup ${rollup}`}
              title={rollupSummary(fx)}
              onMouseEnter={() =>
                setHovered({
                  fixtureId: fx.fixture_id,
                  label: rollupSummary(fx),
                })
              }
              onMouseLeave={() => setHovered(null)}
              data-testid={`fixture-rollup-${fx.fixture_id}`}
            />
            <span
              className="truncate min-w-0"
              title={`${fx.home_team_name} v ${fx.away_team_name}`}
            >
              {fx.home_team_name || fx.fixture_id} v {fx.away_team_name || ""}
            </span>
            <span className="text-[8px] text-[var(--color-text-muted)] shrink-0">
              {fx.status || "?"}
            </span>
            <div className="flex-1" />
            {showHover && (
              <span
                data-testid={`coverage-hover-${fx.fixture_id}`}
                className="absolute right-0 -top-3 z-10 px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap rounded bg-[var(--color-bg-elevated,#111)] text-[var(--color-text-primary,#fff)] border border-[var(--color-border-subtle)] shadow-md pointer-events-none"
              >
                {hovered?.label}
              </span>
            )}
            <div className="flex gap-0.5 shrink-0">
              {Object.entries(fx.coverage).map(([entity, status]) => (
                <span
                  key={entity}
                  title={`${entity}: ${status}`}
                  className="inline-block h-2 w-3 rounded-sm cursor-help hover:ring-1 hover:ring-white/40"
                  style={{ backgroundColor: coverageColor(status) }}
                  data-testid={`coverage-${fx.fixture_id}-${entity}`}
                  onMouseEnter={() =>
                    setHovered({
                      fixtureId: fx.fixture_id,
                      label: `${entity} · ${status}`,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            </div>
            {!readOnly && (
              <>
                <a
                  href={buildFixtureDownloadUrl({
                    fixture_id: fx.fixture_id,
                    day,
                    format: "csv",
                  })}
                  download
                  className="text-[8px] px-1 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:underline shrink-0"
                  title={`Download CSV for ${fx.fixture_id}`}
                  data-testid={`fixture-download-csv-${fx.fixture_id}`}
                >
                  CSV
                </a>
                <a
                  href={buildFixtureDownloadUrl({
                    fixture_id: fx.fixture_id,
                    day,
                    format: "json",
                  })}
                  download
                  className="text-[8px] px-1 rounded bg-[var(--color-status-success-bg)] text-[var(--color-accent-green)] hover:underline shrink-0"
                  title={`Download JSON for ${fx.fixture_id}`}
                  data-testid={`fixture-download-json-${fx.fixture_id}`}
                >
                  JSON
                </a>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
