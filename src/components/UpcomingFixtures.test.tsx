import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UpcomingFixtures } from "./UpcomingFixtures";
import * as api from "../api/client";

describe("UpcomingFixtures", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchUpcomingFixtures").mockResolvedValue({
      fixtures: [
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
      leagueNames: { EPL: "English Premier League" },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fixture cards from API", async () => {
    render(<UpcomingFixtures />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-card-fx-1")).toBeTruthy();
    });
    expect(screen.getByText(/Arsenal/)).toBeTruthy();
    expect(screen.getByText(/Chelsea/)).toBeTruthy();
  });

  it("refetch button calls API again", async () => {
    render(<UpcomingFixtures />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("upcoming-fixtures-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });

  describe("league names (F9, 2026-07-18)", () => {
    it("renders the human league name with the raw id as a subtitle", async () => {
      render(<UpcomingFixtures />);
      await waitFor(() => expect(screen.getByTestId("upcoming-fixtures-league-name-EPL")).toBeTruthy());
      const header = screen.getByTestId("upcoming-fixtures-league-name-EPL");
      expect(header.textContent).toContain("English Premier League");
      // Raw id stays visible as a muted subtitle once a name resolved.
      expect(header.textContent).toContain("EPL");
    });

    it("falls back to the raw league id when no human name resolved (honest-absence)", async () => {
      fetchSpy.mockResolvedValue({
        fixtures: [
          {
            fixture_id: "fx-2",
            kickoff_utc: "2026-04-21T15:30:00.000Z",
            league_id: "999999",
            home_team_id: "t1",
            away_team_id: "t2",
            home_team_name: "Home",
            away_team_name: "Away",
            venue_id: "v1",
            venue_name: "Venue",
            status: "NS",
            round: "R1",
          },
        ],
        leagueNames: {}, // id not in the registry -> absent -> UI shows the raw id
      });
      render(<UpcomingFixtures />);
      await waitFor(() => expect(screen.getByTestId("upcoming-fixtures-league-name-999999")).toBeTruthy());
      expect(screen.getByTestId("upcoming-fixtures-league-name-999999").textContent).toBe("999999");
    });
  });

  it("league filter placeholder hints at a human name, not only a raw id", () => {
    render(<UpcomingFixtures />);
    const input = screen.getByLabelText(/League id/i) as HTMLInputElement;
    expect(input.placeholder).toMatch(/Allsvenskan/);
  });
});
