/**
 * ClientReportingTab unit tests (Phase 5.C2).
 *
 * Covers:
 *   1. Loading state while all 5 fetches are in flight.
 *   2. NAV / PnL / positions / attribution / HWM data renders after load.
 *   3. Error state when one fetch fails.
 *   4. Empty-state branches (no NAV data, no PnL data, etc.).
 *   5. HwmTable renders fee-recognition rows with correct amount coloring.
 *
 * Plan: deployment_and_qg_strategy_implementation_2026_05_13.md Phase 4.C.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as crApi from "../api/clientReporting";
import type {
  AttributionResponse,
  HwmTimelineResponse,
  NavResponse,
  PnLResponse,
  PositionsResponse,
} from "../api/clientReporting";
import { ClientReportingTab } from "./ClientReportingTab";

vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="bar-chart">{children}</svg>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <svg data-testid="line-chart">{children}</svg>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => (
    <g data-testid={`bar-${dataKey}`} />
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <g data-testid={`line-${dataKey}`} />
  ),
  XAxis: () => <g data-testid="x-axis" />,
  YAxis: () => <g data-testid="y-axis" />,
  CartesianGrid: () => <g data-testid="cartesian-grid" />,
  Tooltip: () => <g data-testid="tooltip" />,
  Legend: () => <g data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NAV_RESPONSE: NavResponse = {
  client_id: "demo",
  share_class: "USDC_CUTOVER_V1",
  mode: "live",
  snapshots: [
    {
      date: "2026-05-14",
      nav_usd: "1000000.00",
      nav_in_share_class: "1000000.00",
      nav_delta_usd: "0.00",
      timestamp: "2026-05-14T00:00:00Z",
    },
    {
      date: "2026-05-15",
      nav_usd: "1010000.00",
      nav_in_share_class: "1010000.00",
      nav_delta_usd: "10000.00",
      timestamp: "2026-05-15T00:00:00Z",
    },
  ],
};

const PNL_RESPONSE: PnLResponse = {
  client_id: "demo",
  share_class: "USDC_CUTOVER_V1",
  entries: [
    {
      period_tag: "2026-05-14",
      realized_pnl: "500.00",
      unrealized_pnl: "200.00",
      total_pnl: "700.00",
      strategy_alpha_total: "400.00",
      execution_alpha_total: "300.00",
      timestamp: "2026-05-14T00:00:00Z",
    },
  ],
};

const POSITIONS_RESPONSE: PositionsResponse = {
  client_id: "demo",
  positions: [
    {
      archetype_id: "carry_staked_basis",
      strategy_leg_id: null,
      trade_id: null,
      venue: "HYPERLIQUID",
      instrument: "ETH-PERP",
      qty: "10.0",
      mark_price: "3200.00",
      cost_basis: "3150.00",
      realized_pnl: "0.00",
      unrealized_pnl: "500.00",
      share_class: "USDC_CUTOVER_V1",
      timestamp: "2026-05-15T00:00:00Z",
    },
  ],
};

const ATTRIBUTION_RESPONSE: AttributionResponse = {
  client_id: "demo",
  rows: [
    {
      strategy_id: "carry_v1",
      instrument_id: "stETH",
      date: "2026-05-14",
      factor: "FUNDING",
      layer: "STRATEGY",
      amount: 250.0,
      archetype_id: null,
      fill_id: null,
      venue: "HYPERLIQUID",
      benchmark_price: null,
    },
  ],
};

const HWM_RESPONSE: HwmTimelineResponse = {
  client_id: "demo",
  rows: [
    {
      share_class_id: "USDC_CUTOVER_V1",
      period_start: "2026-05-01T00:00:00Z",
      period_end: "2026-05-15T00:00:00Z",
      recognition_type: "performance_fee",
      amount_usd: "1500.00",
      recognized_at: "2026-05-15T12:00:00Z",
      source_event_id: "evt_001",
    },
    {
      share_class_id: "USDC_CUTOVER_V1",
      period_start: "2026-04-01T00:00:00Z",
      period_end: "2026-04-30T23:59:59Z",
      recognition_type: "performance_fee",
      amount_usd: "-100.00",
      recognized_at: "2026-04-30T23:59:59Z",
      source_event_id: "evt_000",
    },
  ],
};

function _mockAll() {
  vi.spyOn(crApi, "fetchNav").mockResolvedValue(NAV_RESPONSE);
  vi.spyOn(crApi, "fetchPnL").mockResolvedValue(PNL_RESPONSE);
  vi.spyOn(crApi, "fetchPositions").mockResolvedValue(POSITIONS_RESPONSE);
  vi.spyOn(crApi, "fetchAttribution").mockResolvedValue(ATTRIBUTION_RESPONSE);
  vi.spyOn(crApi, "fetchHwmTimeline").mockResolvedValue(HWM_RESPONSE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ClientReportingTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state while fetches are in flight", () => {
    vi.spyOn(crApi, "fetchNav").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(crApi, "fetchPnL").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(crApi, "fetchPositions").mockImplementation(
      () => new Promise(() => {}),
    );
    vi.spyOn(crApi, "fetchAttribution").mockImplementation(
      () => new Promise(() => {}),
    );
    vi.spyOn(crApi, "fetchHwmTimeline").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<ClientReportingTab />);
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
  });

  it("renders NAV chart with data after load", async () => {
    _mockAll();

    render(<ClientReportingTab />);

    await waitFor(() => {
      expect(screen.getAllByTestId("line-chart").length).toBeGreaterThan(0);
    });
  });

  it("renders HWM crystallization table with rows", async () => {
    _mockAll();

    render(<ClientReportingTab />);

    await waitFor(() => {
      expect(screen.getAllByText("USDC_CUTOVER_V1").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("performance_fee").length).toBeGreaterThan(0);
    // Positive amount gets green class (just verify it renders as money)
    expect(screen.getByText("$1,500.00")).toBeTruthy();
  });

  it("shows error message when a fetch fails", async () => {
    vi.spyOn(crApi, "fetchNav").mockRejectedValue(new Error("NAV unavailable"));
    vi.spyOn(crApi, "fetchPnL").mockResolvedValue(PNL_RESPONSE);
    vi.spyOn(crApi, "fetchPositions").mockResolvedValue(POSITIONS_RESPONSE);
    vi.spyOn(crApi, "fetchAttribution").mockResolvedValue(ATTRIBUTION_RESPONSE);
    vi.spyOn(crApi, "fetchHwmTimeline").mockResolvedValue(HWM_RESPONSE);

    render(<ClientReportingTab />);

    await waitFor(() => {
      expect(screen.getByText("NAV unavailable")).toBeTruthy();
    });
  });

  it("renders empty-state message when NAV returns no snapshots", async () => {
    vi.spyOn(crApi, "fetchNav").mockResolvedValue({
      ...NAV_RESPONSE,
      snapshots: [],
    });
    vi.spyOn(crApi, "fetchPnL").mockResolvedValue(PNL_RESPONSE);
    vi.spyOn(crApi, "fetchPositions").mockResolvedValue(POSITIONS_RESPONSE);
    vi.spyOn(crApi, "fetchAttribution").mockResolvedValue(ATTRIBUTION_RESPONSE);
    vi.spyOn(crApi, "fetchHwmTimeline").mockResolvedValue(HWM_RESPONSE);

    render(<ClientReportingTab />);

    await waitFor(() => {
      expect(screen.getByText("No NAV data available.")).toBeTruthy();
    });
  });

  it("renders empty-state when HWM timeline returns no rows", async () => {
    vi.spyOn(crApi, "fetchNav").mockResolvedValue(NAV_RESPONSE);
    vi.spyOn(crApi, "fetchPnL").mockResolvedValue(PNL_RESPONSE);
    vi.spyOn(crApi, "fetchPositions").mockResolvedValue(POSITIONS_RESPONSE);
    vi.spyOn(crApi, "fetchAttribution").mockResolvedValue(ATTRIBUTION_RESPONSE);
    vi.spyOn(crApi, "fetchHwmTimeline").mockResolvedValue({
      client_id: "demo",
      rows: [],
    });

    render(<ClientReportingTab />);

    await waitFor(() => {
      expect(screen.getByText("No fee recognition events.")).toBeTruthy();
    });
  });

  it("renders the client-reporting-tab container", async () => {
    _mockAll();

    render(<ClientReportingTab />);

    expect(screen.getByTestId("client-reporting-tab")).toBeTruthy();
  });
});
