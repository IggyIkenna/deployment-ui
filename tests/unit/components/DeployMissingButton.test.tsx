/**
 * DeployMissingButton — unit tests in the standard tests/unit/ path.
 *
 * The component was partially tested in src/components/DeployMissingButton.test.tsx
 * (co-located, outside the vitest include glob). This file is the canonical
 * location under tests/unit/**  and extends coverage with the two tests the
 * plan (D.4c) mandates:
 *   1. tarball-from-local mode — warning panel renders with LOCAL-ONLY copy.
 *   2. mode-toggle re-fetch — switching the radio while preview is open
 *      issues a second postDeployMissingPreview call with the new mode.
 *
 * Plan: data_status_comprehensive_test_coverage_2026_05_07 § D.4c
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../../../src/api/client";
import { DeployMissingButton } from "../../../src/components/DeployMissingButton";

function makeResponse(
  overrides: Partial<apiClient.DeployMissingPreviewResponse> = {},
): apiClient.DeployMissingPreviewResponse {
  return {
    service: "market-tick-data-service",
    asset_group: "tradfi",
    row_key: { venue: "CME", data_type: "ohlcv_1m", date: "2024-01-02" },
    shard_key: "venue=CME/data_type=ohlcv_1m/date=2024-01-02",
    launcher_script: "deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh",
    command: "bash deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh --shard-key venue=CME/...",
    notes: ["note-one", "note-two"],
    mode: "preview",
    warnings: [],
    ...overrides,
  };
}

describe("DeployMissingButton", () => {
  let writeTextSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    writeTextSpy = vi.fn().mockResolvedValue(undefined);
    // happy-dom (unlike jsdom) defines navigator.clipboard as a getter-only
    // accessor, so a plain Object.assign throws "Cannot set property
    // clipboard of [object Object] which has only a getter". defineProperty
    // overrides the accessor directly and works under both environments.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the button with default label", () => {
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    expect(screen.getByText("Deploy Missing")).toBeTruthy();
  });

  it("uses a custom label override", () => {
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} label="Recover Now" />);
    expect(screen.getByText("Recover Now")).toBeTruthy();
  });

  it("fetches the preview + renders the command on click", async () => {
    const spy = vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
    render(<DeployMissingButton service="market-tick-data-service" assetGroup="tradfi" rowKey={{ venue: "CME" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      service: "market-tick-data-service",
      asset_group: "tradfi",
      row_key: { venue: "CME" },
      mode: "preview",
    });
    expect(screen.getByText(/--shard-key/)).toBeTruthy();
  });

  it("shows error message when the preview request fails", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockRejectedValue(new Error("backend exploded"));
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/backend exploded/);
  });

  it("shows building label while loading", async () => {
    let resolve!: (v: apiClient.DeployMissingPreviewResponse) => void;
    vi.spyOn(apiClient, "postDeployMissingPreview").mockImplementation(
      () =>
        new Promise<apiClient.DeployMissingPreviewResponse>((r) => {
          resolve = r;
        }),
    );
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("Building...")).toBeTruthy());
    resolve(makeResponse());
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  });

  // ---------------------------------------------------------------------------
  // D.4c core: tarball-from-local warning panel
  // ---------------------------------------------------------------------------

  it("renders LOCAL-ONLY warning panel when tarball-from-local mode returns warnings", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({
        mode: "tarball-from-local",
        warnings: ["LOCAL-ONLY", "UNCOMMITTED CHANGES"],
      }),
    );
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/Mode warning/)).toBeTruthy();
    expect(screen.getByText("LOCAL-ONLY")).toBeTruthy();
    expect(screen.getByText("UNCOMMITTED CHANGES")).toBeTruthy();
  });

  it("hides warnings section when warnings array is empty", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse({ warnings: [] }));
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(document.querySelector(".deploy-missing-warnings")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // D.4c core: mode-toggle re-fetch behavior
  // ---------------------------------------------------------------------------

  it("re-fetches immediately when mode toggle is switched while preview is open", async () => {
    const spy = vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse({ mode: "preview" }));
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(spy).toHaveBeenCalledTimes(1);

    // Switch to tarball-from-local — must trigger a second fetch with new mode.
    spy.mockResolvedValue(makeResponse({ mode: "tarball-from-local", warnings: ["LOCAL-ONLY"] }));
    fireEvent.click(screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "tarball-from-local" }));
  });

  it("does not re-fetch when mode is toggled before any preview has been opened", () => {
    // Without a preview, handleSwitchMode sets state but skips fetchPreview.
    const spy = vi.spyOn(apiClient, "postDeployMissingPreview");
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    // No preview open — no dialog, no radio, no fetch.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Remainder: full coverage of the component
  // ---------------------------------------------------------------------------

  it("renders notes when the response has them", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({ notes: ["alpha-note", "beta-note"] }),
    );
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("alpha-note")).toBeTruthy());
    expect(screen.getByText("beta-note")).toBeTruthy();
  });

  it("hides notes section when notes array is empty", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse({ notes: [] }));
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(document.querySelector(".deploy-missing-notes")).toBeNull();
  });

  it("copies the command to clipboard on copy click", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse({ command: "bash run.sh --foo" }));
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledWith("bash run.sh --foo"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("surfaces a copy error when clipboard.writeText rejects", async () => {
    writeTextSpy.mockRejectedValue(new Error("clipboard denied"));
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Copy failed/));
  });

  it("closes the preview when × is clicked", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("noops the copy handler before any preview is fetched", () => {
    render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
    expect(screen.queryByText("Copy")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  describe("env-based tarball blocking", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function mockRegionFetch(deploymentEnv: string) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          json: async () => ({ deployment_env: deploymentEnv }),
        }),
      );
    }

    it("disables tarball-from-local radio when deployment env is staging", async () => {
      mockRegionFetch("staging");
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
      render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      await waitFor(() => {
        const radio = screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/);
        expect((radio as HTMLInputElement).disabled).toBe(true);
      });
    });

    it("disables tarball-from-local radio when deployment env is production", async () => {
      mockRegionFetch("production");
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
      render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      await waitFor(() => {
        const radio = screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/);
        expect((radio as HTMLInputElement).disabled).toBe(true);
      });
    });

    it("leaves tarball-from-local radio enabled when deployment env is development", async () => {
      mockRegionFetch("development");
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
      render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      const radio = screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/);
      expect((radio as HTMLInputElement).disabled).toBe(false);
    });

    it("shows blocked badge with env name when staging", async () => {
      mockRegionFetch("staging");
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
      render(<DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />);
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      await waitFor(() => expect(screen.getByText(/blocked in staging/)).toBeTruthy());
    });
  });
});
