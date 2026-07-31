import {
  Activity,
  AlertCircle,
  BarChart2,
  BookOpen,
  Database,
  GitBranch,
  Hammer,
  History,
  Info,
  Monitor,
  Play,
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useCallback, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createDeployment } from "./api/client";
import { RequireAuth } from "./auth/RequireAuth";
import { CloudBuildsTab } from "./components/CloudBuildsTab";
import { DataStatusTab } from "./components/DataStatusTab";
import { DeploymentHistory } from "./components/DeploymentHistory";
import { ServiceStatusTab } from "./components/ServiceStatusTab";
import { DeployForm } from "./components/DeployForm";
import { DeploymentDetails } from "./components/DeploymentDetails";
import { DeploymentResult } from "./components/DeploymentResult";
import { Header } from "./components/Header";
import { MockModeBanner } from "./components/MockModeBanner";
import { MonitorTab } from "./components/MonitorTab";
import { ReadinessTab } from "./components/ReadinessTab";
import { ServiceDetails } from "./components/ServiceDetails";
import { ServiceList } from "./components/ServiceList";
import { CapabilityTab } from "./components/CapabilityTab";
import { ClientReportingTab } from "./components/ClientReportingTab";
import { DeploymentReadinessTab } from "./components/DeploymentReadinessTab";
import { RepoCoverageTab } from "./components/RepoCoverageTab";
import { TreasuryTab } from "./components/TreasuryTab";
import { VenueCoverageTable } from "./components/VenueCoverageTable";
import { Button } from "./components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ServiceUrlSync } from "./components/ServiceUrlSync";
import { ToastStack } from "./components/ToastStack";
import { CloudProviderProvider } from "./contexts/CloudProviderContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import {
  CockpitHealth,
  CockpitDeploy,
  CockpitConsolidators,
  CockpitCi,
  CockpitAlerts,
  CockpitLaunch,
  CockpitChaos,
  CockpitSafety,
} from "./pages/Cockpit";
import { CostObservability } from "./pages/CostObservability";
import { VmResourceComparison } from "./pages/VmResourceComparison";
import { ArtifactPipeline } from "./pages/ArtifactPipeline";
import { DeploymentsPage } from "./pages/Deployments";
import { DeploymentDetail } from "./pages/DeploymentDetail";
import { RepoDetailPanel } from "./pages/RepoCi";
import { ServicesOverviewTab } from "./components/ServicesOverviewTab";
import { EpicsPlansContent } from "./pages/EpicsPlans";
import { VmDetail } from "./pages/VmDetail";
import { ExecutionBacktests } from "./pages/ExecutionBacktests";
import { MlExperiments } from "./pages/MlExperiments";
import { StrategyBacktests } from "./pages/StrategyBacktests";
import { VmDeploymentDetails } from "./pages/VmDeploymentDetails";
import { VenueConfig } from "./pages/VenueConfig";
import type { CreateDeploymentResponse, DeploymentRequest } from "./types";

// ---------------------------------------------------------------------------

const INFRASTRUCTURE_SERVICES = ["unified-trading-deployment-v2"];

function App() {
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<CreateDeploymentResponse | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<DeploymentRequest | null>(null);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("deploy");

  // URL is the source of truth for the home shell (ServiceUrlSync): /service/{name}/{tab}
  // drives the state; landing paths (/ /epics /repos /alerts) clear the selection.
  const handleUrlService = useCallback((service: string | null, tab: string | null) => {
    setSelectedService(service);
    if (service) setActiveTab(tab ?? "deploy");
    setDeploymentResult(null);
    setDeploymentError(null);
    setSelectedDeploymentId(null);
  }, []);

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
      setDeploymentError(err instanceof Error ? err.message : "Deployment failed");
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

  const handleCloseDeploymentDetails = () => setSelectedDeploymentId(null);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CloudProviderProvider>
          <NotificationProvider>
            <RequireAuth>
              {/* overflow-x-clip: the responsive layout always fits the viewport, so a
                  document-level horizontal scrollbar is never wanted — clipping it stops the
                  transient horizontal-scrollbar flicker on every background refresh (the data
                  table scrolls inside its own overflow-x-auto wrapper). operator 2026-06-22. */}
              <div className="min-h-screen overflow-x-clip bg-[var(--color-bg-primary)]">
                <MockModeBanner />
                <Header />
                <ServiceUrlSync
                  selectedService={selectedService}
                  activeTab={activeTab}
                  onUrlService={handleUrlService}
                />
                <Routes>
                  {/* Cockpit is the DEFAULT page of the deployment UI (operator 2026-06-23).
                      The per-service home shell (ServiceList + deploy/monitor tabs) lives at
                      /home (the `*` fall-through below); /service/* deep-links are unchanged. */}
                  <Route path="/" element={<Navigate to="/cockpit" replace />} />
                  {/* One URL scheme — plain routes (operator 2026-07-17, retired `?tab=`). Each
                      former cockpit tab is now its own top-level route; the shared chrome (Header
                      + TopNavBar) lives above <Routes>, so it persists across all of them with no
                      layout route needed. */}
                  <Route path="/cockpit" element={<CockpitHealth />} />
                  <Route path="/deploy" element={<CockpitDeploy />} />
                  <Route path="/deployments" element={<DeploymentsPage />} />
                  <Route path="/deployments/:name" element={<DeploymentDetail />} />
                  {/* Canonical home for the 4 venue-config panels, relocated out of the
                      legacy-quarantined /vm-deployments page (2026-07-21, see
                      unified-trading-pm/plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md).
                      Grouped with Deploy & Deployments (navItems.ts) — these panels configure/inform
                      the VM deployment workflow, not Fleet's git-health/orphan-VM observability. */}
                  <Route path="/venue-config" element={<VenueConfig />} />
                  <Route path="/consolidators" element={<CockpitConsolidators />} />
                  <Route path="/ci" element={<CockpitCi />} />
                  <Route path="/alerts" element={<CockpitAlerts />} />
                  <Route path="/launch" element={<CockpitLaunch />} />
                  <Route path="/chaos" element={<CockpitChaos />} />
                  <Route path="/safety-ops" element={<CockpitSafety />} />
                  {/* /vm-deployments (the standalone list page) is RETIRED (2026-07-21) — its 2
                      remaining unique features now have real homes: "Reconcile Registry" moved to
                      /deployments' header, and the raw active+archive VM table was deleted as
                      redundant with /deployments' own unified VM-kind inventory (which already has
                      an archive/"all" status view). /vm-deployments/:deploymentId stays live —
                      DeploymentDetail's History card links to it directly for per-run drill-down. */}
                  <Route path="/vm-deployments/:deploymentId" element={<VmDeploymentDetails />} />
                  <Route path="/costs" element={<CostObservability />} />
                  <Route path="/vm-resources" element={<VmResourceComparison />} />
                  <Route path="/artifacts" element={<ArtifactPipeline />} />
                  <Route path="/vms/:vmName" element={<VmDetail />} />
                  {/* Compat redirects — /ops/* paths flattened to top-level 2026-07-29 */}
                  <Route path="/ops/costs" element={<Navigate to="/costs" replace />} />
                  <Route path="/ops/vm-resources" element={<Navigate to="/vm-resources" replace />} />
                  <Route path="/ops/artifacts" element={<Navigate to="/artifacts" replace />} />
                  <Route path="/ops/vms/:vmName" element={<Navigate to="/vms/:vmName" replace />} />
                  <Route path="/research/ml-experiments" element={<MlExperiments />} />
                  <Route path="/research/strategy-backtests" element={<StrategyBacktests />} />
                  <Route path="/research/execution-backtests" element={<ExecutionBacktests />} />
                  {/* Epics is its own page (was a LandingTabs tab; that bar was deleted
                      2026-07-17 — the top bar already lists every screen). */}
                  <Route
                    path="/epics"
                    element={
                      <main className="w-full app-shell-gutter py-4">
                        <EpicsPlansContent />
                      </main>
                    }
                  />
                  {/* Compat redirect for old bookmarks only (no nav entry): `?tab=` is gone,
                      so this forwards to the canonical plain route. /fleet itself is RETIRED
                      (2026-07-27, deployment_ui_fleet_tab_removal_2026_07_27.md) — fleet
                      git-health's only home is now agent-orchestrator's own dashboard, so
                      /infra (its earlier redirect target) has nowhere left to forward to and
                      falls through to the catch-all below instead of chaining dead redirects. */}
                  <Route path="/repos" element={<Navigate to="/ci" replace />} />
                  <Route
                    path="*"
                    element={
                      /* Full-width shell — adapt to the monitor, no fixed max-w cap.
                         The old max-w-[1920px] centered the content and wasted the right
                         third of a wide (≥2560px) monitor (operator 2026-06-22). The 12-col
                         grid + per-tab tables fill the space; cards stay readable via their
                         own md/xl column grids. Horizontal gutter is `app-shell-gutter` (a
                         plain CSS class) NOT Tailwind `px-*` — the unlayered `* { padding: 0 }`
                         reset outranks Tailwind v4's layered utilities, so `px-*` is dead here. */
                      <main className="w-full app-shell-gutter py-4">
                        <div className="grid grid-cols-12 gap-4 lg:gap-6">
                          <div className="col-span-12 lg:col-span-3 xl:col-span-2 2xl:col-span-2">
                            <ServiceList
                              selectedService={selectedService}
                              onSelectService={(service, operation) => {
                                setSelectedService(service);
                                setSelectedOperation(operation ?? null);
                                if (
                                  INFRASTRUCTURE_SERVICES.includes(service) &&
                                  !["builds", "config"].includes(activeTab)
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
                                const isInfra = INFRASTRUCTURE_SERVICES.includes(selectedService);
                                return (
                                  <>
                                    {!isInfra && (deploymentResult || deploymentError) && !selectedDeploymentId && (
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
                                            onDeployLive={deploymentResult.dry_run ? handleDeployLive : undefined}
                                            onLoadAllShards={
                                              deploymentResult.dry_run && deploymentResult.shards_truncated
                                                ? handleLoadAllShards
                                                : undefined
                                            }
                                          />
                                        ) : null}
                                      </div>
                                    )}
                                    {!isInfra && selectedDeploymentId && (
                                      <div id="deployment-details-panel" className="mb-6">
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
                                            "deploy-readiness",
                                            "data-status",
                                            "capability",
                                            "monitor",
                                            "history",
                                            "builds",
                                          ].includes(tab)
                                        )
                                          setSelectedDeploymentId(null);
                                      }}
                                      className="w-full"
                                    >
                                      <TabsList
                                        variant="pill"
                                        className={`grid w-full ${isInfra ? "grid-cols-3" : selectedService === "client-reporting-api" ? "grid-cols-11" : selectedService === "deployment-api" ? "grid-cols-12" : selectedService === "market-tick-data-service" ? "grid-cols-11" : "grid-cols-10"} mb-6`}
                                      >
                                        {!isInfra && (
                                          <TabsTrigger value="deploy" className="gap-2">
                                            <Play className="h-4 w-4" />
                                            Deploy
                                          </TabsTrigger>
                                        )}
                                        {!isInfra && (
                                          <TabsTrigger value="monitor" className="gap-2">
                                            <Monitor className="h-4 w-4" />
                                            Monitor
                                          </TabsTrigger>
                                        )}
                                        {!isInfra && (
                                          <TabsTrigger value="history" className="gap-2">
                                            <History className="h-4 w-4" />
                                            History
                                          </TabsTrigger>
                                        )}
                                        <TabsTrigger value="builds" className="gap-2">
                                          <Hammer className="h-4 w-4" />
                                          Builds
                                        </TabsTrigger>
                                        {!isInfra && (
                                          <TabsTrigger value="data-status" className="gap-2">
                                            <Database className="h-4 w-4" />
                                            Data Status
                                          </TabsTrigger>
                                        )}
                                        {!isInfra && (
                                          <TabsTrigger
                                            value="capability"
                                            className="gap-2"
                                            data-testid="capability-tab-trigger"
                                          >
                                            <BookOpen className="h-4 w-4" />
                                            Capability
                                          </TabsTrigger>
                                        )}
                                        {!isInfra && (
                                          <TabsTrigger value="readiness" className="gap-2">
                                            <ShieldCheck className="h-4 w-4" />
                                            Readiness
                                          </TabsTrigger>
                                        )}
                                        <TabsTrigger value="config" className="gap-2">
                                          <Settings className="h-4 w-4" />
                                          Config
                                        </TabsTrigger>
                                        {!isInfra && (
                                          <TabsTrigger value="status" className="gap-2">
                                            <Activity className="h-4 w-4" />
                                            Status
                                          </TabsTrigger>
                                        )}
                                        {!isInfra && (
                                          <TabsTrigger
                                            value="ci"
                                            className="gap-2"
                                            data-testid="service-ci-tab-trigger"
                                          >
                                            <GitBranch className="h-4 w-4" />
                                            CI
                                          </TabsTrigger>
                                        )}
                                        {selectedService === "client-reporting-api" && (
                                          <TabsTrigger value="client-reporting" className="gap-2">
                                            <TrendingUp className="h-4 w-4" />
                                            Client Reporting
                                          </TabsTrigger>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsTrigger value="treasury" className="gap-2">
                                            <Info className="h-4 w-4" />
                                            Treasury
                                          </TabsTrigger>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsTrigger value="deploy-readiness" className="gap-2">
                                            <ShieldCheck className="h-4 w-4" />
                                            QG Readiness
                                          </TabsTrigger>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsTrigger value="repo-coverage" className="gap-2">
                                            <BarChart2 className="h-4 w-4" />
                                            Coverage
                                          </TabsTrigger>
                                        )}
                                        {selectedService === "market-tick-data-service" && (
                                          <TabsTrigger
                                            value="venue-coverage"
                                            className="gap-2"
                                            data-testid="venue-coverage-tab-trigger"
                                          >
                                            <BarChart2 className="h-4 w-4" />
                                            Venue Coverage
                                          </TabsTrigger>
                                        )}
                                      </TabsList>
                                      {/* Per-tab error boundary (keyed on activeTab so a switch
                                          remounts + recovers): a render crash in ONE tab's content
                                          (e.g. a partial/raced API payload) is contained here
                                          instead of white-screening the whole app via the root
                                          boundary + making sibling tabs unreachable. Plan item 203. */}
                                      <ErrorBoundary
                                        key={activeTab}
                                        fallbackTitle="This tab hit an error — switch tabs or retry"
                                      >
                                        {!isInfra && (
                                          <TabsContent value="deploy">
                                            {/* b3: fresh deployments only — re-deploys live in Monitor */}
                                            <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10 px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                                              <Info className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent-blue)]" />
                                              <span>
                                                Fresh deployments only. To re-run a job with the same parameters, use{" "}
                                                <strong>Monitor → Backfill / Experiments / Live / Scheduled</strong>.
                                              </span>
                                            </div>
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
                                        {!isInfra && (
                                          <TabsContent value="history">
                                            <DeploymentHistory
                                              serviceName={selectedService}
                                              onViewDetails={(id) => {
                                                setSelectedDeploymentId(id);
                                                setActiveTab("monitor");
                                              }}
                                            />
                                          </TabsContent>
                                        )}
                                        <TabsContent value="builds">
                                          <CloudBuildsTab serviceName={selectedService} />
                                        </TabsContent>
                                        {!isInfra && (
                                          <TabsContent value="data-status">
                                            {selectedService === "market-data-processing-service" && (
                                              <div
                                                data-testid="mdps-consolidation-banner"
                                                className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10 px-4 py-3 text-sm text-[var(--color-text-primary)]"
                                              >
                                                <Info className="h-5 w-5 shrink-0 text-[var(--color-accent-blue)] mt-0.5" />
                                                <div className="flex-1 space-y-1">
                                                  <p className="font-medium">
                                                    MDPS processed candles live alongside raw ticks under
                                                    market-tick-data-service&apos;s bucket.
                                                  </p>
                                                  <p className="text-xs text-[var(--color-text-secondary)]">
                                                    Showing processed-* data types only (prefix{" "}
                                                    <code className="font-mono px-1 rounded bg-[var(--color-bg-tertiary)]">
                                                      processed_candles/
                                                    </code>
                                                    ). Raw ticks are visible under the full{" "}
                                                    <button
                                                      onClick={() => setSelectedService("market-tick-data-service")}
                                                      className="underline text-[var(--color-accent-blue)] hover:opacity-80"
                                                    >
                                                      market-tick-data-service Data Status
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
                                                if (!params.previewRefreshOnly) setActiveTab("deploy");
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
                                                  skip_existing: params.skip_existing ?? true,
                                                  deploy_missing_only: params.deploy_missing_only ?? true,
                                                  date_granularity: params.date_granularity,
                                                  first_day_of_month_only: params.first_day_of_month_only ?? false,
                                                });
                                              }}
                                            />
                                          </TabsContent>
                                        )}
                                        {!isInfra && (
                                          <TabsContent value="capability">
                                            <CapabilityTab
                                              onSelectDataStatus={(svc) => {
                                                setSelectedService(svc);
                                                setActiveTab("data-status");
                                              }}
                                            />
                                          </TabsContent>
                                        )}
                                        {!isInfra && (
                                          <TabsContent value="readiness">
                                            <ReadinessTab serviceName={selectedService} />
                                          </TabsContent>
                                        )}
                                        <TabsContent value="config">
                                          <ServiceDetails serviceName={selectedService} />
                                        </TabsContent>
                                        {!isInfra && (
                                          <TabsContent value="status">
                                            <ServiceStatusTab serviceName={selectedService ?? ""} />
                                          </TabsContent>
                                        )}
                                        {!isInfra && (
                                          <TabsContent value="ci" data-testid="service-ci-tab">
                                            {/* Same drill-down component as /repos — single-service context.
                                              Service names that aren't repo names degrade honestly via the
                                              panel's own error state (mapping todo tracked in the CI plan). */}
                                            <RepoDetailPanel repo={selectedService ?? ""} />
                                          </TabsContent>
                                        )}
                                        {selectedService === "client-reporting-api" && (
                                          <TabsContent value="client-reporting">
                                            <ClientReportingTab />
                                          </TabsContent>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsContent value="treasury">
                                            <TreasuryTab />
                                          </TabsContent>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsContent value="deploy-readiness">
                                            <DeploymentReadinessTab />
                                          </TabsContent>
                                        )}
                                        {selectedService === "deployment-api" && (
                                          <TabsContent value="repo-coverage">
                                            <RepoCoverageTab />
                                          </TabsContent>
                                        )}
                                        {selectedService === "market-tick-data-service" && (
                                          <TabsContent value="venue-coverage">
                                            <VenueCoverageTable />
                                          </TabsContent>
                                        )}
                                      </ErrorBoundary>
                                    </Tabs>
                                  </>
                                );
                              })()
                            ) : (
                              <ServicesOverviewTab onSelectService={setSelectedService} />
                            )}
                          </div>
                        </div>
                      </main>
                    }
                  />
                </Routes>
                <ToastStack />
              </div>
            </RequireAuth>
          </NotificationProvider>
        </CloudProviderProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
