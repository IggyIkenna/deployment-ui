import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ArtifactPipeline } from "./ArtifactPipeline";
import * as api from "../api/deploymentApi";

// The page eagerly fetches all FIVE live views on mount, so every client call is mocked in every
// test even when a given test only asserts on one of them. Fixtures cover success / failure / dup /
// cross-lane / AWS (builds), new / config / failed / live (deploys), running / legacy / parked
// (images), ok / floating / unknown / hand (running), and every severity tier (health).
vi.mock("../api/deploymentApi", () => ({
  getArtifactBuilds: vi.fn(),
  getArtifactDeploys: vi.fn(),
  getArtifactImages: vi.fn(),
  getArtifactRunning: vi.fn(),
  getArtifactHealth: vi.fn(),
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

const images: api.ImagesResponse = {
  generated_at: "2026-07-23T12:00:00Z",
  rows: [
    {
      repo: "deployment-api",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 270,
      tags: ["a557471", "0.10.0"],
      last_pushed: "2026-07-23T10:00:00Z",
      running_on: "uts-shared-deployment-api",
      state: "running",
      size_bytes: 1_699_956_926,
      is_aggregate: false,
      note: "",
    },
    {
      repo: "retired-legacy-service",
      cloud: "gcp",
      registry: "unified-trading-system",
      image_count: 3,
      tags: ["deadbee"],
      last_pushed: "2026-03-01T00:00:00Z",
      running_on: "",
      state: "legacy",
      size_bytes: 512_000_000,
      is_aggregate: false,
      note: "",
    },
    {
      repo: "execution-service",
      cloud: "aws",
      registry: "ECR",
      image_count: 0,
      tags: [],
      last_pushed: "",
      running_on: "",
      state: "parked",
      size_bytes: null,
      is_aggregate: false,
      note: "AWS ECR not read yet (parked, no credits)",
    },
  ],
  stats: { total_repos: 3, running: 1, parked: 1, legacy: 1, empty: 0 },
};

const running: api.RunningResponse = {
  generated_at: "2026-07-23T12:00:00Z",
  groups: [
    {
      service: "uts-shared-deployment-api",
      lane: "image",
      cloud: "gcp",
      fragmented: false,
      frag_note: "",
      versions: [
        {
          version: ":a557471",
          artifact: "unified-trading-system/deployment-api",
          digest: "sha256:c05dd3d678ef",
          built_from: "a557471",
          drift: ["ok"],
          hosts: [{ name: "uts-shared-deployment-api", kind: "Cloud Run svc", launched_at: "2026-07-23T11:00:00Z" }],
          why: "resolves to deployment-api@a557471 (main), built by deployment-api-build.",
        },
      ],
    },
    {
      service: "deployment-dashboard",
      lane: "image",
      cloud: "gcp",
      fragmented: false,
      frag_note: "",
      versions: [
        {
          version: ":latest",
          artifact: "unified-trading-system/deployment-dashboard",
          digest: "sha256:37a9ab503fb9",
          built_from: "",
          drift: ["floating"],
          hosts: [{ name: "deployment-dashboard", kind: "Cloud Run svc", launched_at: "2026-07-23T10:00:00Z" }],
          why: "the resolved image is tagged only :latest.",
        },
      ],
    },
  ],
  stats: { services: 2, versions: 2, fragmented: 0, floating: 1, hand: 0, unknown: 0 },
};

const health: api.HealthResponse = {
  generated_at: "2026-07-23T12:00:00Z",
  conditions: [
    {
      condition: "AWS builds/deploys/registry are not read yet",
      severity: "deferred",
      count: "all AWS",
      area: "cross-cutting · AWS",
      tab: "pipe",
      meaning: "The AWS estate is deliberately stopped while credits are unavailable.",
      evidence: "AWS providers are not yet wired into this page.",
    },
    {
      condition: "A workload is serving its newest revision even though that revision never went ready",
      severity: "high",
      count: "1",
      area: "deploy · GCP",
      tab: "deploy",
      meaning: "Cloud Run has nothing newer to fall back to.",
      evidence: "deployment-service",
    },
    {
      condition: "A live workload resolves to an image tagged only :latest",
      severity: "med",
      count: "1",
      area: "running · GCP",
      tab: "running",
      meaning: "No SHA-traceable tag.",
      evidence: "deployment-dashboard",
    },
  ],
  stats: { high: 1, med: 1, low: 0, deferred: 1, real_defects: 2 },
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
    vi.mocked(api.getArtifactImages).mockResolvedValue(images);
    vi.mocked(api.getArtifactRunning).mockResolvedValue(running);
    vi.mocked(api.getArtifactHealth).mockResolvedValue(health);
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

  it("switching tabs shows each live view and returns cleanly to Pipeline", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("artifact-tab-run"));
    await waitFor(() => expect(screen.getByTestId("artifact-run-view")).toBeInTheDocument());
    expect(screen.queryByTestId("artifact-pipe-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("artifact-tab-pipe"));
    expect(screen.getByTestId("artifact-pipe-view")).toBeInTheDocument();
  });

  it("the Artifacts tab renders the registry stat band + rows, sorts by Repo, and multi-selects a repo", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-art"));
    await waitFor(() => expect(screen.getAllByTestId("art-row")).toHaveLength(3));

    expect(screen.getByTestId("art-stat-total")).toHaveTextContent("3");
    expect(screen.getByTestId("art-stat-running")).toHaveTextContent("1");
    expect(screen.getByTestId("art-stat-legacy")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("art-th-repo-sort"));
    let rows = screen.getAllByTestId("art-row");
    expect(rows[0]).toHaveTextContent("deployment-api");

    fireEvent.click(screen.getByTestId("art-filter-repo-toggle"));
    const menu = screen.getByTestId("art-filter-repo-menu");
    fireEvent.click(within(menu).getByTestId("art-filter-repo-opt-deployment-api").querySelector("input")!);
    rows = screen.getAllByTestId("art-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("deployment-api");

    fireEvent.click(screen.getByTestId("art-colfilters-clear"));
    expect(screen.getAllByTestId("art-row")).toHaveLength(3);
  });

  it("the Legacy filter pill narrows the Artifacts table to GC candidates", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-art"));
    await waitFor(() => expect(screen.getAllByTestId("art-row")).toHaveLength(3));

    fireEvent.click(screen.getByTestId("art-filter-legacy"));
    const rows = screen.getAllByTestId("art-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("retired-legacy-service");
  });

  it("the What's running tab renders the runtime-join stat band, expands a row's why, and multi-selects a service", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-run"));
    await waitFor(() => expect(screen.getAllByTestId("run-row")).toHaveLength(2));

    expect(screen.getByTestId("run-stat-services")).toHaveTextContent("2");
    expect(screen.getByTestId("run-stat-floating")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("run-filter-floating"));
    let rows = screen.getAllByTestId("run-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("deployment-dashboard");
    fireEvent.click(rows[0]);
    expect(screen.getByText(/tagged only :latest/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("run-filter-all"));
    fireEvent.click(screen.getByTestId("run-filter-service-toggle"));
    const menu = screen.getByTestId("run-filter-service-menu");
    fireEvent.click(
      within(menu).getByTestId("run-filter-service-opt-uts-shared-deployment-api").querySelector("input")!,
    );
    rows = screen.getAllByTestId("run-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("uts-shared-deployment-api");
  });

  it("the Health tab renders the severity stat band, filters by pill, sorts by severity, and multi-selects an area", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-health"));
    await waitFor(() => expect(screen.getAllByTestId("health-row")).toHaveLength(3));

    expect(screen.getByTestId("health-stat-defects")).toHaveTextContent("2");
    expect(screen.getByTestId("health-stat-high")).toHaveTextContent("1");

    fireEvent.click(screen.getByTestId("health-filter-high"));
    let rows = screen.getAllByTestId("health-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("never went ready");

    fireEvent.click(screen.getByTestId("health-filter-all"));
    fireEvent.click(screen.getByTestId("health-th-severity-sort"));
    rows = screen.getAllByTestId("health-row");
    expect(rows[0]).toHaveTextContent("deferred"); // ascending: deferred(0) < med(2) < high(3)

    fireEvent.click(screen.getByTestId("health-filter-area-toggle"));
    const menu = screen.getByTestId("health-filter-area-menu");
    fireEvent.click(within(menu).getByTestId("health-filter-area-opt-running · GCP").querySelector("input")!);
    rows = screen.getAllByTestId("health-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("deployment-dashboard");
  });

  it("the help dialog explains all five live tabs' columns and closes cleanly", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("pipe-stat-total")).toBeInTheDocument());

    expect(screen.queryByText("Artifact Pipeline — quick guide")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("artifact-help-button"));
    expect(screen.getByText("Artifact Pipeline — quick guide")).toBeInTheDocument();

    // Covers the page-level controls and every live tab's column glossary — not just a title. Uses
    // text unique to the dialog's explanatory copy (some HelpTerm labels, e.g. "Why it failed",
    // collide with the live table's own column headers still rendered behind the dialog).
    expect(screen.getByText("Using this page")).toBeInTheDocument();
    expect(screen.getByText("Pipeline tab — every build")).toBeInTheDocument();
    expect(screen.getByText("Deploy timeline tab — every deploy")).toBeInTheDocument();
    expect(screen.getByText(/expand its full step-by-step timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/looks forward/i)).toBeInTheDocument();
    expect(screen.getByText("What's running tab — the headline runtime join")).toBeInTheDocument();
    expect(screen.getByText("Artifacts tab — the registry inventory")).toBeInTheDocument();
    expect(screen.getByText(/measured conditions, not a hand-written checklist/i)).toBeInTheDocument();

    // The Dialog component closes on Escape (its own documented behavior) — cheaper + more robust
    // than targeting its icon-only close button, which carries no accessible name.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Artifact Pipeline — quick guide")).not.toBeInTheDocument();
  });

  it("sorting the Pipeline table by Repo orders rows alphabetically and reverses on a second click", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));

    fireEvent.click(screen.getByTestId("pipe-th-repo-sort"));
    let rows = screen.getAllByTestId("pipe-row");
    expect(rows[0]).toHaveTextContent("deployment-api");
    expect(rows[3]).toHaveTextContent("market-tick-data-service");

    fireEvent.click(screen.getByTestId("pipe-th-repo-sort"));
    rows = screen.getAllByTestId("pipe-row");
    expect(rows[0]).toHaveTextContent("market-tick-data-service");
    expect(rows[3]).toHaveTextContent("deployment-api");
  });

  it("the Repo column's multi-select filter isolates several repos at once, and clears via the reset link", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));
    expect(screen.queryByTestId("pipe-colfilters-clear")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pipe-filter-repo-toggle"));
    const menu = screen.getByTestId("pipe-filter-repo-menu");
    fireEvent.click(within(menu).getByTestId("pipe-filter-repo-opt-deployment-api").querySelector("input")!);
    fireEvent.click(within(menu).getByTestId("pipe-filter-repo-opt-execution-service").querySelector("input")!);

    const rows = screen.getAllByTestId("pipe-row");
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.textContent?.includes("deployment-api"))).toBe(true);
    expect(rows.some((r) => r.textContent?.includes("execution-service"))).toBe(true);
    // stats stay whole-window, matching the existing pill-filter convention
    expect(screen.getByTestId("pipe-stat-total")).toHaveTextContent("4");

    fireEvent.click(screen.getByTestId("pipe-colfilters-clear"));
    expect(screen.getAllByTestId("pipe-row")).toHaveLength(4);
    expect(screen.queryByTestId("pipe-colfilters-clear")).not.toBeInTheDocument();
  });

  it("a text column filter (Why it failed) narrows the Pipeline table by substring", async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("pipe-row")).toHaveLength(4));

    fireEvent.change(screen.getByTestId("pipe-filter-failure"), { target: { value: "docker build" } });
    const rows = screen.getAllByTestId("pipe-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("market-tick-data-service");
  });

  it("the Workload column's multi-select filter isolates a Deploy timeline workload", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-deploy"));
    await waitFor(() => expect(screen.getAllByTestId("deploy-row")).toHaveLength(3));

    fireEvent.click(screen.getByTestId("deploy-filter-workload-toggle"));
    const menu = screen.getByTestId("deploy-filter-workload-menu");
    fireEvent.click(within(menu).getByTestId("deploy-filter-workload-opt-deployment-service").querySelector("input")!);

    const rows = screen.getAllByTestId("deploy-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("deployment-service");

    fireEvent.click(screen.getByTestId("deploy-colfilters-clear"));
    expect(screen.getAllByTestId("deploy-row")).toHaveLength(3);
  });

  it("sorting the Deploy timeline by When orders revisions chronologically", async () => {
    renderPage();
    fireEvent.click(screen.getByTestId("artifact-tab-deploy"));
    await waitFor(() => expect(screen.getAllByTestId("deploy-row")).toHaveLength(3));

    fireEvent.click(screen.getByTestId("deploy-th-at-sort"));
    const rows = screen.getAllByTestId("deploy-row");
    // ascending: oldest first
    expect(rows[0]).toHaveTextContent("deployment-service-00001-lqw");
    expect(rows[1]).toHaveTextContent("uts-shared-deployment-api-00254-djz");
    expect(rows[2]).toHaveTextContent("uts-shared-deployment-api-00255-rtk");
  });
});
