import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewListingsCard, UpcomingExpiriesCard } from "./LifecycleCards";
import * as api from "../api/client";

describe("NewListingsCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchNewListings").mockResolvedValue([
      {
        instrument_id: "BINANCE-SPOT-SOLUSDT",
        instrument_type: "SPOT_PAIR",
        asset_group: "cefi",
        venue: "BINANCE-SPOT",
        chain: "",
        base_asset: "SOL",
        raw_symbol: "SOLUSDT",
        available_from: "2026-07-15",
        available_to: "",
        mvp: true,
        available_from_is_venue_first_day: false,
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows from the API and passes the default threshold", async () => {
    render(<NewListingsCard />);
    await waitFor(() => {
      expect(screen.getByTestId("new-listings-row-BINANCE-SPOT-SOLUSDT")).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30 });
  });

  it("shows an empty state when no rows are returned", async () => {
    fetchSpy.mockResolvedValue([]);
    render(<NewListingsCard />);
    await waitFor(() => {
      expect(screen.getByTestId("new-listings-empty")).toBeTruthy();
    });
  });

  // New-listings false-positive guard (plan P2). The catalogue's available_from
  // degrades to "the day the pipeline first saw it" when a venue declares no
  // listing date, so a recently-onboarded venue floods this card. Real prod
  // instance found 2026-07-17: COINBASE-CDE, 99 rows all stamped 2026-07-10.
  it("flags a row whose listing date is its venue's first captured day", async () => {
    fetchSpy.mockResolvedValue([
      {
        instrument_id: "COINBASE-CDE:FUTURE:BTC-USD@LIN-20301220",
        instrument_type: "FUTURE",
        asset_group: "cefi",
        venue: "COINBASE-CDE",
        chain: "",
        base_asset: "BTC",
        raw_symbol: "BTC-20DEC30-CDE",
        available_from: "2026-07-10",
        available_to: "2030-12-20",
        mvp: false,
        available_from_is_venue_first_day: true,
      },
    ]);
    render(<NewListingsCard />);
    const badge = await screen.findByTestId("new-listings-venue-first-day-COINBASE-CDE:FUTURE:BTC-USD@LIN-20301220");
    expect(badge.textContent).toContain("listing date unconfirmed");
    // The row is still SHOWN — provenance is surfaced, not silently excluded.
    expect(screen.getByTestId("new-listings-row-COINBASE-CDE:FUTURE:BTC-USD@LIN-20301220")).toBeTruthy();
  });

  it("does not flag a genuine listing on an established venue", async () => {
    render(<NewListingsCard />);
    await waitFor(() => {
      expect(screen.getByTestId("new-listings-row-BINANCE-SPOT-SOLUSDT")).toBeTruthy();
    });
    expect(screen.queryByTestId("new-listings-venue-first-day-BINANCE-SPOT-SOLUSDT")).toBeNull();
  });

  it("changing the threshold input triggers a refetch with the new value", async () => {
    render(<NewListingsCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30 }));

    fireEvent.change(screen.getByTestId("new-listings-threshold-input"), { target: { value: "90" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 90 }));
  });

  it("refresh button re-invokes the API", async () => {
    render(<NewListingsCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("new-listings-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });
});

describe("UpcomingExpiriesCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchUpcomingExpiries").mockResolvedValue([
      {
        instrument_id: "CME-ESU6",
        instrument_type: "FUTURE",
        asset_group: "tradfi",
        venue: "CME",
        chain: "",
        base_asset: "ES",
        raw_symbol: "ESU6",
        available_from: "2026-06-01",
        available_to: "2026-09-19",
        mvp: true,
        available_from_is_venue_first_day: false,
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows from the API and passes the default threshold", async () => {
    render(<UpcomingExpiriesCard />);
    await waitFor(() => {
      expect(screen.getByTestId("upcoming-expiries-row-CME-ESU6")).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith({ within_days: 7 });
  });

  it("changing the threshold input triggers a refetch with the new value", async () => {
    render(<UpcomingExpiriesCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ within_days: 7 }));

    fireEvent.change(screen.getByTestId("upcoming-expiries-threshold-input"), { target: { value: "30" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ within_days: 30 }));
  });
});
