import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Header } from "./components/Header";
import { MockModeBanner } from "./components/MockModeBanner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastStack } from "./components/ToastStack";
import { NotFoundPage } from "./pages/NotFound";
import { HomeShell } from "./pages/HomeShell";
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
import { EpicsPlansContent } from "./pages/EpicsPlans";
import { VmDetail } from "./pages/VmDetail";
import { ExecutionBacktests } from "./pages/ExecutionBacktests";
import { MlExperiments } from "./pages/MlExperiments";
import { StrategyBacktests } from "./pages/StrategyBacktests";
import { VmDeploymentDetails } from "./pages/VmDeploymentDetails";
import { VenueConfig } from "./pages/VenueConfig";
import { CloudRunJobs } from "./pages/CloudRunJobs";
import { KillSwitchTab } from "./components/widgets/kill_switch/register";
import { RiskTab } from "./components/widgets/risk/register";

// ---------------------------------------------------------------------------

function App() {
  // The per-service home shell (ServiceList + deploy/monitor/config tabs) is rendered
  // directly by three real routes below (`/home`, `/service/:serviceName`,
  // `/service/:serviceName/:tab`) — one shared element, no bidirectional URL<->state
  // sync needed (HomeShell derives selectedService/activeTab from route params).
  const homeShell = <HomeShell />;

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
                <Routes>
                  {/* Cockpit is the DEFAULT page of the deployment UI (operator 2026-06-23).
                      The per-service home shell (ServiceList + deploy/monitor tabs) lives at
                      /home, /service/:serviceName and /service/:serviceName/:tab — three real
                      routes sharing one element (see App() above + HomeShell.tsx). */}
                  <Route path="/" element={<Navigate to="/cockpit" replace />} />
                  {/* One URL scheme — plain routes (operator 2026-07-17, retired `?tab=`). Each
                      former cockpit tab is now its own top-level route; the shared chrome (Header
                      + TopNavBar) lives above <Routes>, so it persists across all of them with no
                      layout route needed. */}
                  <Route path="/cockpit" element={<CockpitHealth />} />
                  <Route path="/deploy" element={<CockpitDeploy />} />
                  <Route path="/deployments" element={<DeploymentsPage />} />
                  <Route path="/deployments/:name" element={<DeploymentDetail />} />
                  <Route path="/cloud-run-jobs" element={<CloudRunJobs />} />
                  {/* Canonical home for the 4 venue-config panels, relocated out of the
                      legacy-quarantined /vm-deployments page (2026-07-21, see
                      unified-trading-pm/plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md).
                      Grouped with Deploy & Deployments (NavMenu.tsx) — these panels configure/inform
                      the VM deployment workflow, not Fleet's git-health/orphan-VM observability. */}
                  <Route path="/venue-config" element={<VenueConfig />} />
                  <Route path="/consolidators" element={<CockpitConsolidators />} />
                  <Route path="/ci" element={<CockpitCi />} />
                  <Route path="/alerts" element={<CockpitAlerts />} />
                  <Route path="/launch" element={<CockpitLaunch />} />
                  <Route path="/chaos" element={<CockpitChaos />} />
                  <Route path="/safety-ops" element={<CockpitSafety />} />
                  {/* Kill Switch + Risk — DR plan Phase 7.B / Risk plan Phase 6.C shipped
                      deployment-ui@33e6ea0 (component + register.ts registry) but were never
                      mounted (no route, no nav entry — see
                      unified-trading-pm/plans/archive/disaster_recovery_circuit_breakers_2026_05_10.md
                      Phase 7.B + plans/archive/risk_simulations_limits_alerting_2026_05_10.md
                      Phase 6.C, both `status: complete`). Backend endpoints
                      (`/api/kill-switch/*`, `/api/risk/*`) are registered in deployment-api's
                      main.py. Own top-level routes (not folded into /safety-ops, which is a
                      distinct incident-governance placeholder against alerting-service, not the
                      UTL KillSwitchBus this tab reads). */}
                  <Route
                    path="/kill-switch"
                    element={
                      <main className="w-full app-shell-gutter py-4">
                        <KillSwitchTab />
                      </main>
                    }
                  />
                  <Route
                    path="/risk"
                    element={
                      <main className="w-full app-shell-gutter py-4">
                        <RiskTab />
                      </main>
                    }
                  />
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
                  {/* Per-service home shell — REAL ROUTES (2026-08-01, was a `*` catch-all
                      regex-sniffed by the retired ServiceUrlSync.tsx — see
                      unified-trading-pm/plans/active/issues/deployment_ui_nav_consolidation_2026_07_17.md,
                      "Move the per-service shell onto real routes"). All three share the same
                      `homeShell` element (HomeShell.tsx derives selectedService/activeTab from
                      useParams()); no bidirectional URL<->state sync needed. `/service/:serviceName`
                      (no tab) is reached by ServicesOverviewTab's row click (fresh entry, deploy
                      tab default); ServiceList's sidebar switch always carries an explicit tab
                      (it preserves the current one), which is why both shapes are real routes. */}
                  <Route path="/home" element={homeShell} />
                  <Route path="/service/:serviceName" element={homeShell} />
                  <Route path="/service/:serviceName/:tab" element={homeShell} />
                  {/* Every other unmatched URL — including stale nav-shaped links like the old
                      /infra redirect target — gets a real 404 instead of silently rendering the
                      home shell (that silent-fallback bug is what let /infra "work" for weeks). */}
                  <Route path="*" element={<NotFoundPage />} />
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
