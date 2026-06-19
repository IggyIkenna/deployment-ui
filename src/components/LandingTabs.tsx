/**
 * LandingTabs — the deployment-ui home shell (no service selected).
 *
 * Hosts Overview, Epics, and the Repos-CI dashboard as sibling tabs so the CI/CD
 * fleet view is a first-class tab in deployment-ui rather than a separate full-page
 * app (operator add 2026-06-10: "include /repos as a new tab, not a separate UI").
 *
 * The Repos CI tab is URL-synced to `/repos` so the header link + deep-links keep
 * working; Overview/Epics live at `/`.
 *
 * Plan: monitoring_control_plane_master_2026_06_10.md (single devops pane).
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, BellRing, GitBranch, LayoutGrid, Server, Trophy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ServicesOverviewTab } from "./ServicesOverviewTab";
import { EpicsPlansContent } from "../pages/EpicsPlans";
import { RepoCiContent } from "../pages/RepoCi";
import { AlertsContent } from "../pages/Alerts";
import { FleetGitContent } from "../pages/FleetGit";
import { FleetInfraContent } from "../pages/FleetInfra";

type LandingTab = "overview" | "epics" | "repos" | "alerts" | "fleet" | "infra";

function tabForPath(pathname: string): LandingTab {
  if (pathname === "/repos") return "repos";
  if (pathname === "/alerts") return "alerts";
  if (pathname === "/fleet") return "fleet";
  if (pathname === "/epics") return "epics";
  if (pathname === "/infra") return "infra";
  return "overview";
}

export function LandingTabs({ onSelectService }: { onSelectService: (service: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState<LandingTab>(() => tabForPath(location.pathname));

  // Keep the active tab in sync when the URL changes from outside (header "Repos CI"
  // link, deep-link, back/forward) — `/repos` ⇒ repos tab, anything else ⇒ overview.
  useEffect(() => {
    setTab(tabForPath(location.pathname));
  }, [location.pathname]);

  const handleTabChange = (next: string) => {
    const value = next as LandingTab;
    setTab(value);
    // Mirror URL-synced tabs onto their routes; Overview/Epics share `/`.
    const routeFor: Partial<Record<LandingTab, string>> = {
      repos: "/repos",
      alerts: "/alerts",
      fleet: "/fleet",
      epics: "/epics",
      infra: "/infra",
    };
    const target = routeFor[value] ?? "/";
    if (location.pathname !== target) navigate(target);
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
      <TabsList variant="pill" className="grid w-full grid-cols-6 mb-6">
        <TabsTrigger value="overview" className="gap-2">
          <LayoutGrid className="h-4 w-4" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="epics" className="gap-2">
          <Trophy className="h-4 w-4" />
          Epics
        </TabsTrigger>
        <TabsTrigger value="repos" className="gap-2" data-testid="landing-repos-ci-tab-trigger">
          <GitBranch className="h-4 w-4" />
          Repos CI
        </TabsTrigger>
        <TabsTrigger value="alerts" className="gap-2" data-testid="landing-alerts-tab-trigger">
          <BellRing className="h-4 w-4" />
          Alerts
        </TabsTrigger>
        <TabsTrigger value="fleet" className="gap-2" data-testid="landing-fleet-git-tab-trigger">
          <Server className="h-4 w-4" />
          Fleet Git
        </TabsTrigger>
        <TabsTrigger value="infra" className="gap-2" data-testid="landing-fleet-infra-tab-trigger">
          <Activity className="h-4 w-4" />
          Fleet Infra
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <ServicesOverviewTab onSelectService={onSelectService} />
      </TabsContent>
      <TabsContent value="epics">
        <EpicsPlansContent />
      </TabsContent>
      <TabsContent value="repos" data-testid="landing-repos-ci-tab">
        <RepoCiContent />
      </TabsContent>
      <TabsContent value="alerts" data-testid="landing-alerts-tab">
        <AlertsContent />
      </TabsContent>
      <TabsContent value="fleet" data-testid="landing-fleet-git-tab">
        <FleetGitContent />
      </TabsContent>
      <TabsContent value="infra" data-testid="landing-fleet-infra-tab">
        <FleetInfraContent />
      </TabsContent>
    </Tabs>
  );
}
