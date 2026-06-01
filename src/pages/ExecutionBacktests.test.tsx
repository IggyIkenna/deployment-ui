import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExecutionBacktests } from "./ExecutionBacktests";
import * as deploymentApi from "../api/deploymentApi";

vi.mock("../api/deploymentApi", () => ({
  launchExecutionBacktest: vi.fn(),
}));

const mockResult = {
  vm_name: "strategy-paper-carry-20260515",
  zone: "asia-northeast1-b",
  project_id: "central-element-323112",
  launched_at: "2026-05-15T10:00:00Z",
  correlation_id: "corr-def-789",
  launcher_script: "launch-strategy-paper-vm.sh",
  dry_run: true,
  events_uri:
    "gs://central-element-323112-events/events/execution/2026-05-15/strategy-paper-carry-20260515/",
  argv: ["--archetype", "carry_staked_basis"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExecutionBacktests", () => {
  it("renders page title and form elements", () => {
    render(<ExecutionBacktests />);
    expect(screen.getByText("Execution Backtests")).toBeInTheDocument();
    expect(screen.getByTestId("archetype-select")).toBeInTheDocument();
    expect(screen.getByTestId("tick-interval-input")).toBeInTheDocument();
    expect(screen.getByTestId("dry-run-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("launch-button")).toBeInTheDocument();
  });

  it("shows inline error when tick interval is below minimum", () => {
    render(<ExecutionBacktests />);
    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "30" },
    });
    expect(screen.getByText(/60 and 86400/i)).toBeInTheDocument();
  });

  it("shows inline error when tick interval exceeds maximum", () => {
    render(<ExecutionBacktests />);
    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "99999" },
    });
    expect(screen.getByText(/60 and 86400/i)).toBeInTheDocument();
  });

  it("submit button disabled when tick interval is out of range", () => {
    render(<ExecutionBacktests />);
    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "30" },
    });
    expect(screen.getByTestId("launch-button")).toBeDisabled();
  });

  it("inline error disappears when tick interval is corrected", () => {
    render(<ExecutionBacktests />);
    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "30" },
    });
    expect(screen.getByText(/60 and 86400/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "300" },
    });
    expect(screen.queryByText(/60 and 86400/i)).not.toBeInTheDocument();
  });

  it("calls launchExecutionBacktest with correct params and shows result", async () => {
    vi.mocked(deploymentApi.launchExecutionBacktest).mockResolvedValue(
      mockResult,
    );
    render(<ExecutionBacktests />);

    fireEvent.change(screen.getByTestId("tick-interval-input"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(deploymentApi.launchExecutionBacktest).toHaveBeenCalledWith(
        expect.objectContaining({
          archetype: "carry_staked_basis",
          tick_interval: 300,
          dry_run: true,
        }),
      );
    });
    expect(screen.getByTestId("launch-result")).toBeInTheDocument();
    expect(
      screen.getByText("strategy-paper-carry-20260515"),
    ).toBeInTheDocument();
  });

  it("toggles continuous mode checkbox", () => {
    render(<ExecutionBacktests />);
    const cb = screen.getByTestId("continuous-checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);
  });

  it("shows DRY RUN badge when result.dry_run is true", async () => {
    vi.mocked(deploymentApi.launchExecutionBacktest).mockResolvedValue(
      mockResult,
    );
    render(<ExecutionBacktests />);

    fireEvent.click(screen.getByTestId("launch-button"));
    await waitFor(() =>
      expect(screen.getByText("DRY RUN")).toBeInTheDocument(),
    );
  });

  it("shows error panel on API failure", async () => {
    vi.mocked(deploymentApi.launchExecutionBacktest).mockRejectedValue(
      new Error("HTTP 504: launcher timed out"),
    );
    render(<ExecutionBacktests />);

    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(screen.getByTestId("launch-error")).toBeInTheDocument();
      expect(screen.getByText(/HTTP 504/)).toBeInTheDocument();
    });
  });
});
