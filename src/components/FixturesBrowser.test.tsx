import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FixturesBrowser } from "./FixturesBrowser";
import * as api from "../api/client";

describe("FixturesBrowser", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchFixturesBrowse").mockResolvedValue({
      leagues: {
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
      },
      leagueNames: { EPL: "English Premier League", MLS: "Major League Soccer" },
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
    fetchSpy.mockResolvedValue({ leagues: {}, leagueNames: {} });
    render(<FixturesBrowser />);
    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-empty")).toBeTruthy();
    });
  });

  it("renders the human league name (UAC) with the raw id as a subtitle", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(screen.getByTestId("fixtures-browser-league-EPL")).toBeTruthy());
    // The group header shows the display_name, not the raw id…
    expect(screen.getByTestId("fixtures-browser-league-name-EPL").textContent).toBe("English Premier League");
    // …and the raw id stays visible as a muted subtitle for discoverability.
    const eplGroup = screen.getByTestId("fixtures-browser-league-EPL");
    expect(eplGroup.textContent).toContain("EPL");
  });

  it("falls back to the raw league id when no human name resolved (honest-absence)", async () => {
    fetchSpy.mockResolvedValue({
      leagues: { "999999": { "2026-04-21": [] } },
      leagueNames: {}, // id not in the registry -> absent -> UI shows the raw id
    });
    render(<FixturesBrowser />);
    await waitFor(() => expect(screen.getByTestId("fixtures-browser-league-name-999999")).toBeTruthy());
    expect(screen.getByTestId("fixtures-browser-league-name-999999").textContent).toBe("999999");
  });

  it("league filter placeholder hints at a human name, not only a raw id (F9)", () => {
    render(<FixturesBrowser />);
    const input = screen.getByLabelText(/League id/i) as HTMLInputElement;
    expect(input.placeholder).toMatch(/Allsvenskan/);
  });

  it("refresh button re-invokes the API with the current window", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("fixtures-browser-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });

  it("opens on the default window expressed as ABSOLUTE dates (today-7 .. today+30)", async () => {
    // The old UI could only send days_back/days_forward, which can never reach
    // further than 60 days from today — absolute dates are what make an
    // arbitrary historical date searchable at all.
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const args = fetchSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(args.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.league_id).toBeUndefined();
    expect(args.team).toBeUndefined();
    const spanDays =
      (Date.parse(`${String(args.end_date)}T00:00:00Z`) - Date.parse(`${String(args.start_date)}T00:00:00Z`)) /
      86_400_000;
    expect(spanDays).toBe(37);
  });

  it("changing the league filter triggers a refetch with the new value", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/League id/i), { target: { value: "EPL" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ league_id: "EPL" })));
  });

  it("changing the team filter triggers a refetch with the team value", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("fixtures-browser-team"), { target: { value: "Arsenal" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ team: "Arsenal" })));
  });

  it("picking an arbitrary historical date range refetches with those absolute dates", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/From date/i), { target: { value: "2024-08-01" } });
    fireEvent.change(screen.getByLabelText(/To date/i), { target: { value: "2024-08-31" } });

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ start_date: "2024-08-01", end_date: "2024-08-31" }),
      ),
    );
  });

  it("combines date + league + team into one query", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/From date/i), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByLabelText(/To date/i), { target: { value: "2025-01-31" } });
    fireEvent.change(screen.getByLabelText(/League id/i), { target: { value: "EPL" } });
    fireEvent.change(screen.getByTestId("fixtures-browser-team"), { target: { value: "Arsenal" } });

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith({
        start_date: "2025-01-01",
        end_date: "2025-01-31",
        league_id: "EPL",
        team: "Arsenal",
      }),
    );
  });

  it("warns when the chosen range exceeds the server-side span cap", async () => {
    render(<FixturesBrowser />);
    await waitFor(() => expect(screen.getByTestId("fixtures-browser-window-note")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/From date/i), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText(/To date/i), { target: { value: "2026-01-01" } });

    await waitFor(() => {
      expect(screen.getByTestId("fixtures-browser-window-note").textContent).toMatch(/reads only the first 120/);
    });
  });
});
