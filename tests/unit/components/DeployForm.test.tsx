// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock all hooks and API before importing the component
vi.mock("../../../src/hooks/useServices", () => ({
  useServiceDimensions: vi.fn(),
  useChecklistValidation: vi.fn(),
}));
vi.mock("../../../src/hooks/useConfig", () => ({
  useVenuesByCategory: vi.fn(),
  useVenueCountByCategories: vi.fn(),
  useStartDates: vi.fn(),
}));
vi.mock("../../../src/api/client", () => ({
  getDeploymentQuotaInfo: vi.fn(),
  setApiBaseUrl: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
}));
// DeployForm consumes CloudProviderContext via useCloudProvider — bypass
// the provider by mocking the hook. Keeps the unit tests focused on the
// form field surface rather than cloud-backend switching.
vi.mock("../../../src/contexts/CloudProviderContext", () => ({
  useCloudProvider: () => ({
    target: "gcp",
    switchTarget: vi.fn(),
    apiBaseUrl: "/api",
    switching: false,
  }),
  CloudProviderProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import {
  useServiceDimensions,
  useChecklistValidation,
} from "../../../src/hooks/useServices";
import {
  useVenuesByCategory,
  useVenueCountByCategories,
  useStartDates,
} from "../../../src/hooks/useConfig";

import { DeployForm } from "../../../src/components/DeployForm";

// Minimal mock data
const mockDimensions = {
  service: "instruments-service",
  dimensions: [
    {
      name: "category",
      type: "fixed",
      description: "Category",
      values: ["cefi", "tradfi"],
    },
  ],
  cli_args: {},
};

function setupDefaultMocks() {
  (useServiceDimensions as ReturnType<typeof vi.fn>).mockReturnValue({
    dimensions: mockDimensions,
    loading: false,
    error: null,
  });
  (useChecklistValidation as ReturnType<typeof vi.fn>).mockReturnValue({
    validation: null,
    loading: false,
  });
  (useVenuesByCategory as ReturnType<typeof vi.fn>).mockReturnValue({
    venues: [],
    loading: false,
  });
  (useVenueCountByCategories as ReturnType<typeof vi.fn>).mockReturnValue({
    totalVenueCount: 0,
    loading: false,
  });
  (useStartDates as ReturnType<typeof vi.fn>).mockReturnValue({
    startDates: null,
    loading: false,
    validateDate: vi.fn().mockReturnValue({ valid: true, message: "" }),
  });

  // Mock fetch for /api/config/region
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          gcs_region: "asia-northeast1",
          cloud_provider: "gcp",
        }),
    }),
  );
}

describe("DeployForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders the deploy heading with service name", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    expect(screen.getByText(/Deploy instruments-service/)).toBeTruthy();
  });

  it("renders Mode selector with Batch and Live buttons", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    expect(screen.getByText("Batch")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  // Cloud-provider surface moved from DeployForm → Header (the GCP/AWS
  // toggle now lives in the Header's cloud-switcher row). These 3 tests
  // were asserting against buttons that no longer exist inside DeployForm.
  // Skipped until the cloud-switcher coverage is restored in Header tests.
  // See 2026-04-21 QG-residual cleanup report.
  it.skip("renders Cloud Provider buttons (GCP and AWS)", () => {});
  it.skip("shows AWS warning when AWS is selected", () => {});
  it.skip("hides AWS warning when GCP is selected", () => {});

  it("renders Dry Run checkbox checked by default", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    // Dry run label exists
    // Multiple elements may match; at least one should exist
    expect(screen.getAllByText(/Dry Run/).length).toBeGreaterThan(0);
  });

  it("renders Compute selector with VM and Cloud Run", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    // Buttons show "VM Instance" and "Serverless (Cloud Run)"
    expect(screen.getByText(/VM Instance/)).toBeTruthy();
    expect(screen.getByText(/Serverless/)).toBeTruthy();
  });

  it("shows loading spinner when dimensions are loading", () => {
    (useServiceDimensions as ReturnType<typeof vi.fn>).mockReturnValue({
      dimensions: null,
      loading: true,
      error: null,
    });
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    // The form is replaced with a loading spinner
    expect(screen.queryByText(/Deploy instruments-service/)).toBeNull();
  });

  it("renders Region selector", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    expect(screen.getByText(/Region/)).toBeTruthy();
  });

  it("renders Log Level selector", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    expect(screen.getByText(/Log Level/)).toBeTruthy();
  });

  it("switching to Live mode shows image tag field", () => {
    render(
      <DeployForm
        serviceName="instruments-service"
        onDeploy={vi.fn()}
        isDeploying={false}
      />,
    );
    fireEvent.click(screen.getByText("Live"));
    expect(screen.getByText(/Image Tag/)).toBeTruthy();
  });
});
