import {
  AlertCircle,
  Database,
  Hammer,
  Info,
  LayoutGrid,
  Monitor,
  Play,
  Settings,
  ShieldCheck,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Component, type ReactNode, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { createDeployment } from "./api/client";
import { RequireAuth } from "./auth/RequireAuth";
import { CloudBuildsTab } from "./components/CloudBuildsTab";
import { DataStatusTab } from "./components/DataStatusTab";
import { DeployForm } from "./components/DeployForm";
import { DeploymentDetails } from "./components/DeploymentDetails";
import { DeploymentResult } from "./components/DeploymentResult";
import { EpicReadinessView } from "./components/EpicReadinessView";
import { Header } from "./components/Header";
import { MockModeBanner } from "./components/MockModeBanner";
import { MonitorTab } from "./components/MonitorTab";
import { ReadinessTab } from "./components/ReadinessTab";
import { ServiceDetails } from "./components/ServiceDetails";
import { ServiceList } from "./components/ServiceList";
import { ServiceStatusTab } from "./components/ServiceStatusTab";
import { ServicesOverviewTab } from "./components/ServicesOverviewTab";
import { ClientReportingTab } from "./components/ClientReportingTab";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { CloudProviderProvider } from "./contexts/CloudProviderContext";
import { Chaos } from "./pages/Chaos";
import { ClientSubscriptions } from "./pages/ClientSubscriptions";
import { VmDeploymentDetails } from "./pages/VmDeploymentDetails";
import { VmDeployments } from "./pages/VmDeployments";
import type { CreateDeploymentResponse, DeploymentRequest } from "./types";

// ---------------------------------------------------------------------------
// Local ErrorBoundary (replaces @unified-trading/ui-kit ErrorBoundary)
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)] p-8">
          <div className="max-w-lg text-center">
            <h1 className="text-xl font-semibold text-[var(--color-accent-red)] mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-md bg-[var(--color-accent-blue)] text-white hover:opacity-90"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------

const INFRASTRUCTURE_SERVICES = ["unified-trading-deployment-v2"];

function App() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(
    null,
  );
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] =
    useState<CreateDeploymentResponse | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<DeploymentRequest | null>(
    null,
  );
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<
    string | null
  >(null);
  const [activeTab, setActiveTab] = useState("deploy");

  const handleDeploy = async (request: DeploymentRequest) => {
    setIsDeploying(true);
    setDeploymentError(null);
    setLastRequest(request);
    try {
      const result = await createDeployment(request);
      setDeploymentResult(result);
      if (!result.dry_run && result.deployment_id) {
        setActiveTab("monitor");
        setSelectedDeploymentId(result.deployment_id);
      }
    } catch (err) {
      setDeploymentError(
        err instanceof Error ? err.message : "Deployment failed",
      );
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeployLive = async () => {
    if (!lastRequest) return;
    await handleDeploy({ ...lastRequest, dry_run: false });
  };

  const handleLoadAllShards = async () => {
    if (!lastRequest) return [];
    const result = await createDeployment({
      ...lastRequest,
      dry_run: true,
      include_all_shards: true,
    });
    return result.shards || [];
  };

  const handleCloseResult = () => {
    setDeploymentResult(null);
    setDeploymentError(null);
  };

  const handleViewDeploymentDetails = (deploymentId: string) => {
    setSelectedDeploymentId(deploymentId);
    requestAnimationFrame(() => {
      document
        .getElementById("deployment-details-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleCloseDeploymentDetails = () => setSelectedDeploymentId(null);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CloudProviderProvider>
          <RequireAuth>
            <div className="min-h-screen bg-[var(--color-bg-primary)]">
              <MockModeBanner />
              <Header />
              <Routes>
                <Route path="/vm-deployments" element={<VmDeployments />} />
                <Route
                  path="/vm-deployments/:deploymentId"
                  element={<VmDeploymentDetails />}
                />
                <Route
                  path="/client-subscriptions"
                  element={<ClientSubscriptions />}
                />
                <Route path="/chaos" element={<Chaos />} />
                <Route
                  path="*"
                  element={
                    <main className="mx-auto px-4 lg:px-6 py-4 max-w-[1920px]">
                      <div className="grid grid-cols-12 gap-4 lg:gap-6">
                        <div className="col-span-12 lg:col-span-3 xl:col-span-2 2xl:col-span-2">
                          <ServiceList
                            selectedService={selectedService}
                            onSelectService={(service, operation) => {
                              setSelectedService(service);
                              setSelectedOperation(operation ?? null);
                              if (
                                INFRASTRUCTURE_SERVICES.includes(service) &&
                                ![
                                  "builds",
                                  "config",
                                ].includes(activeTab)
                              ) {
                                setActiveTab("builds");
                              }
                              setDeploymentResult(null);
                              setDeploymentError(null);
                              setSelectedDeploymentId(null);
                            }}
                          />
                        </div>
                        <div className="col-span-12 lg:col-span-9 xl:col-span-10 2xl:col-span-10">
                          {selectedService ? (
                            (() => {
                              const isInfra =
                                INFRASTRUCTURE_SERVICES.includes(
                                  selectedService,
                                );
                              return (
                                <>
                                  {!isInfra &&
                                    (deploymentResult || deploymentError) &&
                                    !selectedDeploymentId && (
                                      <div className="mb-6">
                                        {deploymentError ? (
                                          <div className="p-4 rounded-lg status-error">
                                            <div className="flex items-start gap-3">
                                              <AlertCircle className="h-5 w-5 text-[var(--color-accent-red)] shrink-0 mt-0.5" />
                                              <div className="flex-1">
                                                <h3 className="text-sm font-medium text-[var(--color-accent-red)]">
                                                  Deployment Failed
                                                </h3>
                                                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                                                  {deploymentError}
                                                </p>
                                                <Button
                                                  onClick={handleCloseResult}
                                                  variant="ghost"
                                                  size="sm"
                                                  className="mt-2 text-xs"
                                                >
                                                  Dismiss
                                                </Button>
                                              </div>
                                            </div>
                                          </div>
                                        ) : deploymentResult ? (
                                          <DeploymentResult
                                            result={deploymentResult}
                                            onClose={handleCloseResult}
                                            onDeployLive={
                                              deploymentResult.dry_run
                                                ? handleDeployLive
                                                : undefined
                                            }
                                            onLoadAllShards={
                                              deploymentResult.dry_run &&
                                              deploymentResult.shards_truncated
                                                ? handleLoadAllShards
                                                : undefined
                                            }
                                          />
                                        ) : null}
                                      </div>
                                    )}
                                  {!isInfra && selectedDeploymentId && (
                                    <div
                                      id="deployment-details-panel"
                                      className="mb-6"
                                    >
                                      <DeploymentDetails
                                        deploymentId={selectedDeploymentId}
                                        onClose={handleCloseDeploymentDetails}
                                      />
                                    </div>
                                  )}
                                  <Tabs
                                    value={activeTab}
                                    onValueChange={(tab: string) => {
                                      setActiveTab(tab);
                                      if (
                                        [
                                          "deploy",
                                          "config",
                                          "readiness",
                                          "data-status",
                                          "monitor",
                                          "builds",
                                        ].includes(tab)
                                      )
                                        setSelectedDeploymentId(null);
                                    }}
                                    className="w-full"
                                  >
                                    <TabsList
                                      variant="pill"
                                      className={`grid w-full ${isInfra ? "grid-cols-3" : selectedService === "client-reporting-api" ? "grid-cols-7" : "grid-cols-6"} mb-6`}
                                    >
                                      {!isInfra && (
                                        <TabsTrigger
                                          value="deploy"
                                          className="gap-2"
                                        >
                                          <Play className="h-4 w-4" />
                                          Deploy
                                        </TabsTrigger>
                                      )}
                                      {!isInfra && (
                                        <TabsTrigger
                                          value="monitor"
                                          className="gap-2"
                                        >
                                          <Monitor className="h-4 w-4" />
                                          Monitor
                                        </TabsTrigger>
                                      )}
                                      <TabsTrigger
                                        value="builds"
                                        className="gap-2"
                                      >
                                        <Hammer className="h-4 w-4" />
                                        Builds
                                      </TabsTrigger>
                                      {!isInfra && (
                                        <TabsTrigger
                                          value="data-status"
                                          className="gap-2"
                                        >
                                          <Database className="h-4 w-4" />
                                          Data Status
                                        </TabsTrigger>
                                      )}
                                      {!isInfra && (
                                        <TabsTrigger
                                          value="readiness"
                                          className="gap-2"
                                        >
                                          <ShieldCheck className="h-4 w-4" />
                                          Readiness
                                        </TabsTrigger>
                                      )}
                                      <TabsTrigger
                                        value="config"
                                        className="gap-2"
                                      >
                                        <Settings className="h-4 w-4" />
                                        Config
                                      </TabsTrigger>
                                      {selectedService ===
                                        "client-reporting-api" && (
                                        <TabsTrigger
                                          value="client-reporting"
                                          className="gap-2"
                                        >
                                          <TrendingUp className="h-4 w-4" />
                                          Client Reporting
                                        </TabsTrigger>
                                      )}
                                    </TabsList>
                                    {!isInfra && (
                                      <TabsContent value="deploy">
                                        <DeployForm
                                          serviceName={selectedService}
                                          selectedOperation={selectedOperation}
                                          onDeploy={handleDeploy}
                                          isDeploying={isDeploying}
                                        />
                                      </TabsContent>
                                    )}
                                    {!isInfra && (
                                      <TabsContent value="monitor">
                                        <MonitorTab />
                                      </TabsContent>
                                    )}
                                    <TabsContent value="builds">
                                      <CloudBuildsTab
                                        serviceName={selectedService}
                                      />
                                    </TabsContent>
                                    {!isInfra && (
                                      <TabsContent value="data-status">
                                        {selectedService ===
                                          "market-data-processing-service" && (
                                          <div
                                            data-testid="mdps-consolidation-banner"
                                            className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10 px-4 py-3 text-sm text-[var(--color-text-primary)]"
                                          >
                                            <Info className="h-5 w-5 shrink-0 text-[var(--color-accent-blue)] mt-0.5" />
                                            <div className="flex-1 space-y-1">
                                              <p className="font-medium">
                                                MDPS processed candles live
                                                alongside raw ticks under
                                                market-tick-data-service&apos;s
                                                bucket.
                                              </p>
                                              <p className="text-xs text-[var(--color-text-secondary)]">
                                                Showing processed-* data types
                                                only (prefix{" "}
                                                <code className="font-mono px-1 rounded bg-[var(--color-bg-tertiary)]">
                                                  processed_candles/
                                                </code>
                                                ). Raw ticks are visible under
                                                the full{" "}
                                                <button
                                                  onClick={() =>
                                                    setSelectedService(
                                                      "market-tick-data-service",
                                                    )
                                                  }
                                                  className="underline text-[var(--color-accent-blue)] hover:opacity-80"
                                                >
                                                  market-tick-data-service Data
                                                  Status
                                                </button>{" "}
                                                tab.
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                        <DataStatusTab
                                          serviceName={selectedService}
                                          deploymentResult={deploymentResult}
                                          isDeploying={isDeploying}
                                          onDeployMissing={(params) => {
                                            if (!params.previewRefreshOnly)
                                              setActiveTab("deploy");
                                            handleDeploy({
                                              service: params.service,
                                              compute: "vm",
                                              region: params.region,
                                              start_date: params.start_date,
                                              end_date: params.end_date,
                                              asset_group: params.asset_groups,
                                              venue: params.venues,
                                              folder: params.folders,
                                              data_type: params.data_types,
                                              force: params.force ?? false,
                                              dry_run: params.dry_run ?? true,
                                              skip_existing:
                                                params.skip_existing ?? true,
                                              deploy_missing_only:
                                                params.deploy_missing_only ??
                                                true,
                                              date_granularity:
                                                params.date_granularity,
                                              first_day_of_month_only:
                                                params.first_day_of_month_only ??
                                                false,
                                            });
                                          }}
                                        />
                                      </TabsContent>
                                    )}
                                    {!isInfra && (
                                      <TabsContent value="readiness">
                                        <ReadinessTab
                                          serviceName={selectedService}
                                        />
                                      </TabsContent>
                                    )}
                                    <TabsContent value="config">
                                      <ServiceDetails
                                        serviceName={selectedService}
                                      />
                                    </TabsContent>
                                    {selectedService ===
                                      "client-reporting-api" && (
                                      <TabsContent value="client-reporting">
                                        <ClientReportingTab />
                                      </TabsContent>
                                    )}
                                  </Tabs>
                                </>
                              );
                            })()
                          ) : (
                            <Tabs defaultValue="overview" className="w-full">
                              <TabsList
                                variant="pill"
                                className="grid w-full grid-cols-2 mb-6"
                              >
                                <TabsTrigger value="overview" className="gap-2">
                                  <LayoutGrid className="h-4 w-4" />
                                  Overview
                                </TabsTrigger>
                                <TabsTrigger value="epics" className="gap-2">
                                  <Trophy className="h-4 w-4" />
                                  Epics
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent value="overview">
                                <ServicesOverviewTab
                                  onSelectService={setSelectedService}
                                />
                              </TabsContent>
                              <TabsContent value="epics">
                                <EpicReadinessView />
                              </TabsContent>
                            </Tabs>
                          )}
                        </div>
                      </div>
                    </main>
                  }
                />
              </Routes>
            </div>
          </RequireAuth>
        </CloudProviderProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
