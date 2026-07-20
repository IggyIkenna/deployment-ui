import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogueExplorer } from "./CatalogueExplorer";
import * as api from "../api/client";
import type { InstrumentCatalogueRow, InstrumentCatalogueResponse } from "../api/client";

const CAPTURED_ROW: InstrumentCatalogueRow = {
  instrument_id: "BINANCE-SPOT-BTCUSDT",
  name: "",
  venue: "BINANCE-SPOT",
  instrument_type: "SPOT_PAIR",
  data_type: "instruments",
  capture_status: "captured",
  error_reason: "",
  attempted_at: "2026-07-15T00:10:00+00:00",
  is_mvp: true,
};

const FAILED_ROW: InstrumentCatalogueRow = {
  instrument_id: "OKX-DOGEUSDT",
  name: "",
  venue: "OKX-SPOT",
  instrument_type: "SPOT_PAIR",
  data_type: "instruments",
  capture_status: "attempted_failed",
  error_reason: "RATE_LIMIT_HIT",
  attempted_at: "2026-07-13T00:14:00+00:00",
  is_mvp: false,
};

// KRX single-stock equity: opaque 6-digit code as instrument_id + a human-readable
// issuer name — the Deliverable-1 case the Name column exists to render.
const KRX_ROW: InstrumentCatalogueRow = {
  instrument_id: "KRX:EQUITY:005930",
  name: "Samsung Electronics",
  venue: "KRX",
  instrument_type: "EQUITY",
  data_type: "instruments",
  capture_status: "captured",
  error_reason: "",
  attempted_at: "2026-07-15T00:10:00+00:00",
  is_mvp: true,
};

function mockResponse(instruments: InstrumentCatalogueRow[], total = instruments.length): InstrumentCatalogueResponse {
  return {
    service: "instruments-service",
    asset_group: "cefi",
    venue: null,
    instrument_type: null,
    data_type: null,
    label: "captured instruments (availability-derived)",
    instruments,
    total_count: total,
    limit: 25,
    offset: 0,
    has_more: false,
    search: "",
    mvp_only: false,
  };
}

describe("CatalogueExplorer", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let optionsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(api, "fetchInstrumentCatalogue").mockResolvedValue(mockResponse([CAPTURED_ROW, FAILED_ROW]));
    optionsSpy = vi.spyOn(api, "fetchCatalogueFilterOptions").mockResolvedValue({
      service: "instruments-service",
      asset_group: "cefi",
      venues: ["BINANCE-SPOT", "OKX-SPOT"],
      instrument_types: ["SPOT_PAIR"],
      data_types: ["instruments"],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows + the availability-derived label on initial load", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => {
      expect(screen.getByTestId(`catalogue-explorer-row-${CAPTURED_ROW.instrument_id}`)).toBeTruthy();
    });
    expect(screen.getByTestId("catalogue-explorer-label").textContent).toBe(
      "captured instruments (availability-derived)",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "instruments-service",
        asset_group: "cefi",
        mvp_only: false,
        limit: 25,
        offset: 0,
      }),
    );
  });

  it("shows an empty state when no rows are returned", async () => {
    fetchSpy.mockResolvedValue(mockResponse([], 0));
    render(<CatalogueExplorer />);
    await waitFor(() => {
      expect(screen.getByTestId("catalogue-explorer-empty")).toBeTruthy();
    });
  });

  it("renders the human-readable Name column for an opaque-coded instrument, em-dash when blank", async () => {
    fetchSpy.mockResolvedValue(mockResponse([KRX_ROW, CAPTURED_ROW]));
    render(<CatalogueExplorer />);
    await waitFor(() => expect(screen.getByTestId(`catalogue-explorer-row-${KRX_ROW.instrument_id}`)).toBeTruthy());
    // KRX 6-digit code carries its issuer name next to the coded instrument_id.
    expect(screen.getByTestId(`catalogue-explorer-name-${KRX_ROW.instrument_id}`).textContent).toBe(
      "Samsung Electronics",
    );
    // A row with no display name renders an honest em-dash, not a blank/undefined.
    expect(screen.getByTestId(`catalogue-explorer-name-${CAPTURED_ROW.instrument_id}`).textContent).toBe("—");
  });

  it("renders an MVP badge only for is_mvp rows", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() =>
      expect(screen.getByTestId(`catalogue-explorer-row-${CAPTURED_ROW.instrument_id}`)).toBeTruthy(),
    );
    expect(screen.getByTestId(`catalogue-explorer-mvp-badge-${CAPTURED_ROW.instrument_id}`)).toBeTruthy();
    expect(screen.queryByTestId(`catalogue-explorer-mvp-badge-${FAILED_ROW.instrument_id}`)).toBeNull();
  });

  it("MVP toggle narrows the list via a new fetch call with mvp_only=true", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    fetchSpy.mockResolvedValue(mockResponse([CAPTURED_ROW]));
    fireEvent.click(screen.getByTestId("catalogue-explorer-mvp-toggle"));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ mvp_only: true, offset: 0 })),
    );
  });

  it("typing in the search box triggers a debounced refetch with the search term", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId("catalogue-explorer-search"), { target: { value: "btc" } });

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ search: "btc" })));
  });

  it("pagination: Next requests the next offset, Prev is disabled on the first page", async () => {
    fetchSpy.mockResolvedValue(mockResponse([CAPTURED_ROW, FAILED_ROW], 50));
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    expect(screen.getByTestId("catalogue-explorer-prev")).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByTestId("catalogue-explorer-next"));

    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
  });

  it("the CSV download link always carries the same filters as the on-screen view", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    let href = screen.getByTestId("catalogue-explorer-download-csv").getAttribute("href") ?? "";
    expect(href).toContain("asset_group=cefi");
    expect(href).not.toContain("mvp_only=true");

    fireEvent.click(screen.getByTestId("catalogue-explorer-mvp-toggle"));
    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ mvp_only: true })));

    href = screen.getByTestId("catalogue-explorer-download-csv").getAttribute("href") ?? "";
    expect(href).toContain("mvp_only=true");
  });

  it("refresh button re-invokes the API", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const n = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("catalogue-explorer-refresh"));
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(n));
  });

  // F3 (live UI review round 3): venue/instrument_type/data_type are dropdowns
  // of the real distinct values, not free-text.
  it("populates the venue/type/data_type dropdowns from the distinct-values endpoint", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(optionsSpy).toHaveBeenCalledWith(expect.objectContaining({ asset_group: "cefi" })));
    const venueSelect = screen.getByTestId("catalogue-explorer-venue-select") as HTMLSelectElement;
    await waitFor(() => {
      expect(Array.from(venueSelect.options).map((o) => o.value)).toEqual(["", "BINANCE-SPOT", "OKX-SPOT"]);
    });
    const typeSelect = screen.getByTestId("catalogue-explorer-instrument-type-select") as HTMLSelectElement;
    expect(Array.from(typeSelect.options).map((o) => o.value)).toEqual(["", "SPOT_PAIR"]);
    const dataTypeSelect = screen.getByTestId("catalogue-explorer-data-type-select") as HTMLSelectElement;
    expect(Array.from(dataTypeSelect.options).map((o) => o.value)).toEqual(["", "instruments"]);
  });

  it("selecting a venue refetches the list narrowed to that venue", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId("catalogue-explorer-venue-select"), { target: { value: "OKX-SPOT" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ venue: "OKX-SPOT", offset: 0 })),
    );
  });

  it("an all-blank axis leaves only the 'Any' option (honest-absence, no fabricated value)", async () => {
    optionsSpy.mockResolvedValue({
      service: "instruments-service",
      asset_group: "sports",
      venues: [], // sports venue is 100% blank server-side
      instrument_types: ["FIXTURE"],
      data_types: [],
    });
    render(<CatalogueExplorer />);
    const venueSelect = screen.getByTestId("catalogue-explorer-venue-select") as HTMLSelectElement;
    await waitFor(() => expect(Array.from(venueSelect.options).map((o) => o.value)).toEqual([""]));
  });

  it("changing the asset group clears the venue narrow + refetches filter options", async () => {
    render(<CatalogueExplorer />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId("catalogue-explorer-venue-select"), { target: { value: "OKX-SPOT" } });
    await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ venue: "OKX-SPOT" })));

    fireEvent.change(screen.getByTestId("catalogue-explorer-asset-group-select"), { target: { value: "tradfi" } });
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ asset_group: "tradfi", venue: undefined })),
    );
    await waitFor(() => expect(optionsSpy).toHaveBeenCalledWith(expect.objectContaining({ asset_group: "tradfi" })));
  });
});
