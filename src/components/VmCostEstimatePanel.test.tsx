import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VmCostEstimatePanel } from "./VmCostEstimatePanel";

vi.mock("../api/deploymentApi", () => ({
  fetchVmCostEstimate: vi.fn(),
}));

let mockFetchVmCostEstimate: ReturnType<typeof vi.fn>;

const MOCK_RESULT = {
  machine_type: "n1-standard-4",
  runtime_hours: 2,
  disk_gb: 50,
  count: 1,
  compute_cost_usd: 0.38,
  disk_cost_usd: 0.0054,
  total_cost_usd: 0.3854,
  hourly_rate_usd: 0.19,
  currency: "USD",
  region: "asia-northeast1",
  dry_run: true,
  estimated_at: "2026-05-15T19:00:00Z",
  unknown_machine_type: false,
};

beforeEach(async () => {
  const mod = await import("../api/deploymentApi");
  mockFetchVmCostEstimate = vi.mocked(mod.fetchVmCostEstimate);
  mockFetchVmCostEstimate.mockResolvedValue(MOCK_RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VmCostEstimatePanel", () => {
  it("renders the panel and Calculate button", () => {
    render(<VmCostEstimatePanel />);
    expect(screen.getByTestId("vm-cost-estimate-panel")).toBeInTheDocument();
    expect(screen.getByTestId("calculate-cost-btn")).toBeInTheDocument();
  });

  it("renders machine type select and runtime hours input", () => {
    render(<VmCostEstimatePanel />);
    expect(screen.getByTestId("ce-machine-type")).toBeInTheDocument();
    expect(screen.getByTestId("ce-hours")).toBeInTheDocument();
  });

  it("shows cost breakdown after submitting the form", async () => {
    render(<VmCostEstimatePanel />);
    fireEvent.submit(screen.getByTestId("cost-estimate-form"));
    await waitFor(() =>
      expect(screen.getByTestId("cost-estimate-result")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("cost-total")).toBeInTheDocument();
    expect(screen.getByTestId("cost-compute")).toBeInTheDocument();
    expect(mockFetchVmCostEstimate).toHaveBeenCalledOnce();
  });

  it("shows error state when fetch fails", async () => {
    mockFetchVmCostEstimate.mockRejectedValueOnce(new Error("network error"));
    render(<VmCostEstimatePanel />);
    fireEvent.submit(screen.getByTestId("cost-estimate-form"));
    await waitFor(() =>
      expect(screen.getByTestId("cost-estimate-error")).toBeInTheDocument(),
    );
    expect(screen.getByText(/network error/)).toBeInTheDocument();
  });

  it("shows dry_run label when result has dry_run=true", async () => {
    render(<VmCostEstimatePanel />);
    fireEvent.submit(screen.getByTestId("cost-estimate-form"));
    await waitFor(() =>
      expect(screen.getByTestId("cost-estimate-result")).toBeInTheDocument(),
    );
    expect(screen.getByText(/dry_run=true/)).toBeInTheDocument();
  });

  it("passes machine type and hours to the API", async () => {
    render(<VmCostEstimatePanel />);
    fireEvent.change(screen.getByTestId("ce-machine-type"), {
      target: { value: "n1-standard-8" },
    });
    fireEvent.change(screen.getByTestId("ce-hours"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByTestId("cost-estimate-form"));
    await waitFor(() => expect(mockFetchVmCostEstimate).toHaveBeenCalled());
    expect(mockFetchVmCostEstimate).toHaveBeenCalledWith(
      expect.objectContaining({
        machine_type: "n1-standard-8",
        runtime_hours: 5,
      }),
    );
  });
});
