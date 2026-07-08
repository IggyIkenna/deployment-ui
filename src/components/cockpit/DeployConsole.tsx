/**
 * DeployConsole — the cockpit Deploy tab: launch / rollback + build & deployment history,
 * all REUSING the existing components (no rebuild):
 *
 *   - **Launch / Rollback** — the existing `DeployForm` (it already embeds `BuildSelector`
 *     → `fetchBuilds(service, env)` → `image_tag`, so launching from a specific IMAGE VERSION
 *     = rollback, and `runtime_profile` × cloud covers batch/live/paper). `onDeploy` →
 *     `createDeployment` (POST /api/deployments).
 *   - **Build history** — `CloudBuildsTab` (image-build history for the service).
 *   - **Deployment history** — `DeploymentHistory` (incl. self-deleted / ephemeral / stopped
 *     targets while the 7-day archive retains them).
 *
 * A service-picker drives all three. Heavy children are lazy-loaded + ErrorBoundary-isolated
 * (one console's failure never blanks the tab — same pattern as LaunchTab). Phase 6.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boxes, History, Rocket } from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";
import { createDeployment, getServices } from "../../api/client";
import type { DeploymentRequest } from "../../types";

const DeployForm = lazy(() => import("../DeployForm").then((m) => ({ default: m.DeployForm })));
const CloudBuildsTab = lazy(() => import("../CloudBuildsTab").then((m) => ({ default: m.CloudBuildsTab })));
const DeploymentHistory = lazy(() => import("../DeploymentHistory").then((m) => ({ default: m.DeploymentHistory })));

type DeployView = "launch" | "builds" | "history";

const VIEWS: { id: DeployView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "launch", label: "Launch / Rollback", icon: Rocket },
  { id: "builds", label: "Build history", icon: Boxes },
  { id: "history", label: "Deployment history", icon: History },
];

export function DeployConsole(): React.ReactElement {
  const [searchParams] = useSearchParams();
  // A "Redeploy" deep-link (from a deployment-detail drill) prefills ?service=<name>.
  const initialService = searchParams.get("service") ?? "";
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState<string>(initialService);
  const [view, setView] = useState<DeployView>("launch");
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await getServices();
        if (!cancelled) setServices(r.services.map((s) => s.name).sort());
      } catch {
        if (!cancelled) setServices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeploy = async (request: DeploymentRequest): Promise<void> => {
    setDeploying(true);
    setResult(null);
    try {
      const res = await createDeployment(request);
      setResult(`Deploy submitted: ${res.deployment_id || res.status || "ok"}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div data-testid="cockpit-deploy-console">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-[var(--color-text-secondary)]" htmlFor="deploy-service-picker">
          Service
        </label>
        <select
          id="deploy-service-picker"
          data-testid="deploy-service-picker"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
        >
          <option value="">Select a service…</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {service ? (
          <div
            className="inline-flex items-stretch overflow-hidden rounded-lg border border-[var(--color-border-emphasis)] bg-[var(--color-bg-tertiary)]"
            role="tablist"
            data-testid="deploy-view-tabs"
          >
            {VIEWS.map((v, i) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  data-testid={`deploy-view-${v.id}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors ${
                    i > 0 ? "border-l border-[var(--color-border-emphasis)] " : ""
                  }${
                    view === v.id
                      ? "bg-[var(--color-accent-cyan)]/15 text-[var(--color-accent-cyan)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {v.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {result ? (
        <p className="mb-3 text-xs text-[var(--color-text-secondary)]" data-testid="deploy-result">
          {result}
        </p>
      ) : null}

      {!service ? (
        <p className="text-sm text-[var(--color-text-muted)]" data-testid="deploy-no-service">
          Pick a service to launch (or roll back to a prior image), or to see its build + deployment history.
        </p>
      ) : (
        <ErrorBoundary fallbackTitle="This deploy console failed to load">
          <Suspense fallback={<p className="text-xs text-[var(--color-text-tertiary)]">Loading console…</p>}>
            {view === "launch" ? (
              <DeployForm serviceName={service} onDeploy={handleDeploy} isDeploying={deploying} />
            ) : view === "builds" ? (
              <CloudBuildsTab serviceName={service} />
            ) : (
              <DeploymentHistory serviceName={service} />
            )}
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
