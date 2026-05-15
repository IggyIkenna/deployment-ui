import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DeploymentsList } from "./DeploymentsList";
import type { ServiceStatus } from "../types/deploymentTypes";

vi.mock("../components/ui/card", () => ({
  Card: ({
    children,
    className,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    className?: string;
    "data-testid"?: string;
  }) => (
    <div data-testid={testId} className={className}>
      {children}
    </div>
  ),
  CardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
}));
vi.mock("../components/ui/badge", () => ({
  Badge: ({
    children,
    variant,
  }: {
    children: React.ReactNode;
    variant?: string;
  }) => <span data-variant={variant}>{children}</span>,
}));
vi.mock("../components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    disabled,
    type,
    "data-testid": testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    "data-testid"?: string;
  }) => (
    <button
      onClick={onClick}
      data-variant={variant}
      data-size={size}
      disabled={disabled}
      type={type}
      data-testid={testId}
    >
      {children}
    </button>
  ),
}));

const MOCK_SERVICES: ServiceStatus[] = [
  {
    service_id: "svc-001",
    name: "execution-service",
    environment: "prod",
    current_version: "0.4.12",
    health: "HEALTHY",
    last_deployed_at: "2026-03-15T10:30:00Z",
    replicas_ready: 3,
    replicas_total: 3,
  },
  {
    service_id: "svc-002",
    name: "risk-service",
    environment: "prod",
    current_version: "0.3.8",
    health: "DEGRADED",
    last_deployed_at: "2026-03-14T08:00:00Z",
    replicas_ready: 2,
    replicas_total: 3,
  },
  {
    service_id: "svc-003",
    name: "alerting-service",
    environment: "staging",
    current_version: "0.2.1",
    health: "HEALTHY",
    last_deployed_at: "2026-03-13T14:20:00Z",
    replicas_ready: 1,
    replicas_total: 1,
  },
];

vi.mock("../api/deploymentApi", () => ({
  fetchServices: vi.fn(),
  fetchDeploymentDiff: vi.fn(),
}));

let mockFetchServices: ReturnType<typeof vi.fn>;
let mockFetchDeploymentDiff: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const mod = await import("../api/deploymentApi");
  mockFetchServices = vi.mocked(mod.fetchServices);
  mockFetchDeploymentDiff = vi.mocked(mod.fetchDeploymentDiff);
  mockFetchServices.mockResolvedValue(MOCK_SERVICES);
  mockFetchDeploymentDiff.mockResolvedValue({
    from_sha: "abc123",
    to_sha: "def456",
    added: [{ service: "risk-and-exposure-service", from_version: null, to_version: "0.4.0" }],
    removed: [{ service: "strategy-service", from_version: "0.9.3", to_version: null }],
    changed: [{ service: "execution-service", from_version: "0.14.2", to_version: "0.15.0" }],
    total_changes: 3,
    dry_run: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <DeploymentsList />
    </MemoryRouter>,
  );
}

describe("DeploymentsList", () => {
  it("renders the Deployments heading", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Deployments")).toBeInTheDocument(),
    );
  });

  it("renders the page subtitle", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText(/Service health, versions & deployment history/),
      ).toBeInTheDocument(),
    );
  });

  it("renders service rows once loaded", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("execution-service")).toBeInTheDocument(),
    );
    expect(screen.getByText("risk-service")).toBeInTheDocument();
    expect(screen.getByText("alerting-service")).toBeInTheDocument();
  });

  it("renders health badges with correct variants", async () => {
    renderPage();
    await waitFor(() => {
      const healthyBadges = screen
        .getAllByText("HEALTHY")
        .filter((el) => el.getAttribute("data-variant") === "success");
      expect(healthyBadges.length).toBe(2);
    });
    const degradedBadge = screen
      .getAllByText("DEGRADED")
      .find((el) => el.getAttribute("data-variant") === "warning");
    expect(degradedBadge).toBeDefined();
  });

  it("renders version numbers in table", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("0.4.12")).toBeInTheDocument());
    expect(screen.getByText("0.3.8")).toBeInTheDocument();
  });

  it("shows Refresh button", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /refresh/i }),
      ).toBeInTheDocument(),
    );
  });

  it("shows Deploy link", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("+ Deploy")).toBeInTheDocument(),
    );
  });
});

describe("DeploymentsList -- institutional polish", () => {
  it("renders a timestamp in the header", async () => {
    renderPage();
    await waitFor(() => {
      const ts = screen.getByTestId("deploy-timestamp");
      expect(ts).toBeInTheDocument();
    });
  });

  it("renders 4 KPI cards in a responsive grid", async () => {
    renderPage();
    await waitFor(() => {
      const grid = screen.getByTestId("kpi-grid");
      expect(grid).toBeInTheDocument();
      expect(grid.className).toContain("grid-cols-1");
      expect(grid.className).toContain("sm:grid-cols-2");
      expect(grid.className).toContain("lg:grid-cols-4");
    });
  });

  it("renders KPI card for Total Services", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("Total Services")).toBeInTheDocument(),
    );
  });

  it("renders KPI card for Healthy count", async () => {
    renderPage();
    await waitFor(() => {
      const kpiGrid = screen.getByTestId("kpi-grid");
      expect(kpiGrid.textContent).toContain("Healthy");
      expect(kpiGrid.textContent).toContain("2/3");
    });
  });

  it("renders KPI card for Degraded", async () => {
    renderPage();
    await waitFor(() => {
      const kpiGrid = screen.getByTestId("kpi-grid");
      expect(kpiGrid.textContent).toContain("Degraded");
    });
  });

  it("renders KPI card for Last Deploy", async () => {
    renderPage();
    await waitFor(() => {
      const kpiGrid = screen.getByTestId("kpi-grid");
      expect(kpiGrid.textContent).toContain("Last Deploy");
    });
  });

  it("KPI cards have left accent borders", async () => {
    renderPage();
    await waitFor(() => {
      const kpiGrid = screen.getByTestId("kpi-grid");
      const accentBars = kpiGrid.querySelectorAll(".w-1.rounded-full");
      expect(accentBars.length).toBe(4);
    });
  });

  it("KPI values use tabular-nums", async () => {
    renderPage();
    await waitFor(() => {
      const kpiGrid = screen.getByTestId("kpi-grid");
      const numericElements = kpiGrid.querySelectorAll(
        "[style*='tabular-nums']",
      );
      expect(numericElements.length).toBe(4);
    });
  });

  it("uses gap-5 spacing in KPI grid", async () => {
    renderPage();
    await waitFor(() => {
      const grid = screen.getByTestId("kpi-grid");
      expect(grid.className).toContain("gap-5");
    });
  });

  it("KPI cards use rounded-lg", async () => {
    renderPage();
    await waitFor(() => {
      const card = screen.getByTestId("kpi-card-total-services");
      expect(card.className).toContain("rounded-lg");
    });
  });

  it("table wraps in overflow-x-auto", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("execution-service")).toBeInTheDocument(),
    );
    const table = screen.getByText("execution-service").closest("table");
    const wrapper = table?.parentElement;
    expect(wrapper?.className).toContain("overflow-x-auto");
  });

  it("version column is right-aligned", async () => {
    renderPage();
    await waitFor(() => {
      const versionHeader = screen.getByText("Version");
      expect(versionHeader.className).toContain("text-right");
    });
  });

  it("version cells have tabular-nums", async () => {
    renderPage();
    await waitFor(() => {
      const versionCell = screen.getByText("0.4.12");
      expect(versionCell.style.fontVariantNumeric).toBe("tabular-nums");
    });
  });

  it("replicas cells have tabular-nums", async () => {
    renderPage();
    await waitFor(() => {
      const replicaText = screen.getByText("3/3");
      const cell = replicaText.closest("td");
      expect(cell?.style.fontVariantNumeric).toBe("tabular-nums");
    });
  });
});

describe("DeploymentsList diff viewer", () => {
  it("shows Compare SHAs toggle button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());
    expect(screen.getByTestId("toggle-diff-btn")).toBeInTheDocument();
  });

  it("clicking Compare SHAs reveals SHA inputs and Compare button", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("diff-from-sha")).toBeInTheDocument();
      expect(screen.getByTestId("diff-to-sha")).toBeInTheDocument();
      expect(screen.getByText("Compare")).toBeInTheDocument();
    });
  });

  it("clicking Hide Diff hides the panel", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));
    await waitFor(() => expect(screen.getByTestId("diff-from-sha")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));
    await waitFor(() => expect(screen.queryByTestId("diff-from-sha")).not.toBeInTheDocument());
  });

  it("submitting SHA inputs calls fetchDeploymentDiff and shows diff result", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));
    await waitFor(() => expect(screen.getByTestId("diff-from-sha")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("diff-from-sha"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByTestId("diff-to-sha"), { target: { value: "def456" } });
    fireEvent.submit(screen.getByTestId("diff-form"));

    await waitFor(() => {
      expect(screen.getByTestId("diff-result")).toBeInTheDocument();
    });
    expect(mockFetchDeploymentDiff).toHaveBeenCalledWith("abc123", "def456");
  });

  it("diff result shows added/removed/changed sections", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));
    await waitFor(() => expect(screen.getByTestId("diff-from-sha")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("diff-from-sha"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByTestId("diff-to-sha"), { target: { value: "def456" } });
    fireEvent.submit(screen.getByTestId("diff-form"));

    await waitFor(() => expect(screen.getByTestId("diff-result")).toBeInTheDocument());
    const diffEl = screen.getByTestId("diff-result");
    expect(within(diffEl).getByText(/Added/)).toBeInTheDocument();
    expect(within(diffEl).getByText(/Removed/)).toBeInTheDocument();
    expect(within(diffEl).getByText(/Changed/)).toBeInTheDocument();
    expect(within(diffEl).getByText("risk-and-exposure-service")).toBeInTheDocument();
    expect(within(diffEl).getByText("strategy-service")).toBeInTheDocument();
    expect(within(diffEl).getAllByText("execution-service").length).toBeGreaterThan(0);
  });

  it("shows error message when diff fetch fails", async () => {
    mockFetchDeploymentDiff.mockRejectedValueOnce(new Error("Diff unavailable"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Deployments")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("toggle-diff-btn"));
    await waitFor(() => expect(screen.getByTestId("diff-from-sha")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("diff-from-sha"), { target: { value: "abc123" } });
    fireEvent.change(screen.getByTestId("diff-to-sha"), { target: { value: "def456" } });
    fireEvent.submit(screen.getByTestId("diff-form"));

    await waitFor(() => {
      expect(screen.getByTestId("diff-error")).toBeInTheDocument();
      expect(screen.getByText(/Diff unavailable/)).toBeInTheDocument();
    });
  });
});
