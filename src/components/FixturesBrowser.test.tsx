import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FixturesBrowser } from "./FixturesBrowser";
import * as api from "../api/client";

describe("FixturesBrowser", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchFixturesBrowse").mockResolvedValue({
      EPL: {
        "2026-04-21": [
          {
            fixture_id: "fx-1",
            kickoff_utc: "2026-04-21T15:30:00.000Z",
            league_id: "EPL",
            home_team_id: "t1",
            away_team_id: "t2",
            home_team_name: "Arsenal",
            away_team_name: "Chelsea",
            venue_id: "v1",
            venue_name: "Emirates",
            status: "NS",
            round: "Regular Season - 10",
          },
        ],
        "2026-04-22": [
          {
            fixture_id: "fx-2",
            kickoff_utc: "2026-04-22T12:00:00.000Z",
            league_id: "EPL",
            home_team_id: "t3",
            away_team_id: "t4",
            home_team_name: "Liverpool",
            away_team_name: "Everton",
            venue_id: "v2",
            venue_name: "Anfield",
            status: "NS",
            round: "Regular Season - 11",
          },
        ],
      },
      MLS: {
        "2026-04-21": [
          {
            fixture_id: "fx-3",
            kickoff_utc: "2026-04-21T23:00:00.000Z",
            league_id: "MLS",
            home_team_id: "t5",
            away_team_id: "t6",
            home_team_name: "LAFC",
            away_team_name: "LA Galaxy",
            venue_id: "v3",
            venue_name: "BMO Stadium",
            status: "NS",
            round: "Regular Season",
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one collapsible group per league, collapsed by default", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-league-EPL")).toBeTruthy();
    });
    expect(screen.getByTestId("fixtures-browser-league-MLS")).toBeTruthy();
    // <details> collapses VISUALLY (CSS) but jsdom still mounts its children,
    // so assert on the `open` attribute rather than element presence — same
    // caveat DataStatusTab.tsx documents for its own <details> usage.
    const leagueDetails = screen.getByTestId("fixtures-browser-league-EPL") as HTMLDetailsElement;
    expect(leagueDetails.open).toBe(false);
  });

  it("expanding a league then a day reveals its fixtures", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-league-EPL")).toBeTruthy();
    });

    const leagueDetails = screen.getByTestId("fixtures-browser-league-EPL");
    fireEvent.click(leagueDetails.querySelector("summary")!);

    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-day-EPL-2026-04-21")).toBeTruthy();
    });

    const dayDetails = screen.getByTestId("fixtures-browser-day-EPL-2026-04-21");
    fireEvent.click(dayDetails.querySelector("summary")!);

    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-fixture-fx-1")).toBeTruthy();
    });
    expect(screen.getByText(/Arsenal/)).toBeTruthy();
    expect(screen.getByText(/Chelsea/)).toBeTruthy();
  });

  it("shows an empty state when no fixtures are returned in the window", async () => {
    fetchSpy.mockResolvedValue({});
    render(<FixturesBrowser />);
    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-empty")).toBeTruthy();
    });
  });

  it("refresh button re-invokes the API with the current window", async () => {
    render(<FixturesBrowser />);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith({ days_back: 7, days_forward: 30, league_id: undefined }),
    );
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("fixtures-browser-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });

  it("changing the league filter triggers a refetch with the new value", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/League id/i), { target: { value: "EPL" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ days_back: 7, days_forward: 30, league_id: "EPL" }));
  });
});
