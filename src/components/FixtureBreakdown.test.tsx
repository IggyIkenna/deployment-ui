import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FixtureBreakdown } from "./FixtureBreakdown";
import * as api from "../api/client";

describe("FixtureBreakdown", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchFixtureBreakdown").mockResolvedValue({
      day: "2024-09-15",
      league_id: "EPL",
      af_league_id: 39,
      fixtures_expected: 2,
      status: "resolved",
      fixtures: [
        {
          fixture_id: "fx-1",
          kickoff_utc: "2024-09-15T14:00:00Z",
          home_team_name: "Arsenal",
          away_team_name: "Liverpool",
          status: "FT",
          venue_id: "v-1",
          coverage: {
            FIXTURES: "captured",
            FIXTURE_STATS: "captured",
            FIXTURE_LINEUPS: "captured",
            FIXTURE_EVENTS: "captured",
            PLAYER_STATS: "captured",
            INJURIES: "empty_confirmed",
            XG: "captured",
            WEATHER: "captured",
          },
          coverage_summary: { captured: 7, empty_confirmed: 1, missing: 0, failed: 0 },
        },
        {
          fixture_id: "fx-2",
          kickoff_utc: "2024-09-15T16:30:00Z",
          home_team_name: "Chelsea",
          away_team_name: "Man City",
          status: "FT",
          venue_id: "v-2",
          coverage: {
            FIXTURES: "captured",
            FIXTURE_STATS: "captured",
            FIXTURE_LINEUPS: "captured",
            FIXTURE_EVENTS: "captured",
            PLAYER_STATS: "captured",
            INJURIES: "empty_confirmed",
            XG: "missing",
            WEATHER: "attempted_failed",
          },
          coverage_summary: { captured: 5, empty_confirmed: 1, missing: 1, failed: 1 },
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders fixture rows with coverage pills and download links", async () => {
    render(<FixtureBreakdown day="2024-09-15" league_id="EPL" />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-row-fx-1")).toBeTruthy();
      expect(screen.getByTestId("fixture-row-fx-2")).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith({ day: "2024-09-15", league_id: "EPL" });
    // per-entity coverage pills rendered
    expect(screen.getByTestId("coverage-fx-1-FIXTURES")).toBeTruthy();
    expect(screen.getByTestId("coverage-fx-2-XG")).toBeTruthy();
    // download affordances present when not readOnly
    const csv = screen.getByTestId("fixture-download-csv-fx-1") as HTMLAnchorElement;
    expect(csv.href).toContain("fixture_id=fx-1");
    expect(csv.href).toContain("format=csv");
    expect(csv.href).toContain("day=2024-09-15");
  });

  it("hides download affordances in readOnly mode", async () => {
    render(<FixtureBreakdown day="2024-09-15" league_id="EPL" readOnly />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-row-fx-1")).toBeTruthy();
    });
    expect(screen.queryByTestId("fixture-download-csv-fx-1")).toBeNull();
    expect(screen.queryByTestId("fixture-download-json-fx-1")).toBeNull();
  });

  it("renders no-schedule sentinel when server returns no_schedule", async () => {
    fetchSpy.mockResolvedValue({
      day: "2024-09-15",
      league_id: "EPL",
      af_league_id: null,
      fixtures_expected: 0,
      status: "no_schedule",
      fixtures: [],
    });
    render(<FixtureBreakdown day="2024-09-15" league_id="EPL" />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-breakdown-no-schedule")).toBeTruthy();
    });
  });

  it("renders error state when the API call fails", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    render(<FixtureBreakdown day="2024-09-15" league_id="EPL" />);
    await waitFor(() => {
      expect(screen.getByTestId("fixture-breakdown-error")).toBeTruthy();
    });
  });
});
