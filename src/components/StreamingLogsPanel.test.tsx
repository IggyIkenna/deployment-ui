import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StreamingLogsPanel } from "./StreamingLogsPanel";
import * as deploymentHook from "../hooks/useDeployEventStream";
import * as vmHook from "../hooks/useVmEventStream";

vi.mock("../hooks/useDeployEventStream");
vi.mock("../hooks/useVmEventStream");

describe("StreamingLogsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with deployment events when deploymentId provided", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [
        {
          event_type: "STARTED",
          timestamp: "2026-05-13T12:00:00Z",
          message: "Deployment started",
        },
      ],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    expect(screen.getByText("Deployment started")).toBeInTheDocument();
    expect(screen.getByText("STARTED")).toBeInTheDocument();
  });

  it("renders with VM events when vmName provided", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [
        {
          event_type: "PROGRESS",
          timestamp: "2026-05-13T12:01:00Z",
          message: "Processing rows",
        },
      ],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel vmName="vm-123" />);
    expect(screen.getByText("Processing rows")).toBeInTheDocument();
  });

  it("filters events by search text", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [
        {
          event_type: "STARTED",
          timestamp: "2026-05-13T12:00:00Z",
          message: "Deployment started",
        },
        {
          event_type: "ERROR",
          timestamp: "2026-05-13T12:01:00Z",
          message: "Connection failed",
        },
      ],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    const searchInput = screen.getByPlaceholderText("Search logs...");
    fireEvent.change(searchInput, { target: { value: "error" } });
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(screen.queryByText("Deployment started")).not.toBeInTheDocument();
  });

  it("toggles pause/resume button state", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [
        {
          event_type: "LOG",
          timestamp: "2026-05-13T12:00:00Z",
          message: "Test message",
        },
      ],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    const pauseBtn = screen.getByRole("button", { name: /Pause/ });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);
    expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
  });

  it("renders loading state", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [],
      loading: true,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    expect(screen.getByText("Loading events...")).toBeInTheDocument();
  });

  it("renders error state", () => {
    const testError = new Error("Stream failed");
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: testError,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    expect(screen.getByText(/Error: Stream failed/)).toBeInTheDocument();
  });

  it("disables download button when no logs", () => {
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(<StreamingLogsPanel deploymentId="dep-123" />);
    const downloadBtn = screen.getByRole("button", { name: /Download/ });
    expect(downloadBtn).toBeDisabled();
  });

  it("calls onClose when close button clicked", () => {
    const onCloseFn = vi.fn();
    vi.spyOn(deploymentHook, "useDeployEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });
    vi.spyOn(vmHook, "useVmEventStream").mockReturnValue({
      events: [],
      loading: false,
      error: null,
    });

    render(
      <StreamingLogsPanel deploymentId="dep-123" onClose={onCloseFn} />,
    );
    const closeBtn = screen.getByRole("button", { name: /Close/ });
    fireEvent.click(closeBtn);
    expect(onCloseFn).toHaveBeenCalled();
  });
});
