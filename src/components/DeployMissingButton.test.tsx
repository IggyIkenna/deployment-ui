import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import { DeployMissingButton } from "./DeployMissingButton";

/**
 * DeployMissingButton tests — drilldown plan Phase 3.
 *
 * Branch / function coverage for the surgical-recovery widget. Mocks the
 * /deploy-missing-preview endpoint at the api-client module level + drives
 * fireEvent against the rendered tree.
 */

function makeResponse(
  overrides: Partial<apiClient.DeployMissingPreviewResponse> = {},
): apiClient.DeployMissingPreviewResponse {
  return {
    service: "market-tick-data-service",
    asset_group: "tradfi",
    row_key: { venue: "CME", data_type: "ohlcv_1m", date: "2024-01-02" },
    shard_key: "venue=CME/data_type=ohlcv_1m/date=2024-01-02",
    launcher_script: "deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh",
    command:
      "bash deployment-service/scripts/vm/launch-tradfi-backfill-vm.sh --shard-key venue=CME/...",
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
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the button with default label", () => {
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    expect(screen.getByText("Deploy Missing")).toBeTruthy();
  });

  it("uses a custom label override", () => {
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
        label="Recover Now"
      />,
    );
    expect(screen.getByText("Recover Now")).toBeTruthy();
  });

  it("fetches the preview + renders the command on click", async () => {
    const spy = vi
      .spyOn(apiClient, "postDeployMissingPreview")
      .mockResolvedValue(makeResponse());
    render(
      <DeployMissingButton
        service="market-tick-data-service"
        assetGroup="tradfi"
        rowKey={{ venue: "CME" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeTruthy(),
    );
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
    vi.spyOn(apiClient, "postDeployMissingPreview").mockRejectedValue(
      new Error("backend exploded"),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeTruthy(),
    );
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
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() =>
      expect(screen.getByText("Building...")).toBeTruthy(),
    );
    resolve(makeResponse());
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  });

  it("renders warnings when the response has them (tarball-from-local mode)", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({
        mode: "tarball-from-local",
        warnings: ["LOCAL-ONLY", "UNCOMMITTED CHANGES"],
      }),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/Mode warning/)).toBeTruthy();
    expect(screen.getByText("LOCAL-ONLY")).toBeTruthy();
    expect(screen.getByText("UNCOMMITTED CHANGES")).toBeTruthy();
  });

  it("renders notes when the response has them", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({ notes: ["alpha-note", "beta-note"] }),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("alpha-note")).toBeTruthy());
    expect(screen.getByText("beta-note")).toBeTruthy();
  });

  it("hides notes section when notes array is empty", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({ notes: [] }),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(document.querySelector(".deploy-missing-notes")).toBeNull();
  });

  it("hides warnings section when warnings array is empty", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({ warnings: [] }),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(document.querySelector(".deploy-missing-warnings")).toBeNull();
  });

  it("copies the command to clipboard on copy click", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse({ command: "bash run.sh --foo" }),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => expect(writeTextSpy).toHaveBeenCalledWith("bash run.sh --foo"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeTruthy());
  });

  it("surfaces a copy error when clipboard.writeText rejects", async () => {
    writeTextSpy.mockRejectedValue(new Error("clipboard denied"));
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse(),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByText("Copy")).toBeTruthy());
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Copy failed/),
    );
  });

  it("closes the preview when × is clicked", async () => {
    vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(
      makeResponse(),
    );
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("re-fetches when the mode toggle is switched while preview is open", async () => {
    const spy = vi
      .spyOn(apiClient, "postDeployMissingPreview")
      .mockResolvedValue(makeResponse({ mode: "preview" }));
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    fireEvent.click(screen.getByText("Deploy Missing"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockResolvedValue(
      makeResponse({ mode: "tarball-from-local", warnings: ["LOCAL-ONLY"] }),
    );
    fireEvent.click(
      screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/),
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "tarball-from-local" }),
    );
  });

  it("noops the copy handler before any preview is fetched", () => {
    // Without a preview, handleCopy short-circuits — guards against
    // navigator.clipboard being touched on the empty path.
    render(
      <DeployMissingButton
        service="mtds"
        assetGroup="cefi"
        rowKey={{ venue: "BINANCE" }}
      />,
    );
    // No preview rendered → no Copy button to click; this asserts the
    // initial render path (loading=false, preview=null, error=null).
    expect(screen.queryByText("Copy")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
