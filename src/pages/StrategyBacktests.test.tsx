import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrategyBacktests } from "./StrategyBacktests";
import * as deploymentApi from "../api/deploymentApi";

vi.mock("../api/deploymentApi", () => ({
  launchStrategyBacktest: vi.fn(),
}));

const mockResult = {
  vm_name: "strategy-backtest-grid-carry-20260515",
  zone: "asia-northeast1-b",
  project_id: "central-element-323112",
  launched_at: "2026-05-15T10:00:00Z",
  correlation_id: "corr-xyz-456",
  launcher_script: "launch-strategy-backtest-grid-vm.sh",
  dry_run: true,
  events_uri:
    "gs://central-element-323112-events/events/strategy/2026-05-15/strategy-backtest-grid-carry-20260515/",
  argv: ["--archetype", "carry_staked_basis"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StrategyBacktests", () => {
  it("renders page title and form elements", () => {
    render(<StrategyBacktests />);
    expect(screen.getByText("Strategy Backtests")).toBeInTheDocument();
    expect(screen.getByTestId("archetype-select")).toBeInTheDocument();
    expect(screen.getByTestId("start-date-input")).toBeInTheDocument();
    expect(screen.getByTestId("end-date-input")).toBeInTheDocument();
    expect(screen.getByTestId("grid-density-select")).toBeInTheDocument();
    expect(screen.getByTestId("launch-button")).toBeInTheDocument();
  });

  it("shows error when dates are empty on submit", async () => {
    render(<StrategyBacktests />);
    fireEvent.click(screen.getByTestId("launch-button"));
    await waitFor(() => {
      expect(screen.getByTestId("launch-error")).toBeInTheDocument();
      expect(screen.getByText(/start date and end date/i)).toBeInTheDocument();
    });
  });

  it("calls launchStrategyBacktest with correct params and shows result", async () => {
    vi.mocked(deploymentApi.launchStrategyBacktest).mockResolvedValue(mockResult);
    render(<StrategyBacktests />);

    fireEvent.change(screen.getByTestId("start-date-input"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("end-date-input"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(deploymentApi.launchStrategyBacktest).toHaveBeenCalledWith(
        expect.objectContaining({
          archetype: "carry_staked_basis",
          start_date: "2026-01-01",
          end_date: "2026-03-31",
          grid_density: "medium",
          dry_run: true,
        }),
      );
    });
    expect(screen.getByTestId("launch-result")).toBeInTheDocument();
    expect(screen.getByText("strategy-backtest-grid-carry-20260515")).toBeInTheDocument();
  });

  it("shows DRY RUN badge when result.dry_run is true", async () => {
    vi.mocked(deploymentApi.launchStrategyBacktest).mockResolvedValue(mockResult);
    render(<StrategyBacktests />);

    fireEvent.change(screen.getByTestId("start-date-input"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("end-date-input"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => expect(screen.getByText("DRY RUN")).toBeInTheDocument());
  });

  it("shows error panel on API failure", async () => {
    vi.mocked(deploymentApi.launchStrategyBacktest).mockRejectedValue(
      new Error("HTTP 400: unknown archetype"),
    );
    render(<StrategyBacktests />);

    fireEvent.change(screen.getByTestId("start-date-input"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByTestId("end-date-input"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(screen.getByTestId("launch-error")).toBeInTheDocument();
      expect(screen.getByText(/HTTP 400/)).toBeInTheDocument();
    });
  });
});
