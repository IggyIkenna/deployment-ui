import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MlExperiments } from "./MlExperiments";
import * as deploymentApi from "../api/deploymentApi";

vi.mock("../api/deploymentApi", () => ({
  launchMlExperiment: vi.fn(),
}));

vi.mock("../contexts/NotificationContext", () => ({
  useNotifications: () => ({ addToast: vi.fn(), dismissToast: vi.fn(), toasts: [] }),
}));

const mockResult = {
  vm_name: "ml-train-eth-usdt-20260515",
  zone: "asia-northeast1-b",
  project_id: "central-element-323112",
  launched_at: "2026-05-15T10:00:00Z",
  correlation_id: "corr-abc-123",
  launcher_script: "launch-ml-training-vm.sh",
  dry_run: true,
  events_uri: "gs://central-element-323112-events/events/ml/2026-05-15/ml-train-eth-usdt-20260515/",
  argv: ["--asset-group", "defi"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MlExperiments", () => {
  it("renders page title and form elements", () => {
    render(<MlExperiments />);
    expect(screen.getByText("ML Experiments")).toBeInTheDocument();
    expect(screen.getByTestId("asset-group-select")).toBeInTheDocument();
    expect(screen.getByTestId("instruments-input")).toBeInTheDocument();
    expect(screen.getByTestId("dry-run-checkbox")).toBeInTheDocument();
    expect(screen.getByTestId("launch-button")).toBeInTheDocument();
  });

  it("submit button is disabled when instruments field is empty", () => {
    render(<MlExperiments />);
    expect(screen.getByTestId("launch-button")).toBeDisabled();
  });

  it("shows inline error after blurring empty instruments field", () => {
    render(<MlExperiments />);
    fireEvent.blur(screen.getByTestId("instruments-input"));
    expect(screen.getByText(/at least one instrument/i)).toBeInTheDocument();
  });

  it("inline error disappears once a valid instrument is entered", () => {
    render(<MlExperiments />);
    fireEvent.blur(screen.getByTestId("instruments-input"));
    expect(screen.getByText(/at least one instrument/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("instruments-input"), { target: { value: "ETH-USDT" } });
    expect(screen.queryByText(/at least one instrument/i)).not.toBeInTheDocument();
  });

  it("submit button re-enables after valid instrument is entered", () => {
    render(<MlExperiments />);
    expect(screen.getByTestId("launch-button")).toBeDisabled();
    fireEvent.change(screen.getByTestId("instruments-input"), { target: { value: "ETH-USDT" } });
    expect(screen.getByTestId("launch-button")).not.toBeDisabled();
  });

  it("calls launchMlExperiment with correct params and shows result", async () => {
    vi.mocked(deploymentApi.launchMlExperiment).mockResolvedValue(mockResult);
    render(<MlExperiments />);

    fireEvent.change(screen.getByTestId("instruments-input"), {
      target: { value: "ETH-USDT, BTC-USDT" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(deploymentApi.launchMlExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          instruments: ["ETH-USDT", "BTC-USDT"],
          asset_group: "defi",
          dry_run: true,
        }),
      );
    });
    expect(screen.getByTestId("launch-result")).toBeInTheDocument();
    expect(screen.getByText("ml-train-eth-usdt-20260515")).toBeInTheDocument();
  });

  it("shows DRY RUN badge when result.dry_run is true", async () => {
    vi.mocked(deploymentApi.launchMlExperiment).mockResolvedValue(mockResult);
    render(<MlExperiments />);

    fireEvent.change(screen.getByTestId("instruments-input"), {
      target: { value: "ETH-USDT" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => expect(screen.getByText("DRY RUN")).toBeInTheDocument());
  });

  it("shows error panel on API failure", async () => {
    vi.mocked(deploymentApi.launchMlExperiment).mockRejectedValue(
      new Error("HTTP 500: internal error"),
    );
    render(<MlExperiments />);

    fireEvent.change(screen.getByTestId("instruments-input"), {
      target: { value: "ETH-USDT" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => {
      expect(screen.getByTestId("launch-error")).toBeInTheDocument();
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    });
  });

  it("dismisses result panel on dismiss click", async () => {
    vi.mocked(deploymentApi.launchMlExperiment).mockResolvedValue(mockResult);
    render(<MlExperiments />);

    fireEvent.change(screen.getByTestId("instruments-input"), {
      target: { value: "ETH-USDT" },
    });
    fireEvent.click(screen.getByTestId("launch-button"));

    await waitFor(() => expect(screen.getByTestId("launch-result")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Dismiss"));
    expect(screen.queryByTestId("launch-result")).not.toBeInTheDocument();
  });
});
