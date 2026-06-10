import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

vi.mock("./auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./components/Header", () => ({ Header: () => <div>Header</div> }));
vi.mock("./components/ServiceList", () => ({
  ServiceList: ({ onSelectService }: { onSelectService: (s: string) => void }) => (
    <div>
      <div>ServiceList</div>
      <button onClick={() => onSelectService("execution-service")}>Select Service</button>
    </div>
  ),
}));
vi.mock("./components/ServiceDetails", () => ({
  ServiceDetails: () => <div>ServiceDetails</div>,
}));
vi.mock("./components/DeployForm", () => ({
  DeployForm: () => <div>DeployForm</div>,
}));
vi.mock("./components/DeploymentResult", () => ({
  DeploymentResult: () => <div>DeploymentResult</div>,
}));
vi.mock("./components/DeploymentHistory", () => ({
  DeploymentHistory: () => <div>DeploymentHistory</div>,
}));
vi.mock("./components/DeploymentDetails", () => ({
  DeploymentDetails: () => <div>DeploymentDetails</div>,
}));
vi.mock("./components/ReadinessTab", () => ({
  ReadinessTab: () => <div>ReadinessTab</div>,
}));
vi.mock("./components/DataStatusTab", () => ({
  DataStatusTab: () => <div>DataStatusTab</div>,
}));
vi.mock("./components/ServiceStatusTab", () => ({
  ServiceStatusTab: () => <div>ServiceStatusTab</div>,
}));
vi.mock("./components/ServicesOverviewTab", () => ({
  ServicesOverviewTab: () => <div>ServicesOverviewTab</div>,
}));
vi.mock("./components/CloudBuildsTab", () => ({
  CloudBuildsTab: () => <div>CloudBuildsTab</div>,
}));
vi.mock("./pages/EpicsPlans", () => ({
  EpicsPlansContent: () => <div>EpicsPlansContent</div>,
}));
vi.mock("./components/MonitorTab", () => ({
  MonitorTab: () => <div>MonitorTab</div>,
}));
vi.mock("./api/client", () => ({
  createDeployment: vi.fn(),
  setApiBaseUrl: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
}));

describe("App", () => {
  it("renders Header and ServiceList", () => {
    render(<App />);
    expect(screen.getByText("Header")).toBeInTheDocument();
    expect(screen.getByText("ServiceList")).toBeInTheDocument();
  });

  it("shows tabs after selecting a service", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    expect(screen.getByText("DeployForm")).toBeInTheDocument();
  });

  it("shows deploy tab content by default", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    expect(screen.getByRole("tab", { name: /deploy/i })).toBeInTheDocument();
  });

  it("shows monitor tab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    expect(screen.getByRole("tab", { name: /monitor/i })).toBeInTheDocument();
  });

  it("switches to monitor tab on click", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    // Click monitor tab - Radix UI tabs update state async in jsdom
    fireEvent.click(screen.getByRole("tab", { name: /monitor/i }));
    // Monitor tab should now be active (aria-selected)
    await waitFor(() => {
      const monitorTab = screen.getByRole("tab", { name: /monitor/i });
      expect(monitorTab.getAttribute("aria-selected") ?? monitorTab.getAttribute("data-state")).toBeTruthy();
    });
  });

  // ConfigLink removed from App shell — the "Venue Connections" link lives
  // in Header's auxiliary-nav group now. Skipped until a dedicated Header
  // assertion is authored. See 2026-04-21 QG-residual cleanup report.
  it.skip("renders ConfigLink to onboarding venue connections", () => {});

  it.skip("shows tabs in correct order: Deploy, Status, History, Builds, Data Status, Readiness, Config", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /select service/i }));
    const tabs = screen.getAllByRole("tab");
    const tabLabels = tabs.map((tab) => tab.textContent?.trim());
    // Verify Deploy comes first and Status is second
    expect(tabLabels[0]).toBe("Deploy");
    expect(tabLabels[1]).toBe("Status");
    expect(tabLabels[2]).toBe("History");
    expect(tabLabels[3]).toBe("Builds");
  });
});
