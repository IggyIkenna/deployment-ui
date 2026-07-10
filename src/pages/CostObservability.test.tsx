import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
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
      currency: "GBP",
      total_native: 11186.14,
      gross_native: 13116.25,
      credit_native: -1930.11,
    },
    {
      cloud: "aws",
      total: 218.99,
      gross: 218.99,
      credit: 0,
      delta_pct: -5.2,
      daily: [7, 8],
      is_placeholder: false,
      currency: "USD",
      total_native: 218.99,
      gross_native: 218.99,
      credit_native: 0,
    },
    {
      cloud: "github",
      total: 292.68,
      gross: 292.68,
      credit: 0,
      delta_pct: 0.1,
      daily: [9, 9],
      is_placeholder: true,
      currency: "USD",
      total_native: 292.68,
      gross_native: 292.68,
      credit_native: 0,
    },
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
      purchase_option: "spot",
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
      purchase_option: "other",
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
      machine_type: "e2-highmem-8",
      vcpu: 8,
      memory_gb: 64,
      purchase_option: "spot",
    },
    {
      label: "i-0c9b283b31d6b5ca7",
      cloud: "aws",
      cost: 46,
      gross: 46,
      credit: 0,
      detail: "Amazon EC2",
      resource_kind: "vm",
      share_pct: 9,
      is_provisional: false,
      purchase_option: "on-demand",
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
      purchase_option: "other",
      // The resource-dimension fetch also feeds the "Top storage buckets" leaf table, so bucket
      // rows here carry storage detail too (mirrors the real backend's `_by_resource`, which keys
      // off resource_kind, not the query dimension).
      storage_gb: 18500,
      storage_class_gb: { Standard: 12000, Nearline: 4000, Coldline: 2000, Archive: 500 },
      cost_per_gb: 0.1349,
    },
    {
      label: "ikenna-windows-tokyo-restored",
      cloud: "gcp",
      cost: 68.62,
      gross: 68.62,
      credit: 0,
      detail: "Compute Engine",
      resource_kind: "disk",
      share_pct: 13.7,
      is_provisional: false,
      is_idle: true,
      waste_kind: "orphaned_disk",
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

// A capped dimension: 4,783 groups but only the top 2 shown, the rest folded into "Other" +
// an "Unattributed" row. The four shown rows reconcile to the true total (2423.05 + 216.52 +
// 9588.60 + 365.15 = 12593.32) so the header total matches the KPI, not the shrunk top-N sum.
const cappedBreakdown: api.CostBreakdownResponse = {
  dimension: "service",
  cloud: "all",
  days: 30,
  total: 12593.32,
  total_groups: 4783,
  rows: [
    {
      label: "Compute Engine",
      cloud: "gcp",
      cost: 2423.05,
      gross: 2522.62,
      credit: -99.57,
      detail: "GCP",
      resource_kind: "other",
      share_pct: 19.2,
      is_provisional: false,
    },
    {
      label: "Cloud Storage",
      cloud: "gcp",
      cost: 216.52,
      gross: 286.61,
      credit: -70.09,
      detail: "GCP",
      resource_kind: "other",
      share_pct: 1.7,
      is_provisional: false,
    },
    {
      label: "Other (4,675 more)",
      cloud: null,
      cost: 9588.6,
      gross: 10000,
      credit: -411.4,
      detail: "rows beyond the top 100",
      resource_kind: "other",
      share_pct: 76.1,
      is_provisional: false,
      is_aggregate: true,
    },
    {
      label: "Unattributed (no resource id)",
      cloud: null,
      cost: 365.15,
      gross: 365.15,
      credit: 0,
      detail: "cost the provider doesn't tag to a resource (Cloud Run, networking, …)",
      resource_kind: "other",
      share_pct: 2.9,
      is_provisional: false,
      is_aggregate: true,
    },
  ],
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

  it("USD⇄GBP toggle re-denominates GCP to native £ while AWS stays USD", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-cloud-total-gcp")).toHaveTextContent("$14,914.85"));
    // AWS is USD-native (no GBP figure exists) — stays $ regardless of the toggle.
    expect(screen.getByTestId("cost-cloud-total-aws")).toHaveTextContent("$218.99");
    fireEvent.click(screen.getByRole("button", { name: "GBP" }));
    // GCP (GBP-native) re-denominates to its raw £ invoice figure; AWS unchanged.
    await waitFor(() => expect(screen.getByTestId("cost-cloud-total-gcp")).toHaveTextContent("£11,186.14"));
    expect(screen.getByTestId("cost-cloud-total-aws")).toHaveTextContent("$218.99");
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

  it("caps a high-cardinality dimension: fraction hint, Other + Unattributed roll-ups, help tooltip", async () => {
    vi.mocked(api.fetchCostBreakdown).mockResolvedValue(cappedBreakdown);
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    const panel = screen.getByTestId("cost-breakdown-table").closest("section") as HTMLElement;
    // Hint carries the TRUE total (matches the KPI, not the shrunk top-N sum) + the group count.
    expect(within(panel).getByText("$12,593.32")).toBeInTheDocument();
    expect(within(panel).getByText("4,783")).toBeInTheDocument();
    // The tail is folded into pinned "Other" + "Unattributed" roll-up rows, not dropped.
    const aggRows = screen.getAllByTestId("cost-row-aggregate");
    expect(aggRows.some((r) => r.textContent?.includes("Other (4,675 more)"))).toBe(true);
    expect(aggRows.some((r) => r.textContent?.includes("Unattributed"))).toBe(true);
    // A help tooltip carries the plain-language explanation.
    expect(screen.getByTestId("cost-breakdown-cap-note")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("true total"),
    );
  });

  it("refetches the breakdown when the dimension changes", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By region" }));
    await waitFor(() => expect(vi.mocked(api.fetchCostBreakdown)).toHaveBeenCalledWith("region", "all", 30, false));
  });

  it("shows machine specs + a cost-waste badge only under the resource dimension", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    // Not present in the breakdown table under the default "By service" view — scoped to that
    // table because the same testids also appear in the always-rendered "Top compute instances"
    // leaf table, which is pinned to vm rows independent of the breakdown dimension selector.
    const breakdownTable = screen.getByTestId("cost-breakdown-table");
    expect(within(breakdownTable).queryByTestId("cost-resource-machine")).toBeNull();
    expect(within(breakdownTable).queryByTestId("cost-resource-waste")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "By resource" }));
    await waitFor(() => expect(within(breakdownTable).getByText("ikenna-windows-tokyo-restored")).toBeInTheDocument());

    // The VM row's machine spec renders; the bucket row (no spec) shows a dash.
    expect(within(breakdownTable).getByText("e2-highmem-8 · 8 vCPU · 64 GB")).toBeInTheDocument();
    const machineCells = within(breakdownTable).getAllByTestId("cost-resource-machine");
    expect(machineCells.some((c) => c.textContent === "—")).toBe(true);

    // The orphaned-disk row carries a badge + its own cost as the waste amount; non-waste rows dash.
    const wasteCells = within(breakdownTable).getAllByTestId("cost-resource-waste");
    expect(wasteCells.some((c) => c.textContent?.includes("orphaned") && c.textContent.includes("68.62"))).toBe(true);
    expect(wasteCells.some((c) => c.textContent === "—")).toBe(true);
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

  it("shows a spot/on-demand chip on service rows, dash for the non-compute axis", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    expect(screen.getByTestId("cost-col-purchase")).toBeInTheDocument();
    const purchaseCells = screen.getAllByTestId("cost-row-purchase");
    expect(purchaseCells.some((c) => c.textContent === "spot")).toBe(true); // Compute Engine
    expect(purchaseCells.some((c) => c.textContent === "—")).toBe(true); // GitHub Actions (other)
  });

  it("shows on-demand for a resource row and omits the purchase column on non-compute dimensions", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By resource" }));
    await waitFor(() => expect(screen.getByText("i-0c9b283b31d6b5ca7")).toBeInTheDocument());
    const purchaseCells = screen.getAllByTestId("cost-row-purchase");
    expect(purchaseCells.some((c) => c.textContent === "on-demand")).toBe(true);
    expect(purchaseCells.some((c) => c.textContent === "spot")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "By region" }));
    await waitFor(() => expect(screen.getByText("ap-northeast-1")).toBeInTheDocument());
    expect(screen.queryByTestId("cost-col-purchase")).toBeNull();
    expect(screen.queryAllByTestId("cost-row-purchase")).toHaveLength(0);
  });

  it("omits the gross/credit columns entirely when nothing in view carries a credit", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("cost-breakdown-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "By region" }));
    await waitFor(() => expect(screen.getByText("ap-northeast-1")).toBeInTheDocument());
    expect(screen.queryByTestId("cost-col-gross")).toBeNull();
    expect(screen.queryByTestId("cost-col-credit")).toBeNull();
  });

  it("applies the same detail columns (machine/waste, storage) to the leaf tables", async () => {
    render(<CostObservability />);
    await waitFor(() => expect(screen.getByTestId("leaf-vm-table")).toBeInTheDocument());

    const vmTable = screen.getByTestId("leaf-vm-table");
    expect(within(vmTable).getByText("e2-highmem-8 · 8 vCPU · 64 GB")).toBeInTheDocument();
    expect(within(vmTable).getAllByTestId("cost-resource-waste").length).toBeGreaterThan(0);

    const bucketTable = screen.getByTestId("leaf-bucket-table");
    expect(within(bucketTable).getByTestId("cost-bucket-storage-gb")).toHaveTextContent("18,500 GB");
    expect(within(bucketTable).getByTestId("cost-bucket-storage-class")).toHaveTextContent("Standard");
    expect(within(bucketTable).getByTestId("cost-bucket-cost-per-gb")).toHaveTextContent("/GB");
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
