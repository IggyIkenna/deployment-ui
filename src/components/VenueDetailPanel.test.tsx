import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VenueDetailPanel } from "./VenueDetailPanel";
import type {
  VenueDetailResult,
  VenueDetailV2Response,
} from "../api/client";

describe("VenueDetailPanel", () => {
  it("loading state", () => {
    render(<VenueDetailPanel loading data={null} />);
    expect(screen.getByTestId("venue-detail-panel-loading")).toBeTruthy();
  });

  it("error state (null data, not loading)", () => {
    render(<VenueDetailPanel loading={false} data={null} />);
    expect(screen.getByTestId("venue-detail-panel-error")).toBeTruthy();
  });

  it("renders CeFi v1 payload with instrument_types + top_instruments", () => {
    const data: VenueDetailResult = {
      venue: "BINANCE-SPOT",
      category: "CEFI",
      date: "2026-04-18",
      total_instruments: 120,
      columns: ["symbol", "base", "quote"],
      instrument_types: { PERPETUAL: 80, SPOT: 40 },
      top_instruments: [
        { key: "BTC-USD", type: "SPOT", base: "BTC", quote: "USD" },
      ],
    };
    render(<VenueDetailPanel loading={false} data={data} />);
    expect(screen.getByTestId("venue-detail-panel-cefi")).toBeTruthy();
    expect(screen.getByText("PERPETUAL")).toBeTruthy();
    // "SPOT" appears both in instrument_types summary and top_instruments row
    expect(screen.getAllByText("SPOT").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("BTC-USD")).toBeTruthy();
  });

  it("renders DeFi chain-only branch with protocols list", () => {
    const data: VenueDetailV2Response = {
      category: "DEFI",
      venue: "ETHEREUM",
      chain: "ETHEREUM",
      protocol: null,
      total_instruments: 0,
      total_pools: 250,
      total_tokens: 120,
      instruments: [],
      protocols: [
        { name: "AAVE_V3", pool_count: 30, token_count: 12 },
        { name: "UNISWAP_V3", pool_count: 220, token_count: 108 },
      ],
      pools: [],
      tokens: [],
      day: null,
    };
    render(<VenueDetailPanel loading={false} data={data} />);
    expect(screen.getByTestId("venue-detail-panel-defi-protocols")).toBeTruthy();
    expect(screen.getByTestId("defi-protocol-row-AAVE_V3")).toBeTruthy();
    expect(screen.getByTestId("defi-protocol-row-UNISWAP_V3")).toBeTruthy();
  });

  it("renders DeFi composite branch with pools list", () => {
    const data: VenueDetailV2Response = {
      category: "DEFI",
      venue: "UNISWAP_V3-ETHEREUM",
      chain: "ETHEREUM",
      protocol: "UNISWAP_V3",
      total_instruments: 0,
      total_pools: 2,
      total_tokens: 4,
      instruments: [],
      protocols: [],
      pools: [
        {
          address: "0xPool1",
          token0: "WETH",
          token1: "USDC",
          fee_tier: 500,
          tvl_usd: 1_000_000,
        },
        {
          address: "0xPool2",
          token0: "WBTC",
          token1: "USDC",
          fee_tier: 3000,
          tvl_usd: 500_000,
        },
      ],
      tokens: [],
      day: null,
    };
    render(<VenueDetailPanel loading={false} data={data} />);
    expect(screen.getByTestId("venue-detail-panel-defi-pools")).toBeTruthy();
    expect(screen.getByTestId("defi-pool-row-0xPool1")).toBeTruthy();
    expect(screen.getByTestId("defi-pool-row-0xPool2")).toBeTruthy();
  });
});
