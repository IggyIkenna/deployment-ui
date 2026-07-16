/**
 * TreasuryTab component tests — Phase 6.C.
 *
 * Plan: wallet_treasury_client_flow_2026_05_10.md Phase 6.C.
 *
 * Covers:
 *   1. Renders loading state while API calls are in flight.
 *   2. Renders NAV, onboarding state badge, subscriptions after load.
 *   3. Withdrawal request button present; clicking opens the dialog.
 *   4. Error state when API call fails.
 *   5. Custody pings grid renders with COPPER as unreachable.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as treasuryApi from "../api/treasury";
import type { ClientSubscriptions, ClientTreasury } from "../api/treasury";
import { TreasuryTab } from "./TreasuryTab";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_TREASURY: ClientTreasury = {
  client_id: "demo",
  as_of: "2026-05-13T10:00:00+00:00",
  subscriptions: [
    {
      client_id: "demo",
      share_class_id: "USDC_CUTOVER_V1",
      archetype_id: "carry_staked_basis",
      allocation_pct: "60",
      max_drawdown_for_suspension_pct: "15",
      subscribed_at: "2026-05-10T09:00:00+00:00",
      suspended_at: null,
      suspension_reason: "",
      is_active: true,
    },
    {
      client_id: "demo",
      share_class_id: "USDC_CUTOVER_V1",
      archetype_id: "arbitrage_price_dispersion",
      allocation_pct: "40",
      max_drawdown_for_suspension_pct: "20",
      subscribed_at: "2026-05-10T09:00:00+00:00",
      suspended_at: null,
      suspension_reason: "",
      is_active: true,
    },
  ],
  treasury_attribution: [
    {
      source: "DEFI_HOT_WALLET",
      client_share_pct: "100",
      client_share_usd: "850000.00",
      source_nav_usd: "850000.00",
    },
    {
      source: "SUB_ACCOUNT_HYPERLIQUID",
      client_share_pct: "100",
      client_share_usd: "300000.00",
      source_nav_usd: "300000.00",
    },
    {
      source: "SUB_ACCOUNT_DYDX",
      client_share_pct: "100",
      client_share_usd: "100000.00",
      source_nav_usd: "100000.00",
    },
  ],
  custody_ping_results: [
    {
      source: "DEFI_HOT_WALLET",
      is_reachable: true,
      balance_usd: "850000.00",
      as_of_timestamp: "2026-05-13T10:00:00+00:00",
      latency_ms: 42,
      error_message: "",
    },
    {
      source: "COPPER",
      is_reachable: false,
      balance_usd: null,
      as_of_timestamp: null,
      latency_ms: 0,
      error_message: "June-1 credential delivery pending",
    },
  ],
  allocations: [
    {
      archetype_id: "carry_staked_basis",
      share_class_id: "USDC_CUTOVER_V1",
      allocation_amount_usd: "750000.00",
      decision_event_id: "alloc_carry_staked_basis_demo",
      decided_at: "2026-05-13T10:00:00+00:00",
    },
    {
      archetype_id: "arbitrage_price_dispersion",
      share_class_id: "USDC_CUTOVER_V1",
      allocation_amount_usd: "500000.00",
      decision_event_id: "alloc_arbitrage_price_dispersion_demo",
      decided_at: "2026-05-13T10:00:00+00:00",
    },
  ],
  last_settled: {
    trade_id: "trade_demo_001",
    archetype_id: "carry_staked_basis",
    venue: "hyperliquid",
    side: "sell",
    quantity: "12.5",
    fill_price: "3142.80",
    pnl_usd: "1250.00",
    settled_at: "2026-05-13T08:30:00+00:00",
  },
  nav_usd: "1250000.00",
};

const MOCK_SUBSCRIPTIONS: ClientSubscriptions = {
  client_id: "demo",
  subscriptions: MOCK_TREASURY.subscriptions,
  onboarding_state: "LIVE",
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("TreasuryTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the loading indicator while API calls are in flight", async () => {
    let resolveTreasury!: (v: ClientTreasury) => void;
    let resolveSubs!: (v: ClientSubscriptions) => void;
    vi.spyOn(treasuryApi, "fetchClientTreasury").mockImplementation(
      () =>
        new Promise<ClientTreasury>((r) => {
          resolveTreasury = r;
        }),
    );
    vi.spyOn(treasuryApi, "fetchClientSubscriptions").mockImplementation(
      () =>
        new Promise<ClientSubscriptions>((r) => {
          resolveSubs = r;
        }),
    );

    render(<TreasuryTab />);
    // Should show loading button text
    expect(screen.getByText("Loading…")).toBeTruthy();

    // Resolve to unblock
    resolveTreasury(MOCK_TREASURY);
    resolveSubs(MOCK_SUBSCRIPTIONS);
  });

  it("renders NAV, onboarding badge, and subscriptions after data loads", async () => {
    vi.spyOn(treasuryApi, "fetchClientTreasury").mockResolvedValue(MOCK_TREASURY);
    vi.spyOn(treasuryApi, "fetchClientSubscriptions").mockResolvedValue(MOCK_SUBSCRIPTIONS);

    render(<TreasuryTab />);

    await waitFor(() => {
      expect(screen.getByTestId("treasury-nav-usd")).toBeTruthy();
    });

    // NAV should be rendered (formatted as currency)
    const navEl = screen.getByTestId("treasury-nav-usd");
    expect(navEl.textContent).toContain("1,250,000");

    // Onboarding badge
    expect(screen.getByText("LIVE")).toBeTruthy();

    // Subscription archetypes (may appear in both subscriptions + allocations tables)
    expect(screen.getAllByText("carry_staked_basis").length).toBeGreaterThan(0);
    expect(screen.getAllByText("arbitrage_price_dispersion").length).toBeGreaterThan(0);
  });

  it("withdrawal request button is visible after data loads and opens dialog", async () => {
    vi.spyOn(treasuryApi, "fetchClientTreasury").mockResolvedValue(MOCK_TREASURY);
    vi.spyOn(treasuryApi, "fetchClientSubscriptions").mockResolvedValue(MOCK_SUBSCRIPTIONS);

    render(<TreasuryTab />);

    await waitFor(() => {
      expect(screen.getByTestId("withdrawal-request-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("withdrawal-request-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("withdrawal-dialog")).toBeTruthy();
    });
  });

  it("shows error message when API call fails", async () => {
    vi.spyOn(treasuryApi, "fetchClientTreasury").mockRejectedValue(new Error("Network error"));
    vi.spyOn(treasuryApi, "fetchClientSubscriptions").mockRejectedValue(new Error("Network error"));

    render(<TreasuryTab />);

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy();
    });
  });

  it("renders COPPER custody ping as UNREACHABLE", async () => {
    vi.spyOn(treasuryApi, "fetchClientTreasury").mockResolvedValue(MOCK_TREASURY);
    vi.spyOn(treasuryApi, "fetchClientSubscriptions").mockResolvedValue(MOCK_SUBSCRIPTIONS);

    render(<TreasuryTab />);

    await waitFor(() => {
      expect(screen.getByTestId("treasury-nav-usd")).toBeTruthy();
    });

    // COPPER should show as UNREACHABLE
    expect(screen.getByText("COPPER")).toBeTruthy();
    expect(screen.getByText("UNREACHABLE")).toBeTruthy();
  });
});
