import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UpcomingFixture } from "../api/client";
import { fetchUpcomingFixtures } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function localDayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayHeading(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatKickoffLocal(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupFixtures(rows: UpcomingFixture[]) {
  const byDay = new Map<string, UpcomingFixture[]>();
  for (const f of rows) {
    const k = localDayKey(f.kickoff_utc);
    const list = byDay.get(k) ?? [];
    list.push(f);
    byDay.set(k, list);
  }
  const days = [...byDay.keys()].sort();
  return days.map((day) => {
    const list = byDay.get(day) ?? [];
    const byLeague = new Map<string, UpcomingFixture[]>();
    for (const fx of list) {
      const lk = fx.league_id || "—";
      const g = byLeague.get(lk) ?? [];
      g.push(fx);
      byLeague.set(lk, g);
    }
    const leagues = [...byLeague.keys()].sort();
    return { day, leagues: leagues.map((lid) => ({ league_id: lid, fixtures: (byLeague.get(lid) ?? []).sort((a, b) => a.kickoff_utc.localeCompare(b.kickoff_utc)) })) };
  });
}

export function UpcomingFixtures() {
  const [days, setDays] = useState(7);
  const [leagueId, setLeagueId] = useState("");
  const [rows, setRows] = useState<UpcomingFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUpcomingFixtures({
        days,
        league_id: leagueId.trim() || undefined,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load fixtures");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, leagueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => groupFixtures(rows), [rows]);

  return (
    <Card data-testid="upcoming-fixtures-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Upcoming fixtures</CardTitle>
              <CardDescription className="text-xs">
                Next days from sports_reference rolling window (API-Football schedule parquets).
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-testid="upcoming-fixtures-refresh"
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
            <Label htmlFor="uf-days" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Days forward
            </Label>
            <Input
              id="uf-days"
              type="number"
              min={1}
              max={31}
              className="h-8 w-24 text-xs font-mono"
              value={days}
              onChange={(ev) => setDays(Math.max(1, Math.min(31, Number(ev.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1 min-w-[12rem] flex-1">
            <Label htmlFor="uf-league" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              League id (optional)
            </Label>
            <Input
              id="uf-league"
              className="h-8 text-xs font-mono"
              placeholder="e.g. EPL"
              value={leagueId}
              onChange={(ev) => setLeagueId(ev.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="upcoming-fixtures-error">
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fixtures…
          </div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="upcoming-fixtures-empty">
            No fixtures in range (or parquets not yet written for future dates).
          </p>
        ) : (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {grouped.map(({ day, leagues }) => {
              const sampleIso = leagues[0]?.fixtures[0]?.kickoff_utc ?? `${day}T12:00:00Z`;
              return (
                <details key={day} className="group/day rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] open:bg-[var(--color-bg-tertiary)]" open>
                  <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                      {formatDayHeading(sampleIso)}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {day}
                    </Badge>
                  </summary>
                  <div className="px-3 pb-3 space-y-2 border-t border-[var(--color-border-subtle)]">
                    {leagues.map(({ league_id: lid, fixtures: fxs }) => (
                      <div key={lid} className="pt-2 space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] font-medium">
                          {lid}
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {fxs.map((fx) => (
                            <div
                              key={`${fx.fixture_id}-${fx.kickoff_utc}`}
                              className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-xs"
                              data-testid={`fixture-card-${fx.fixture_id}`}
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
                              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate" title={fx.venue_name}>
                                {fx.venue_name || fx.venue_id || "Venue TBD"}
                                {fx.round ? ` · ${fx.round}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
