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
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
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
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
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
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      const radio = screen.getByLabelText(/tarball-from-local \(bundle my local code first\)/);
      expect((radio as HTMLInputElement).disabled).toBe(false);
    });

    it("shows blocked badge with env name when staging", async () => {
      mockRegionFetch("staging");
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
      await waitFor(() => expect(screen.getByText(/blocked in staging/)).toBeTruthy());
    });
  });

  describe("auto-launch (Phase 2)", () => {
    function makeLaunchResult(
      overrides: Partial<apiClient.DeployMissingLaunchResult> = {},
    ): apiClient.DeployMissingLaunchResult {
      return {
        service: "market-tick-data-service",
        asset_group: "tradfi",
        shard_key: "venue=CME/data_type=ohlcv_1m/date=2024-01-02",
        shard_key_hash: "abcd1234",
        vm_name: "dm-abcd1234-20260517-120000",
        correlation_id: "corr-001",
        events_uri: "gs://bucket/events/abcd1234",
        dry_run: false,
        started_confirmed: true,
        inflight_vm_name: null,
        ...overrides,
      };
    }

    beforeEach(() => {
      localStorage.clear();
      vi.spyOn(apiClient, "postDeployMissingPreview").mockResolvedValue(makeResponse());
    });

    async function openPreview() {
      fireEvent.click(screen.getByText("Deploy Missing"));
      await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    }

    it("auto-launch checkbox is rendered after preview opens", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      expect(screen.getByLabelText("Enable auto-launch")).toBeTruthy();
    });

    it("Launch VM button is hidden when auto-launch is disabled", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      expect(screen.queryByLabelText("Launch VM for this shard")).toBeNull();
    });

    it("Launch VM button appears after enabling auto-launch toggle", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      expect(screen.getByLabelText("Launch VM for this shard")).toBeTruthy();
    });

    it("clicking Launch VM shows confirmation dialog with shard_key", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() =>
        expect(screen.getByRole("alertdialog")).toBeTruthy(),
      );
      expect(screen.getByText(/Launch GCE VM for shard/)).toBeTruthy();
    });

    it("Cancel hides the confirmation dialog", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByLabelText("Cancel VM launch"));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("Confirm calls postDeployMissingLaunch + shows result panel", async () => {
      const launchSpy = vi
        .spyOn(apiClient, "postDeployMissingLaunch")
        .mockResolvedValue(makeLaunchResult());
      render(
        <DeployMissingButton
          service="market-tick-data-service"
          assetGroup="tradfi"
          rowKey={{ venue: "CME" }}
        />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(launchSpy).toHaveBeenCalledTimes(1));
      expect(launchSpy).toHaveBeenCalledWith({
        service: "market-tick-data-service",
        asset_group: "tradfi",
        row_key: { venue: "CME" },
      });
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      expect(screen.getByText(/VM launched \+ STARTED/)).toBeTruthy();
    });

    it("shows vm_name and events_uri in the result panel", async () => {
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockResolvedValue(
        makeLaunchResult({
          vm_name: "dm-deadbeef-20260517-120000",
          events_uri: "gs://bucket/events/deadbeef",
        }),
      );
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      expect(screen.getByText("dm-deadbeef-20260517-120000")).toBeTruthy();
      expect(screen.getByText("gs://bucket/events/deadbeef")).toBeTruthy();
    });

    it("shows 'Existing in-flight VM returned' when inflight_vm_name is set", async () => {
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockResolvedValue(
        makeLaunchResult({ inflight_vm_name: "dm-existing-vm", started_confirmed: false }),
      );
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      expect(screen.getByText(/Existing in-flight VM returned/)).toBeTruthy();
    });

    it("shows 'STARTED poll timed out' when started_confirmed is false and no inflight vm", async () => {
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockResolvedValue(
        makeLaunchResult({ started_confirmed: false, inflight_vm_name: null }),
      );
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      expect(screen.getByText(/STARTED poll timed out/)).toBeTruthy();
    });

    it("shows 'Launching…' while the launch request is in flight", async () => {
      let resolve!: (v: apiClient.DeployMissingLaunchResult) => void;
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockImplementation(
        () => new Promise<apiClient.DeployMissingLaunchResult>((r) => { resolve = r; }),
      );
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(screen.getByText(/Launching/)).toBeTruthy());
      resolve(makeLaunchResult());
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    });

    it("shows launch error panel when postDeployMissingLaunch rejects", async () => {
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockRejectedValue(
        new Error("rate limit exceeded"),
      );
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() =>
        expect(screen.getByText(/Launch failed/)).toBeTruthy(),
      );
      expect(screen.getByText(/rate limit exceeded/)).toBeTruthy();
    });

    it("close resets launch state (result panel gone after close + reopen)", async () => {
      vi.spyOn(apiClient, "postDeployMissingLaunch").mockResolvedValue(makeLaunchResult());
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      fireEvent.click(screen.getByLabelText("Launch VM for this shard"));
      await waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Confirm VM launch" }));
      await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
      fireEvent.click(screen.getByLabelText("Close"));
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("persists auto-launch preference to localStorage on toggle", async () => {
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      expect(localStorage.getItem("deployment-ui/deploy-missing-auto-launch-enabled")).toBeNull();
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      expect(localStorage.getItem("deployment-ui/deploy-missing-auto-launch-enabled")).toBe("true");
      fireEvent.click(screen.getByLabelText("Enable auto-launch"));
      expect(localStorage.getItem("deployment-ui/deploy-missing-auto-launch-enabled")).toBe("false");
    });

    it("restores auto-launch=true preference from localStorage on mount", async () => {
      localStorage.setItem("deployment-ui/deploy-missing-auto-launch-enabled", "true");
      render(
        <DeployMissingButton service="mtds" assetGroup="cefi" rowKey={{ venue: "BINANCE" }} />,
      );
      await openPreview();
      expect(screen.getByLabelText("Launch VM for this shard")).toBeTruthy();
    });
  });
});
