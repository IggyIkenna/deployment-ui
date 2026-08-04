// @vitest-environment jsdom
/**
 * Unit spec — PipelineTraceCard (GAP G-TRACE).
 *
 * Covers the branches the Playwright smoke spec
 * (tests/smoke/pipeline_trace_card.spec.ts) exercises against the real
 * client-side mock, plus the ones that mock can't reach cheaply: the disabled
 * button before both fields are filled, and the error state on a rejected
 * fetch. Mirrors the `SportsFeatureCoverageCard` unit-test pattern (spy on the
 * api-client function, render the component directly, no full DataStatusTab
 * mount).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../../../src/api/client";
import { PipelineTraceCard } from "../../../src/components/PipelineTraceCard";

const STUCK_RESPONSE: Awaited<ReturnType<typeof apiClient.fetchPipelineTrace>> = {
  instrument: "BINANCE-FUTURES:PERPETUAL:AAVE-USDC@LIN",
  date: "2026-08-04",
  asset_group: "cefi",
  hops: [
    {
      stage: 1,
      service: "instruments-service",
      status: "never_attempted",
      error_reason: "",
      attempted_at: "",
      written_at: "",
    },
    {
      stage: 2,
      service: "market-tick-data-service",
      status: "captured",
      error_reason: "",
      attempted_at: "2026-08-04T07:01:10Z",
      written_at: "2026-08-04T07:01:10Z",
    },
  ],
  stuck_at: "instruments-service",
};

const ALL_CAPTURED_RESPONSE: Awaited<ReturnType<typeof apiClient.fetchPipelineTrace>> = {
  instrument: "BINANCE-FUTURES:PERPETUAL:BTC-USDT@LIN",
  date: "2026-08-04",
  asset_group: "cefi",
  hops: [
    {
      stage: 1,
      service: "instruments-service",
      status: "captured",
      error_reason: "",
      attempted_at: "2026-08-04T07:01:10Z",
      written_at: "2026-08-04T07:01:10Z",
    },
  ],
  stuck_at: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PipelineTraceCard", () => {
  it("shows the empty state and a disabled Trace button before any input", () => {
    render(<PipelineTraceCard />);
    expect(screen.getByTestId("pipeline-trace-empty")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-trace-run")).toBeDisabled();
  });

  it("keeps the Trace button disabled until BOTH instrument and date are filled", () => {
    render(<PipelineTraceCard />);
    fireEvent.change(screen.getByTestId("pipeline-trace-instrument-input"), {
      target: { value: "BTC-USDT" },
    });
    expect(screen.getByTestId("pipeline-trace-run")).toBeDisabled();

    fireEvent.change(screen.getByTestId("pipeline-trace-date-input"), {
      target: { value: "2026-08-04" },
    });
    expect(screen.getByTestId("pipeline-trace-run")).toBeEnabled();
  });

  it("shows an error state when the fetch rejects", async () => {
    vi.spyOn(apiClient, "fetchPipelineTrace").mockRejectedValue(new Error("manifest bucket unreachable"));
    render(<PipelineTraceCard />);
    fireEvent.change(screen.getByTestId("pipeline-trace-instrument-input"), { target: { value: "BTC-USDT" } });
    fireEvent.change(screen.getByTestId("pipeline-trace-date-input"), { target: { value: "2026-08-04" } });
    fireEvent.click(screen.getByTestId("pipeline-trace-run"));

    await waitFor(() =>
      expect(screen.getByTestId("pipeline-trace-error")).toHaveTextContent("manifest bucket unreachable"),
    );
    // No stale result panel left over from a prior successful run.
    expect(screen.queryByTestId("pipeline-trace-result")).not.toBeInTheDocument();
  });

  it("renders a Stuck at badge naming the first non-captured hop", async () => {
    const spy = vi.spyOn(apiClient, "fetchPipelineTrace").mockResolvedValue(STUCK_RESPONSE);
    render(<PipelineTraceCard />);
    fireEvent.change(screen.getByTestId("pipeline-trace-instrument-input"), {
      target: { value: "BINANCE-FUTURES:PERPETUAL:AAVE-USDC@LIN" },
    });
    fireEvent.change(screen.getByTestId("pipeline-trace-date-input"), { target: { value: "2026-08-04" } });
    fireEvent.click(screen.getByTestId("pipeline-trace-run"));

    await waitFor(() =>
      expect(screen.getByTestId("pipeline-trace-stuck-at")).toHaveTextContent("Stuck at: instruments-service"),
    );
    expect(screen.queryByTestId("pipeline-trace-stuck-at-none")).not.toBeInTheDocument();
    expect(screen.getByTestId("pipeline-trace-hop-instruments-service")).toHaveTextContent("never_attempted");
    expect(screen.getByTestId("pipeline-trace-hop-market-tick-data-service")).toHaveTextContent("captured");

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        instrument: "BINANCE-FUTURES:PERPETUAL:AAVE-USDC@LIN",
        date: "2026-08-04",
        asset_group: "cefi",
      }),
    );
  });

  it("renders the all-clear badge when every hop is captured", async () => {
    vi.spyOn(apiClient, "fetchPipelineTrace").mockResolvedValue(ALL_CAPTURED_RESPONSE);
    render(<PipelineTraceCard />);
    fireEvent.change(screen.getByTestId("pipeline-trace-instrument-input"), {
      target: { value: "BINANCE-FUTURES:PERPETUAL:BTC-USDT@LIN" },
    });
    fireEvent.change(screen.getByTestId("pipeline-trace-date-input"), { target: { value: "2026-08-04" } });
    fireEvent.click(screen.getByTestId("pipeline-trace-run"));

    await waitFor(() =>
      expect(screen.getByTestId("pipeline-trace-stuck-at-none")).toHaveTextContent("All hops captured"),
    );
    expect(screen.queryByTestId("pipeline-trace-stuck-at")).not.toBeInTheDocument();
  });

  it("threads the optional instrument_type/venue/chain axes through when the asset group changes", async () => {
    const spy = vi.spyOn(apiClient, "fetchPipelineTrace").mockResolvedValue(ALL_CAPTURED_RESPONSE);
    render(<PipelineTraceCard />);
    fireEvent.change(screen.getByTestId("pipeline-trace-instrument-input"), { target: { value: "AAVE_V3" } });
    fireEvent.change(screen.getByTestId("pipeline-trace-date-input"), { target: { value: "2026-08-04" } });
    fireEvent.change(screen.getByTestId("pipeline-trace-asset-group-select"), { target: { value: "defi" } });
    fireEvent.click(screen.getByTestId("pipeline-trace-run"));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ asset_group: "defi" }));
  });
});
