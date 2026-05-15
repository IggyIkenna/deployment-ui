import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DailyCostResponse } from "../api/deploymentApi";

const mockFetchDailyCosts = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  fetchDailyCosts: (date?: string) => mockFetchDailyCosts(date),
}));

vi.mock("../components/ui/card", () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <h3>{p.children}</h3>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

vi.mock("../components/ui/button", () => ({
  Button: (p: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <button onClick={p.onClick} disabled={p.disabled} aria-label={p["aria-label"]}>
      {p.children}
    </button>
  ),
}));

import { DailyCosts } from "./DailyCosts";

const MOCK_RESPONSE: DailyCostResponse = {
  date: "2026-05-15",
  total_usd: 1.94,
  by_asset_group: [
    { asset_group: "defi", total_usd: 1.55, vm_count: 1 },
    { asset_group: "cefi", total_usd: 0.39, vm_count: 1 },
  ],
  by_archetype: [
    { archetype: "arbitrage_price_dispersion", total_usd: 1.55, vm_count: 1 },
    { archetype: "carry_staked_basis", total_usd: 0.39, vm_count: 1 },
  ],
  by_vm: [
    {
      vm_name: "defi-backfill-20260515",
      asset_group: "defi",
      archetype: "arbitrage_price_dispersion",
      machine_type: "n1-standard-8",
      runtime_hours: 4.0,
      compute_usd: 1.52,
      disk_usd: 0.03,
      total_usd: 1.55,
    },
    {
      vm_name: "cefi-backfill-20260515",
      asset_group: "cefi",
      archetype: "carry_staked_basis",
      machine_type: "n1-standard-4",
      runtime_hours: 2.0,
      compute_usd: 0.38,
      disk_usd: 0.01,
      total_usd: 0.39,
    },
  ],
};

describe("DailyCosts page", () => {
  beforeEach(() => {
    mockFetchDailyCosts.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders page title", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Daily VM Costs")).toBeInTheDocument();
    });
  });

  it("shows total cost after load", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("total-usd")).toBeInTheDocument();
    });
    expect(screen.getByTestId("total-usd").textContent).toContain("1.9400");
  });

  it("renders asset group table rows", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getAllByText("defi").length).toBeGreaterThan(0);
      expect(screen.getAllByText("cefi").length).toBeGreaterThan(0);
    });
  });

  it("renders archetype table rows", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("arbitrage_price_dispersion")).toBeInTheDocument();
      expect(screen.getByText("carry_staked_basis")).toBeInTheDocument();
    });
  });

  it("renders VM table rows", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("defi-backfill-20260515")).toBeInTheDocument();
      expect(screen.getByText("cefi-backfill-20260515")).toBeInTheDocument();
    });
  });

  it("shows error alert on API failure", async () => {
    mockFetchDailyCosts.mockRejectedValueOnce(new Error("GCS unavailable"));
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/GCS unavailable/)).toBeInTheDocument();
    });
  });

  it("refresh button re-triggers data load", async () => {
    mockFetchDailyCosts.mockResolvedValue(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("total-usd")).toBeInTheDocument();
    });
    const callsBefore = mockFetchDailyCosts.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /refresh cost data/i }));
    await waitFor(() => {
      expect(mockFetchDailyCosts.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it("shows date picker input", async () => {
    mockFetchDailyCosts.mockResolvedValueOnce(MOCK_RESPONSE);
    render(
      <MemoryRouter>
        <DailyCosts />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/select date/i)).toBeInTheDocument();
    });
  });
});
