import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UpcomingFixtures } from "./UpcomingFixtures";
import * as api from "../api/client";

describe("UpcomingFixtures", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchUpcomingFixtures").mockResolvedValue([
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
    ]);
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
});
