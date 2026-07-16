import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PredictionCatalogueCard } from "./PredictionCatalogue";
import * as api from "../api/client";
import type { PredictionCatalogueRow } from "../api/client";

const CRYPTO_ROW: PredictionCatalogueRow = {
  instrument_id: "POLYMARKET-BITCOIN-UP-OR-DOWN-JUNE-24-2026",
  instrument_type: "PREDICTION_MARKET",
  venue: "POLYMARKET",
  label: "bitcoin-up-or-down-june-24-2026",
  canonical_question_group: "crypto-price-prediction",
  category: "crypto",
  underlying: "BTC",
  available_from: "2026-06-01",
  available_to: "2026-06-24",
  mvp: true,
};

const POLITICS_ROW: PredictionCatalogueRow = {
  instrument_id: "POLYMARKET-2026-MIDTERM-SENATE-CONTROL",
  instrument_type: "PREDICTION_MARKET",
  venue: "POLYMARKET",
  label: "2026-midterm-senate-control",
  canonical_question_group: "election-outcome",
  category: "politics",
  underlying: "US_SENATE",
  available_from: "2026-01-01",
  available_to: "2026-11-03",
  mvp: true,
};

function mockResult(rows: PredictionCatalogueRow[], total = rows.length): api.PredictionCatalogueResult {
  return {
    rows,
    total,
    category_counts: { crypto: 1, politics: 1 },
    cqg_counts: { "crypto-price-prediction": 1, "election-outcome": 1 },
  };
}

describe("PredictionCatalogueCard", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchPredictionCatalogue").mockResolvedValue(mockResult([CRYPTO_ROW, POLITICS_ROW]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows from the API on initial load", async () => {
    render(<PredictionCatalogueCard />);
    await waitFor(() => {
      expect(screen.getByTestId(`prediction-catalogue-row-${CRYPTO_ROW.instrument_id}`)).toBeTruthy();
    });
    expect(screen.getByText(CRYPTO_ROW.label)).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined, canonical_question_group: undefined, limit: 25, offset: 0 }),
    );
  });

  it("shows an empty state when no rows are returned", async () => {
    fetchSpy.mockResolvedValue(mockResult([], 0));
    render(<PredictionCatalogueCard />);
    await waitFor(() => {
      expect(screen.getByTestId("prediction-catalogue-empty")).toBeTruthy();
    });
  });

  it("changing the category select narrows the list via a new fetch call", async () => {
    render(<PredictionCatalogueCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    fetchSpy.mockResolvedValue(mockResult([CRYPTO_ROW]));
    fireEvent.change(screen.getByTestId("prediction-catalogue-category-select"), { target: { value: "crypto" } });

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ category: "crypto", offset: 0 })),
    );
  });

  it("typing in the search box triggers a debounced refetch with the search term", async () => {
    render(<PredictionCatalogueCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId("prediction-catalogue-search"), { target: { value: "bitcoin" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: "bitcoin" })));
  });

  it("pagination: Next requests the next offset, Prev is disabled on the first page", async () => {
    fetchSpy.mockResolvedValue(mockResult([CRYPTO_ROW, POLITICS_ROW], 50));
    render(<PredictionCatalogueCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("prediction-catalogue-prev")).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByTestId("prediction-catalogue-next"));

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
  });

  it("refresh button re-invokes the API", async () => {
    render(<PredictionCatalogueCard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("prediction-catalogue-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });
});
