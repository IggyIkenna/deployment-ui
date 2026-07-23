import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ArtifactPipeline } from "./ArtifactPipeline";
import * as api from "../api/deploymentApi";

// The page eagerly fetches BOTH live views (Pipeline + Deploy timeline) on mount, so both client
// calls are mocked in every test even when a given test only asserts on one of them. Fixtures cover
// success / failure / dup / cross-lane / AWS (builds) and new / config / failed / live (deploys), so
// the stat bands, row filters, and the failure drawer are all exercised.
vi.mock("../api/deploymentApi", () => ({
  getArtifactBuilds: vi.fn(),
  getArtifactDeploys: vi.fn(),
}));

const builds: api.BuildsResponse = {
  days: 7,
  start_date: "2026-07-15",
  end_date: "2026-07-21",
  generated_at: "2026-07-21T14:00:00Z",
  rows: [
    {
      repo: "deployment-api",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      trigger: "deployment-api-build",
      sha: "a557471",
      branch: "main",
      started_at: "2026-07-21T13:29:15Z",
      duration: "9m02s",
      produced: "asia-northeast1-docker.pkg.dev/x/deployment-api:a557471",
      build_id: "b-1",
      failure: "",
      failure_type: "",
      failure_detail: "",
      log_url: "",
      dup: false,
      cross_lane: false,
      steps: [],
    },
    {
      repo: "market-tick-data-service",
      lane: "image",
      cloud: "gcp",
      status: "FAILURE",
      trigger: "mtds-build",
      sha: "16204df",
      branch: "main",
      started_at: "2026-07-21T12:10:00Z",
      duration: "1m18s",
      produced: "",
      build_id: "b-2",
      failure: "docker build exited 1",
      failure_type: "USER_BUILD_STEP",
      failure_detail: "Step #3 - 'docker-build': COPY failed: no source files",
      log_url: "https://console.cloud.google.com/cloud-build/builds/mock",
      dup: false,
      cross_lane: false,
      steps: [
        { name: "lint", status: "SUCCESS", seconds: 4 },
        { name: "docker-build", status: "FAILURE", seconds: 74 },
      ],
    },
    {
      repo: "deployment-service",
      lane: "image",
      cloud: "gcp",
      status: "SUCCESS",
      trigger: "ds-build",
      sha: "f000ee3",
      branch: "main",
      started_at: "2026-07-21T11:00:00Z",
      duration: "3m42s",
      produced: "",
      build_id: "b-3",
      failure: "",
      failure_type: "",
      failure_detail: "",
      log_url: "",
      dup: true,
      cross_lane: false,
      steps: [],
    },
    {
      repo: "execution-service",
      lane: "image",
      cloud: "aws",
      status: "SUCCESS",
      trigger: "codebuild-execution",
      sha: "9e11c02",
      branch: "main",
      started_at: "2026-07-20T09:00:00Z",
      duration: "5m03s",
      produced: "",
      build_id: "b-4",
      failure: "",
      failure_type: "",
      failure_detail: "",
      log_url: "",
      dup: false,
      cross_lane: false,
      steps: [],
    },
  ],
  stats: {
    total: 4,
    success_rate: 75.0,
    failed: 1,
    median_duration_sec: 479,
    wasted_dup: 1,
  },
};

const deploys: api.DeploysResponse = {
  days: 7,
  start_date: "2026-07-15",
  end_date: "2026-07-21",
  generated_at: "2026-07-21T14:00:00Z",
  rows: [
    {
      workload: "uts-shared-deployment-api",
      revision: "uts-shared-deployment-api-00255-rtk",
      cloud: "gcp",
      digest: "sha256:c05dd3d678ef",
      built_from: "",
      resolvable: false,
      change_type: "new",
      at: "2026-07-21T13:00:00Z",
      held_for: "",
      live: true,
      deployer: "Cloud Build",
      link_kind: "revision",
      section: "",
    },
    {
      workload: "uts-shared-deployment-api",
      revision: "uts-shared-deployment-api-00254-djz",
      cloud: "gcp",
      digest: "sha256:261137b83e42",
      built_from: "",
      resolvable: false,
      change_type: "config",
      at: "2026-07-21T10:24:00Z",
      held_for: "2h36m",
      live: false,
      deployer: "Cloud Build",
      link_kind: "revision",
      section: "",
    },
    {
      workload: "deployment-service",
      revision: "deployment-service-00001-lqw",
      cloud: "gcp",
      digest: "sha256:83803e21331f",
      built_from: "",
      resolvable: false,
      change_type: "failed",
      at: "2026-07-20T18:00:00Z",
      held_for: "",
      live: true,
      deployer: "unified-trading-sa",
      link_kind: "revision",
      section: "",
    },
  ],
  stats: {
    total: 3,
    config_only_pct: 33.3,
    live_now: 2,
    failed: 1,
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ArtifactPipeline />
    </MemoryRouter>,
  );
}

describe("ArtifactPipeline", () => {
  beforeEach(() => {
    vi.mocked(api.getArtifactBuilds).mockResolvedValue(builds);
    vi.mocked(api.getArtifactDeploys).mockResolvedValue(deploys);
  });

  it("defaults to a 7-day window and the live Pipeline tab", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toHaveTextContent("4"));
    expect(screen.getByTestId("artifact-window-7")).toHaveStyle({ background: "var(--color-accent-blue)" });
    expect(api.getArtifactBuilds).toHaveBeenCalledWith(expect.objectContaining({ days: 7 }));
  });

  it("renders the Pipeline stat band + one row per build", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toHaveTextContent("4"));
    expect(screen.getByTestId("pipe-stat-success")).toHaveTextContent("75%");
    expect(screen.getByTestId("pipe-stat-failed")).toHaveTextContent("1");
    expect(screen.getByTestId("pipe-stat-median")).toHaveTextContent("7m59s"); // 479s
    expect(screen.getByTestId("pipe-stat-wasted")).toHaveTextContent("1");
    expect(screen.getAllByTestId("pipe-row")).toHaveLength(4);
  });

  it("filters Pipeline rows client-side without changing the stat band", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));

    fireEvent.click(screen.getByTestId("pipe-filter-fail"));
    let rows = screen.getAllByTestId("pipe-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("market-tick-data-service");
    // stats are over the whole window, not the filtered subset
    expect(screen.getByTestId("pipe-stat-total")).toHaveTextContent("4");

    fireEvent.click(screen.getByTestId("pipe-filter-aws"));
    rows = screen.getAllByTestId("pipe-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("execution-service");

    fireEvent.click(screen.getByTestId("pipe-filter-all"));
    expect(screen.getAllByTestId("pipe-row")).toHaveLength(4);
  });

  it("expands a failed build to show its step timeline and failure detail", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));
    // Filter to the single failure row so the click target is unambiguous.
    fireEvent.click(screen.getByTestId("pipe-filter-fail"));
    const rows = screen.getAllByTestId("pipe-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("market-tick-data-service")).toBeInTheDocument();
    fireEvent.click(rows[0]);
    expect(screen.getByText("Step timeline")).toBeInTheDocument();
    expect(screen.getByText(/COPY failed: no source files/i)).toBeInTheDocument();
  });

  it("switches to the live Deploy timeline tab and renders its data-derived stat band", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("artifact-tab-deploy"));
    await waitFor(() => expect(screen.getByTestId("artifact-deploy-view")).toBeInTheDocument());
    expect(screen.getByTestId("deploy-stat-total")).toHaveTextContent("3");
    expect(screen.getByTestId("deploy-stat-config")).toHaveTextContent("33.3%");
    expect(screen.getByTestId("deploy-stat-live")).toHaveTextContent("2");
    expect(screen.getByTestId("deploy-stat-failed")).toHaveTextContent("1");
    expect(screen.getAllByTestId("deploy-row")).toHaveLength(3);
  });

  it("filters Deploy timeline rows without a network round-trip (client-side)", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-deploy"));
    await waitFor(() => expect(screen.getAllByTestId("deploy-row")).toHaveLength(3));
    const callsBefore = vi.mocked(api.getArtifactDeploys).mock.calls.length;

    fireEvent.click(screen.getByTestId("deploy-filter-code"));
    let rows = screen.getAllByTestId("deploy-row");
    expect(rows).toHaveLength(2); // hides the one config-only row
    expect(rows.some((r) => r.textContent?.includes("config-only"))).toBe(false);

    fireEvent.click(screen.getByTestId("deploy-filter-live"));
    rows = screen.getAllByTestId("deploy-row");
    expect(rows).toHaveLength(2); // both live=true rows, including the failed-but-live one

    fireEvent.click(screen.getByTestId("deploy-filter-fail"));
    rows = screen.getAllByTestId("deploy-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("deployment-service");

    // stats stay over the whole window regardless of filter
    expect(screen.getByTestId("deploy-stat-total")).toHaveTextContent("3");
    expect(vi.mocked(api.getArtifactDeploys).mock.calls.length).toBe(callsBefore); // no refetch
  });

  it("committing an explicit date range refetches both views with start/end, not days", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toBeInTheDocument());
    vi.mocked(api.getArtifactBuilds).mockClear();
    vi.mocked(api.getArtifactDeploys).mockClear();

    fireEvent.change(screen.getByTestId("artifact-range-start"), { target: { value: "2026-07-01" } });
    await waitFor(() =>
      expect(api.getArtifactBuilds).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-07-01" })),
    );
    expect(api.getArtifactDeploys).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-07-01" }));
    // a preset button no longer reads as active once a custom range is in effect
    expect(screen.getByTestId("artifact-window-7")).not.toHaveStyle({ background: "var(--color-accent-blue)" });
  });

  it("choosing a window preset clears any custom range", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("artifact-range-start"), { target: { value: "2026-07-01" } });
    await waitFor(() =>
      expect(screen.getByTestId("artifact-window-7")).not.toHaveStyle({ background: "var(--color-accent-blue)" }),
    );

    fireEvent.click(screen.getByTestId("artifact-window-30"));
    await waitFor(() =>
      expect(screen.getByTestId("artifact-window-30")).toHaveStyle({ background: "var(--color-accent-blue)" }),
    );
    expect(api.getArtifactBuilds).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 30, startDate: undefined, endDate: undefined }),
    );
  });

  it("shows a placeholder for the not-yet-wired tabs and returns to a live tab", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("artifact-tab-run"));
    expect(screen.getByTestId("artifact-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-pipe-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("artifact-tab-pipe"));
    expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument();
  });

  it("the help dialog explains both live tabs' columns and closes cleanly", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toBeInTheDocument());

    expect(screen.queryByText("Artifact Pipeline — quick guide")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("artifact-help-button"));
    expect(screen.getByText("Artifact Pipeline — quick guide")).toBeInTheDocument();

    // Covers the page-level controls and both live tabs' column glossaries — not just a title. Uses
    // text unique to the dialog's explanatory copy (some HelpTerm labels, e.g. "Why it failed",
    // collide with the live table's own column headers still rendered behind the dialog).
    expect(screen.getByText("Using this page")).toBeInTheDocument();
    expect(screen.getByText("Pipeline tab — every build")).toBeInTheDocument();
    expect(screen.getByText("Deploy timeline tab — every deploy")).toBeInTheDocument();
    expect(screen.getByText(/expand its full step-by-step timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/looks forward/i)).toBeInTheDocument();

    // The Dialog component closes on Escape (its own documented behavior) — cheaper + more robust
    // than targeting its icon-only close button, which carries no accessible name.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Artifact Pipeline — quick guide")).not.toBeInTheDocument();
  });
});
