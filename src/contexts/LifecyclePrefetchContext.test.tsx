import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  LifecyclePrefetchProvider,
  useLifecyclePrefetch,
} from "./LifecyclePrefetchContext";
import * as deploymentApi from "../api/deploymentApi";
import * as cloudContext from "./CloudProviderContext";

vi.mock("../api/deploymentApi");
vi.mock("./CloudProviderContext");

const TestComponent = () => {
  const state = useLifecyclePrefetch();
  return (
    <>
      {state.backfill.loading && <div>Backfill loading</div>}
      {state.backfill.error && (
        <div>Backfill error: {state.backfill.error.message}</div>
      )}
      {state.backfill.data && <div>Backfill loaded</div>}
      {state.live.loading && <div>Live loading</div>}
      {state.live.error && <div>Live error: {state.live.error.message}</div>}
      {state.live.data && <div>Live loaded</div>}
    </>
  );
};

describe("LifecyclePrefetchContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cloudContext, "useCloudProvider").mockReturnValue({
      target: "gcp",
      switchTarget: vi.fn(),
      apiBaseUrl: "http://localhost:8004",
      switching: false,
    });
  });

  it("provides initial state with empty cache", () => {
    vi.spyOn(deploymentApi, "fetchVmDeployments").mockImplementation(
      () => new Promise(() => {}),
    );
    vi.spyOn(deploymentApi, "getLiveStatus").mockImplementation(
      () => new Promise(() => {}),
    );

    render(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );
    expect(screen.getByText("Backfill loading")).toBeInTheDocument();
    expect(screen.getByText("Live loading")).toBeInTheDocument();
  });

  it("fetches both backfill and live on mount", async () => {
    const mockVmDeployments = { active: [], recent: [], archive_days: 7 };
    const mockLiveStatus = { rows: [], refreshed_at: new Date().toISOString() };

    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue(
      mockVmDeployments,
    );
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue(mockLiveStatus);

    render(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Backfill loaded")).toBeInTheDocument();
      expect(screen.getByText("Live loaded")).toBeInTheDocument();
    });
  });

  it("handles backfill fetch error", async () => {
    const backfillError = new Error("VM deployments failed");
    const mockLiveStatus = { rows: [], refreshed_at: new Date().toISOString() };

    vi.spyOn(deploymentApi, "fetchVmDeployments").mockRejectedValue(
      backfillError,
    );
    vi.spyOn(deploymentApi, "getLiveStatus").mockResolvedValue(mockLiveStatus);

    render(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Backfill error: VM deployments failed"),
      ).toBeInTheDocument();
      expect(screen.getByText("Live loaded")).toBeInTheDocument();
    });
  });

  it("handles live fetch error", async () => {
    const liveError = new Error("Live status failed");
    const mockVmDeployments = { active: [], recent: [], archive_days: 7 };

    vi.spyOn(deploymentApi, "fetchVmDeployments").mockResolvedValue(
      mockVmDeployments,
    );
    vi.spyOn(deploymentApi, "getLiveStatus").mockRejectedValue(liveError);

    render(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Live error: Live status failed"),
      ).toBeInTheDocument();
      expect(screen.getByText("Backfill loaded")).toBeInTheDocument();
    });
  });

  it("throws error when useLifecyclePrefetch used outside provider", () => {
    const ComponentWithoutProvider = () => {
      useLifecyclePrefetch();
      return null;
    };

    expect(() => {
      render(<ComponentWithoutProvider />);
    }).toThrow(
      "useLifecyclePrefetch must be used within LifecyclePrefetchProvider",
    );
  });

  it("F.2 — no re-fetch when all caches are warm (simulates sub-tab navigation)", async () => {
    // Initial data returned on first fetch.
    const mockVmDeployments = { active: [], recent: [], archive_days: 7 };
    const mockLiveStatus = { rows: [], refreshed_at: new Date().toISOString() };

    const fetchVmSpy = vi
      .spyOn(deploymentApi, "fetchVmDeployments")
      .mockResolvedValue(mockVmDeployments);
    const getLiveSpy = vi
      .spyOn(deploymentApi, "getLiveStatus")
      .mockResolvedValue(mockLiveStatus);

    // Stub global fetch for monitor endpoints (experiments + scheduled).
    const globalFetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ jobs: [], total: 0, queried_at: "", cloud: "gcp", env: "dev" }),
    } as Response);

    const { rerender } = render(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );

    // Wait until the initial load completes for backfill + live (experiments +
    // scheduled come through global fetch and land in EXPERIMENTS_SUCCESS /
    // SCHEDULED_SUCCESS, so we just wait for the api spies to be called).
    await waitFor(() => {
      expect(fetchVmSpy).toHaveBeenCalledTimes(1);
      expect(getLiveSpy).toHaveBeenCalledTimes(1);
    });

    const fetchCount = globalFetchSpy.mock.calls.length;
    const vmCount = fetchVmSpy.mock.calls.length;
    const liveCount = getLiveSpy.mock.calls.length;

    // Re-render without changing cloud target — this simulates navigating
    // between Monitor sub-tabs (a purely local state change).
    rerender(
      <LifecyclePrefetchProvider>
        <TestComponent />
      </LifecyclePrefetchProvider>,
    );

    // Give React one tick to process any effects.
    await new Promise<void>((r) => setTimeout(r, 30));

    // Cache is warm: no additional fetches should have fired.
    expect(globalFetchSpy.mock.calls.length).toBe(fetchCount);
    expect(fetchVmSpy).toHaveBeenCalledTimes(vmCount);
    expect(getLiveSpy).toHaveBeenCalledTimes(liveCount);

    globalFetchSpy.mockRestore();
  });
});
