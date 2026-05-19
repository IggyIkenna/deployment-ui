import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExperimentsSubTab } from "./ExperimentsSubTab";
import * as lifecyclePrefetchCtx from "../../contexts/LifecyclePrefetchContext";
import * as cloudContext from "../../contexts/CloudProviderContext";

vi.mock("../../contexts/LifecyclePrefetchContext");
vi.mock("../../contexts/CloudProviderContext");

const _makeState = (
  override: Partial<ReturnType<typeof lifecyclePrefetchCtx.useLifecyclePrefetch>>,
) => ({
  backfill: { data: null, loading: false, error: null, fetchedAt: null },
  live: { data: null, loading: false, error: null, fetchedAt: null },
  experiments: { data: null, loading: false, error: null, fetchedAt: null },
  scheduled: { data: null, loading: false, error: null, fetchedAt: null },
  ...override,
});

describe("ExperimentsSubTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cloudContext, "useCloudProvider").mockReturnValue({
      target: "gcp",
      switchTarget: vi.fn(),
      apiBaseUrl: "http://localhost:8004",
      switching: false,
    });
  });

  it("shows skeleton when loading", () => {
    vi.mocked(lifecyclePrefetchCtx.useLifecyclePrefetch).mockReturnValue(
      _makeState({
        experiments: { data: null, loading: true, error: null, fetchedAt: null },
      }),
    );
    const { container } = render(<ExperimentsSubTab />);
    expect(screen.getByText("Loading experiment jobs…")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows error when fetch failed", () => {
    vi.mocked(lifecyclePrefetchCtx.useLifecyclePrefetch).mockReturnValue(
      _makeState({
        experiments: {
          data: null,
          loading: false,
          error: new Error("Network error"),
          fetchedAt: null,
        },
      }),
    );
    render(<ExperimentsSubTab />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("shows empty state when no jobs", () => {
    vi.mocked(lifecyclePrefetchCtx.useLifecyclePrefetch).mockReturnValue(
      _makeState({
        experiments: {
          data: { jobs: [], total: 0, queried_at: "", cloud: "gcp", env: "dev" },
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      }),
    );
    render(<ExperimentsSubTab />);
    expect(screen.getByText(/No experiment jobs/)).toBeInTheDocument();
  });

  it("renders job rows when experiments loaded", () => {
    vi.mocked(lifecyclePrefetchCtx.useLifecyclePrefetch).mockReturnValue(
      _makeState({
        experiments: {
          data: {
            jobs: [
              {
                deployment_id: "dep-1",
                vm_name: "ml-train-abc123",
                experiment_kind: "ml_training",
                asset_group: "cefi",
                task: "train",
                status: "running",
                started_at: "2026-05-19T10:00:00Z",
                last_heartbeat_at: "2026-05-19T10:05:00Z",
                completed_at: null,
                exit_code: null,
                rows_in: 100,
                rows_out: 95,
                rows_error: 0,
                log_uri: "",
              },
            ],
            total: 1,
            queried_at: "",
            cloud: "gcp",
            env: "dev",
          },
          loading: false,
          error: null,
          fetchedAt: Date.now(),
        },
      }),
    );
    render(<ExperimentsSubTab />);
    expect(screen.getByText("ml-train-abc123")).toBeInTheDocument();
    expect(screen.getByText("ML Training")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});
