import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CostObservability } from "./CostObservability";
import * as api from "../api/deploymentApi";

// Chart engine stubbed — this suite exercises page logic (KPIs, tables, filters);
// the visual chart render is covered by the Playwright spec.
vi.mock("recharts", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Stub,
    AreaChart: Stub,
    Area: Stub,
    PieChart: Stub,
    Pie: Stub,
    Cell: Stub,
    CartesianGrid: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
  };
});

vi.mock("../api/deploymentApi", () => ({
  fetchCostSummary: vi.fn(),
  fetchCostBreakdown: vi.fn(),
  fetchCostTimeseries: vi.fn(),
}));

const summary: api.CostSummaryResponse = {
  days: 30,
  total: 15426.52,
  run_rate_daily: 514.22,
  delta_pct: 8.1,
  dates: ["2026-06-09", "2026-06-10"],
  clouds: [
    { cloud: "gcp", total: 14914.85, delta_pct: 12.4, daily: [400, 500], is_placeholder: false },
    { cloud: "aws", total: 218.99, delta_pct: -5.2, daily: [7, 8], is_placeholder: false },
    { cloud: "github", total: 292.68, delta_pct: 0.1, daily: [9, 9], is_placeholder: true },
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
      detail: "GCP",
      resource_kind: "other",
      share_pct: 36.2,
      is_provisional: false,
    },
    {
      label: "GitHub Actions",
      cloud: "github",
      cost: 211.5,
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
      detail: "Compute Engine",
      resource_kind: "vm",
      share_pct: 51,
      is_provisional: false,
    },
    {
      label: "central-element-323112-events",
      cloud: "gcp",
      cost: 2494.71,
      detail: "Cloud Storage",
      resource_kind: "bucket",
      share_pct: 40,
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
    Promise.resolve(dimension === "resource" ? resourceBreakdown : serviceBreakdown),
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

  it("refetches with a new window when the range changes", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-total")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    await waitFor(() => expect(vi.mocked(api.fetchCostSummary)).toHaveBeenCalledWith(7, false));
  });
});
