import { ChevronRight, Loader2, RefreshCw, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FixtureRow, FixturesByLeagueAndDay } from "../api/client";
import { fetchFixturesBrowse } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function formatDayHeading(dayKey: string): string {
  // dayKey is a plain YYYY-MM-DD (UTC calendar day, no time component) — parse
  // as UTC midnight so the weekday doesn't shift under a negative-offset
  // local timezone.
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return dayKey;
  }
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatKickoffLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface LeagueGroup {
  league_id: string;
  fixtureCount: number;
  days: { day: string; fixtures: FixtureRow[] }[];
}

function groupForDisplay(leagues: FixturesByLeagueAndDay): LeagueGroup[] {
  const leagueIds = Object.keys(leagues).sort();
  return leagueIds.map((leagueId) => {
    const byDay = leagues[leagueId] ?? {};
    const days = Object.keys(byDay)
      .sort()
      .map((day) => ({
        day,
        fixtures: [...(byDay[day] ?? [])].sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc)),
      }));
    const fixtureCount = days.reduce((acc, d) => acc + d.fixtures.length, 0);
    return { league_id: leagueId, fixtureCount, days };
  });
}

export function FixturesBrowser() {
  const [daysBack, setDaysBack] = useState(7);
  const [daysForward, setDaysForward] = useState(30);
  const [leagueId, setLeagueId] = useState("");
  const [leagues, setLeagues] = useState<FixturesByLeagueAndDay>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFixturesBrowse({
        days_back: daysBack,
        days_forward: daysForward,
        league_id: leagueId.trim() || undefined,
      });
      setLeagues(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fixtures");
      setLeagues({});
    } finally {
      setLoading(false);
    }
  }, [daysBack, daysForward, leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => groupForDisplay(leagues), [leagues]);
  const totalFixtures = useMemo(() => grouped.reduce((acc, g) => acc + g.fixtureCount, 0), [grouped]);

  return (
    <Card data-testid="fixtures-browser-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Fixtures browser</CardTitle>
              <CardDescription className="text-xs">
                Catalogue fixtures grouped by league then day (windowed — see date range below).
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-testid="fixtures-browser-refresh"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label htmlFor="fb-days-back" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Days back
            </Label>
            <Input
              id="fb-days-back"
              type="number"
              min={0}
              max={60}
              className="h-8 w-24 text-xs font-mono"
              value={daysBack}
              onChange={(ev) => setDaysBack(Math.max(0, Math.min(60, Number(ev.target.value) || 0)))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fb-days-forward" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Days forward
            </Label>
            <Input
              id="fb-days-forward"
              type="number"
              min={0}
              max={60}
              className="h-8 w-24 text-xs font-mono"
              value={daysForward}
              onChange={(ev) => setDaysForward(Math.max(0, Math.min(60, Number(ev.target.value) || 0)))}
            />
          </div>
          <div className="space-y-1 min-w-[12rem] flex-1">
            <Label htmlFor="fb-league" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              League id (optional)
            </Label>
            <Input
              id="fb-league"
              className="h-8 text-xs font-mono"
              placeholder="e.g. EPL"
              value={leagueId}
              onChange={(ev) => setLeagueId(ev.target.value)}
            />
          </div>
        </div>
        {!loading && !error && (
          <p className="text-[10px] text-[var(--color-text-muted)]" data-testid="fixtures-browser-window-note">
            Showing {totalFixtures.toLocaleString()} fixture{totalFixtures === 1 ? "" : "s"} in the last {daysBack} /
            next {daysForward} days (not the full historical catalogue).
          </p>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="fixtures-browser-error">
            {error}
          </div>
        )}
        {loading && grouped.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fixtures…
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="fixtures-browser-empty">
            No fixtures in range (or parquets not yet written for these dates).
          </p>
        ) : (
          <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {grouped.map(({ league_id: lid, fixtureCount, days }) => (
              <details
                key={lid}
                className="group/league rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] open:bg-[var(--color-bg-tertiary)]"
                data-testid={`fixtures-browser-league-${lid}`}
              >
                <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform group-open/league:rotate-90" />
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">{lid}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    {days.length} day{days.length === 1 ? "" : "s"} · {fixtureCount} fixture
                    {fixtureCount === 1 ? "" : "s"}
                  </Badge>
                </summary>
                <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-border-subtle)]">
                  {days.map(({ day, fixtures }) => (
                    <details key={day} className="group/day pt-2" data-testid={`fixtures-browser-day-${lid}-${day}`}>
                      <summary className="cursor-pointer select-none list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-text-muted)] transition-transform group-open/day:rotate-90" />
                        <span className="text-[10px] font-semibold text-[var(--color-text-secondary)]">
                          {formatDayHeading(day)}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {day} · {fixtures.length}
                        </Badge>
                      </summary>
                      <div className="mt-1.5 ml-5 grid gap-1.5 sm:grid-cols-2">
                        {fixtures.map((fx) => (
                          <div
                            key={`${fx.fixture_id}-${fx.kickoff_utc}`}
                            className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-xs"
                            data-testid={`fixtures-browser-fixture-${fx.fixture_id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                {formatKickoffLocal(fx.kickoff_utc)}
                              </span>
                              <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                                {fx.status || "—"}
                              </Badge>
                            </div>
                            <div className="font-medium mt-1">
                              {fx.home_team_name || fx.home_team_id}
                              {" vs "}
                              {fx.away_team_name || fx.away_team_id}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
