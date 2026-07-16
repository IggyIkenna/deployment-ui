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
