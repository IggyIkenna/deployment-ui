import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostObservability } from "./CostObservability";
import * as api from "../api/deploymentApi";

// The trend + donut are now hand-rolled SVG (no chart lib to stub). This suite
// exercises page logic (KPIs, tables, filters, refetch); the visual chart render
// + crosshair are covered by the Playwright spec.
vi.mock("../api/deploymentApi", () => ({
  fetchCostSummary: vi.fn(),
  fetchCostBreakdown: vi.fn(),
  fetchCostTimeseries: vi.fn(),
}));

const summary: api.CostSummaryResponse = {
  days: 30,
  total: 15426.52, // net (what you pay) = gross 18000.00 − credits 2573.48
  gross: 18000.0,
  credit: -2573.48,
  run_rate_daily: 514.22,
  delta_pct: 8.1,
  dates: ["2026-06-09", "2026-06-10"],
  clouds: [
    // gcp carries the promo credit: net 14914.85 = gross 17488.33 − credit 2573.48
    {
      cloud: "gcp",
      total: 14914.85,
      gross: 17488.33,
      credit: -2573.48,
      delta_pct: 12.4,
      daily: [400, 500],
      is_placeholder: false,
    },
    { cloud: "aws", total: 218.99, gross: 218.99, credit: 0, delta_pct: -5.2, daily: [7, 8], is_placeholder: false },
    { cloud: "github", total: 292.68, gross: 292.68, credit: 0, delta_pct: 0.1, daily: [9, 9], is_placeholder: true },
  ],
  provisional_days: 2,
  generated_at: "2026-07-08T00:00:00Z",
};

const serviceBreakdown: api.CostBreakdownResponse = {
  dimension: "service",
  cloud: "all",
  days: 30,
  total: 15426.52,
  rows: [
    {
      label: "Compute Engine",
      cloud: "gcp",
      cost: 5560.11,
      gross: 6360.11, // carries a credit — net = gross + credit
      credit: -800,
      detail: "GCP",
      resource_kind: "other",
      share_pct: 36.2,
      is_provisional: false,
    },
    {
      label: "GitHub Actions",
      cloud: "github",
      cost: 211.5,
      gross: 211.5, // no credit — gross == cost
      credit: 0,
      detail: "GitHub",
      resource_kind: "other",
      share_pct: 1.4,
      is_provisional: false,
    },
  ],
};

const resourceBreakdown: api.CostBreakdownResponse = {
  dimension: "resource",
  cloud: "all",
  days: 30,
  total: 500,
  rows: [
    {
      label: "mtds-perp-funding-backfill",
      cloud: "gcp",
      cost: 255.26,
      gross: 295.26,
      credit: -40,
      detail: "Compute Engine",
      resource_kind: "vm",
      share_pct: 51,
      is_provisional: false,
    },
    {
      label: "central-element-323112-events",
      cloud: "gcp",
      cost: 2494.71,
      gross: 2494.71,
      credit: 0,
      detail: "Cloud Storage",
      resource_kind: "bucket",
      share_pct: 40,
      is_provisional: false,
    },
  ],
};

// No row here carries a credit — proves the gross/credit columns are omitted entirely
// when a filtered/dimension view has nothing to bifurcate (e.g. an AWS/GitHub-only cut).
const regionBreakdownNoCredit: api.CostBreakdownResponse = {
  dimension: "region",
  cloud: "all",
  days: 30,
  total: 190,
  rows: [
    {
      label: "ap-northeast-1",
      cloud: "aws",
      cost: 190,
      gross: 190,
      credit: 0,
      detail: "AWS",
      resource_kind: "other",
      share_pct: 100,
      is_provisional: false,
    },
  ],
};

const skuBreakdown: api.CostBreakdownResponse = {
  dimension: "sku",
  cloud: "all",
  days: 30,
  total: 2870,
  rows: [
    {
      label: "Regional Coldline Class A Operations",
      cloud: "gcp",
      cost: 2296,
      gross: 2870,
      credit: -574,
      detail: "Cloud Storage",
      resource_kind: "other",
      share_pct: 100,
      is_provisional: false,
    },
  ],
};

const timeseries: api.CostTimeseriesResponse = {
  days: 30,
  clouds: ["gcp", "aws", "github"],
  points: [{ date: "2026-07-08", values: { gcp: 400, aws: 7, github: 9 } }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchCostSummary).mockResolvedValue(summary);
  vi.mocked(api.fetchCostTimeseries).mockResolvedValue(timeseries);
  vi.mocked(api.fetchCostBreakdown).mockImplementation((dimension) =>
    Promise.resolve(
      dimension === "resource"
        ? resourceBreakdown
        : dimension === "region"
          ? regionBreakdownNoCredit
          : dimension === "sku"
            ? skuBreakdown
            : serviceBreakdown,
    ),
  );
});

describe("CostObservability", () => {
  it("renders the KPI total and per-cloud tiles from the summary", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-total")).toHaveTextContent("$15,426.52"));
    // Labels recur across KPI tiles / legends / tables — presence, not uniqueness.
    expect(screen.getAllByText("GCP").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AWS").length).toBeGreaterThan(0);
    expect(screen.getByText("mock")).toBeInTheDocument(); // github placeholder badge (unique)
  });

  it("shows net as the headline with the gross − credits derivation", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-total")).toHaveTextContent("$15,426.52")); // net
    const bd = screen.getByTestId("cost-total-breakdown");
    expect(bd).toHaveTextContent("$18,000.00"); // gross
    expect(bd).toHaveTextContent("$2,573.48"); // credits (shown as magnitude)
    // The gcp tile carries its own credit line; aws (no credits) renders none.
    expect(screen.getByTestId("cost-cloud-breakdown-gcp")).toHaveTextContent("$2,573.48");
    expect(screen.queryByTestId("cost-cloud-breakdown-aws")).toBeNull();
  });

  it("renders the breakdown table and the leaf tables split by resource kind", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    expect(screen.getAllByText("Compute Engine").length).toBeGreaterThan(0);
    // resource breakdown feeds the leaf tables: VM row + bucket row
    expect(screen.getByText("mtds-perp-funding-backfill")).toBeInTheDocument();
    expect(screen.getByText("central-element-323112-events")).toBeInTheDocument();
  });

  it("refetches the breakdown when the dimension changes", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By region" }));
    await waitFor(() => expect(vi.mocked(api.fetchCostBreakdown)).toHaveBeenCalledWith("region", "all", 30, false));
  });

  it("shows gross/credit columns only where a credit applies, dash for zero-credit rows", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    expect(screen.getByTestId("cost-col-gross")).toBeInTheDocument();
    expect(screen.getByTestId("cost-col-credit")).toBeInTheDocument();
    // Compute Engine (gcp) carries a credit — its gross renders as the pre-credit amount.
    expect(screen.getByText("$6,360.11")).toBeInTheDocument();
    const creditCells = screen.getAllByTestId("cost-row-credit");
    expect(creditCells.some((c) => c.textContent?.includes("800.00"))).toBe(true);
    // GitHub Actions carries no credit — its credit cell is a dash, not "$0.00".
    expect(creditCells.some((c) => c.textContent === "—")).toBe(true);
  });

  it("omits the gross/credit columns entirely when nothing in view carries a credit", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By region" }));
    await waitFor(() => expect(screen.getByText("ap-northeast-1")).toBeInTheDocument());
    expect(screen.queryByTestId("cost-col-gross")).toBeNull();
    expect(screen.queryByTestId("cost-col-credit")).toBeNull();
  });

  it("switches to the SKU dimension and refetches with dimension=sku", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By SKU" }));
    await waitFor(() => expect(vi.mocked(api.fetchCostBreakdown)).toHaveBeenCalledWith("sku", "all", 30, false));
    // The SKU dimension's note + the top-driver SKU fixture row both render.
    expect(screen.getByText("Google/AWS SKU")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Regional Coldline Class A Operations")).toBeInTheDocument());
  });

  it("refetches with a new window when the range changes", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-total")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(vi.mocked(api.fetchCostSummary)).toHaveBeenCalledWith(7, false));
  });
});
