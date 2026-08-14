import {
  Activity,
  AlertCircle,
  BarChart2,
  BookOpen,
  Database,
  GitBranch,
  History,
  Info,
  Monitor,
  Play,
  Settings,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDeployment } from "../api/client";
import { DataStatusTab } from "../components/DataStatusTab";
import { DeploymentHistory } from "../components/DeploymentHistory";
import { ServiceStatusTab } from "../components/ServiceStatusTab";
import { DeployForm } from "../components/DeployForm";
import { DeploymentDetails } from "../components/DeploymentDetails";
import { DeploymentResult } from "../components/DeploymentResult";
import { MonitorTab } from "../components/MonitorTab";
import { ReadinessTab } from "../components/ReadinessTab";
import { ServiceDetails } from "../components/ServiceDetails";
import { ServiceList } from "../components/ServiceList";
import { CapabilityTab } from "../components/CapabilityTab";
import { ClientReportingTab } from "../components/ClientReportingTab";
import { DeploymentReadinessTab } from "../components/DeploymentReadinessTab";
import { RepoCoverageTab } from "../components/RepoCoverageTab";
import { TreasuryTab } from "../components/TreasuryTab";
import { VenueCoverageTable } from "../components/VenueCoverageTable";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ServicesOverviewTab } from "../components/ServicesOverviewTab";
import { RepoDetailPanel } from "./RepoCi";
import type { CreateDeploymentResponse, DeploymentRequest } from "../types";

const INFRASTRUCTURE_SERVICES = ["unified-trading-deployment-v2"];

/**
 * HomeShell — the per-service deploy/monitor/config console. Rendered directly by three
 * real routes in App.tsx: `/home` (no service selected — ServicesOverviewTab),
 * `/service/:serviceName` (deploy tab default), `/service/:serviceName/:tab` (explicit
 * tab). selectedService/activeTab are route params derived on every render, not
 * component state — there is no bidirectional URL<->state sync to maintain (that hack,
 * `ServiceUrlSync.tsx`'s ~100-line loop-guarded effect pair, is retired: see
 * unified-trading-pm/plans/active/issues/deployment_ui_nav_consolidation_2026_07_17.md,
 * "Move the per-service shell onto real routes"). Every "select a service" / "switch tab"
 * action below is a plain `navigate()` call instead of local setState.
 */
export function HomeShell() {
  const { serviceName, tab } = useParams<{ serviceName?: string; tab?: string }>();
  const navigate = useNavigate();
  const selectedService = serviceName ?? null;
  const activeTab = tab ?? "deploy";

  const [selectedOperation, setSelectedOperation] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<CreateDeploymentResponse | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<DeploymentRequest | null>(null);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);

  const handleDeploy = async (request: DeploymentRequest) => {
    setIsDeploying(true);
    setDeploymentError(null);
    setLastRequest(request);
    try {
      const result = await createDeployment(request);
      setDeploymentResult(result);
      if (!result.dry_run && result.deployment_id) {
        setSelectedDeploymentId(result.deployment_id);
        navigate(`/service/${encodeURIComponent(request.service)}/monitor`, { replace: true });
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
    <main className="w-full app-shell-gutter py-4">
      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        <div className="col-span-12 lg:col-span-3 xl:col-span-2 2xl:col-span-2">
          <ServiceList
            selectedService={selectedService}
            onSelectService={(service, operation) => {
              setSelectedOperation(operation ?? null);
              setDeploymentResult(null);
              setDeploymentError(null);
              setSelectedDeploymentId(null);
              const isInfra = INFRASTRUCTURE_SERVICES.includes(service);
              const nextTab = isInfra && activeTab !== "config" ? "config" : activeTab;
              navigate(`/service/${encodeURIComponent(service)}/${nextTab}`);
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
                              <h3 className="text-sm font-medium text-[var(--color-accent-red)]">Deployment Failed</h3>
                              <p className="text-sm text-[var(--color-text-secondary)] mt-1">{deploymentError}</p>
                              <Button onClick={handleCloseResult} variant="ghost" size="sm" className="mt-2 text-xs">
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
                      <DeploymentDetails deploymentId={selectedDeploymentId} onClose={handleCloseDeploymentDetails} />
                    </div>
                  )}
                  <Tabs
                    value={activeTab}
                    onValueChange={(tabValue: string) => {
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
                        ].includes(tabValue)
                      )
                        setSelectedDeploymentId(null);
                      navigate(`/service/${encodeURIComponent(selectedService)}/${tabValue}`);
                    }}
                    className="w-full"
                  >
                    <TabsList
                      variant="pill"
                      className={`grid w-full ${isInfra ? "grid-cols-1" : selectedService === "client-reporting-api" ? "grid-cols-10" : selectedService === "deployment-api" ? "grid-cols-11" : selectedService === "market-tick-data-service" ? "grid-cols-10" : "grid-cols-9"} mb-6`}
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
                      {!isInfra && (
                        <TabsTrigger value="data-status" className="gap-2">
                          <Database className="h-4 w-4" />
                          Data Status
                        </TabsTrigger>
                      )}
                      {!isInfra && (
                        <TabsTrigger value="capability" className="gap-2" data-testid="capability-tab-trigger">
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
                        <TabsTrigger value="ci" className="gap-2" data-testid="service-ci-tab-trigger">
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
                        <TabsTrigger value="venue-coverage" className="gap-2" data-testid="venue-coverage-tab-trigger">
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
                    <ErrorBoundary key={activeTab} fallbackTitle="This tab hit an error — switch tabs or retry">
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
                              navigate(`/service/${encodeURIComponent(selectedService)}/monitor`);
                            }}
                          />
                        </TabsContent>
                      )}
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
                                  MDPS processed candles live alongside raw ticks under market-tick-data-service&apos;s
                                  bucket.
                                </p>
                                <p className="text-xs text-[var(--color-text-secondary)]">
                                  Showing processed-* data types only (prefix{" "}
                                  <code className="font-mono px-1 rounded bg-[var(--color-bg-tertiary)]">
                                    processed_candles/
                                  </code>
                                  ). Raw ticks are visible under the full{" "}
                                  <button
                                    onClick={() => navigate("/service/market-tick-data-service/data-status")}
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
                              if (!params.previewRefreshOnly)
                                navigate(`/service/${encodeURIComponent(selectedService)}/deploy`);
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
                            onSelectDataStatus={(svc) => navigate(`/service/${encodeURIComponent(svc)}/data-status`)}
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
            <ServicesOverviewTab
              // Bare `/service/{name}` (no tab) — the documented "service view, deploy tab"
              // URL shape. Distinct from ServiceList's sidebar switch (which preserves the
              // CURRENT tab), this is a fresh entry into a service from the overview table,
              // so the deploy-tab default applies and the URL stays clean/un-suffixed.
              onSelectService={(svc) => navigate(`/service/${encodeURIComponent(svc)}`)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
