import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewListingsCard, UpcomingExpiriesCard } from "./LifecycleCards";
import * as api from "../api/client";
import type { LifecyclePage } from "../api/client";

const SOL_ROW: LifecyclePage["rows"][number] = {
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
};

function page(rows: LifecyclePage["rows"], overrides: Partial<LifecyclePage> = {}): LifecyclePage {
  return {
    rows,
    total_count: rows.length,
    limit: 25,
    offset: 0,
    has_more: false,
    ...overrides,
  };
}

describe("NewListingsCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchNewListings").mockResolvedValue(page([SOL_ROW]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows from the API and passes the default threshold + page params", async () => {
    render(<NewListingsCard />);
    await waitFor(() => {
      expect(screen.getByTestId("new-listings-row-BINANCE-SPOT-SOLUSDT")).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30, limit: 25, offset: 0 });
  });

  it("shows an empty state when no rows are returned", async () => {
    fetchSpy.mockResolvedValue(page([]));
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
    fetchSpy.mockResolvedValue(
      page([
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
      ]),
    );
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

  it("changing the threshold input triggers a refetch with the new value, reset to the first page", async () => {
    render(<NewListingsCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30, limit: 25, offset: 0 }));

    fireEvent.change(screen.getByTestId("new-listings-threshold-input"), { target: { value: "90" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 90, limit: 25, offset: 0 }));
  });

  it("refresh button re-invokes the API", async () => {
    render(<NewListingsCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("new-listings-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });

  describe("pagination", () => {
    it("shows the total_count range and disables Prev on the first page", async () => {
      fetchSpy.mockResolvedValue(page([SOL_ROW], { total_count: 60, has_more: true }));
      render(<NewListingsCard />);
      await waitFor(() => expect(screen.getByTestId("new-listings-page-info").textContent).toBe("1–1 of 60"));
      expect(screen.getByTestId("new-listings-prev")).toBeDisabled();
      expect(screen.getByTestId("new-listings-next")).not.toBeDisabled();
    });

    it("Next advances the offset by the page size and re-fetches", async () => {
      fetchSpy.mockResolvedValue(page([SOL_ROW], { total_count: 60, has_more: true }));
      render(<NewListingsCard />);
      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30, limit: 25, offset: 0 }));

      fetchSpy.mockResolvedValue(page([SOL_ROW], { total_count: 60, offset: 25, has_more: true }));
      fireEvent.click(screen.getByTestId("new-listings-next"));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ max_age_days: 30, limit: 25, offset: 25 }));
    });

    it("Next is disabled once every row has been paged through", async () => {
      fetchSpy.mockResolvedValue(page([SOL_ROW], { total_count: 1, has_more: false }));
      render(<NewListingsCard />);
      await waitFor(() => expect(screen.getByTestId("new-listings-next")).toBeDisabled());
    });
  });
});

describe("UpcomingExpiriesCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const cmeRow: LifecyclePage["rows"][number] = {
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
  };

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchUpcomingExpiries").mockResolvedValue(page([cmeRow]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows from the API and passes the default threshold + page params", async () => {
    render(<UpcomingExpiriesCard />);
    await waitFor(() => {
      expect(screen.getByTestId("upcoming-expiries-row-CME-ESU6")).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledWith({ within_days: 7, limit: 25, offset: 0 });
  });

  it("changing the threshold input triggers a refetch with the new value, reset to the first page", async () => {
    render(<UpcomingExpiriesCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ within_days: 7, limit: 25, offset: 0 }));

    fireEvent.change(screen.getByTestId("upcoming-expiries-threshold-input"), { target: { value: "30" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith({ within_days: 30, limit: 25, offset: 0 }));
  });

  it("shows the total_count range when more rows exist than the page size", async () => {
    fetchSpy.mockResolvedValue(page([cmeRow], { total_count: 40, has_more: true }));
    render(<UpcomingExpiriesCard />);
    await waitFor(() => expect(screen.getByTestId("upcoming-expiries-page-info").textContent).toBe("1–1 of 40"));
    expect(screen.getByTestId("upcoming-expiries-next")).not.toBeDisabled();
  });
});
