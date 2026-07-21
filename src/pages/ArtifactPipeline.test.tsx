import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ArtifactPipeline } from "./ArtifactPipeline";
import * as api from "../api/deploymentApi";

// The page fetches only the builds view; the other four tabs are static placeholders. Mock the one
// client call and drive the component with a fixture that covers success / failure / dup / cross-lane
// / AWS, so the stat band, row filters, and the failure drawer are all exercised.
vi.mock("../api/deploymentApi", () => ({
  getArtifactBuilds: vi.fn(),
}));

const builds: api.BuildsResponse = {
  days: 14,
  start_date: "2026-07-07",
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
  });

  it("defaults to the live Pipeline tab and renders the data-derived stat band", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toHaveTextContent("4"));
    expect(screen.getByTestId("pipe-stat-success")).toHaveTextContent("75%");
    expect(screen.getByTestId("pipe-stat-failed")).toHaveTextContent("1");
    expect(screen.getByTestId("pipe-stat-median")).toHaveTextContent("7m59s"); // 479s
    expect(screen.getByTestId("pipe-stat-wasted")).toHaveTextContent("1");
  });

  it("renders one row per build", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));
  });

  it("filters rows client-side without changing the stat band", async () => {
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

  it("shows a placeholder for the not-yet-wired tabs and returns to the live tab", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("artifact-tab-run"));
    expect(screen.getByTestId("artifact-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-pipe-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("artifact-tab-pipe"));
    expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument();
  });
});
