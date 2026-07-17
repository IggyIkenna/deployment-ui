/**
 * ServiceUrlSync — makes the URL the single source of truth for the home shell
 * (operator 2026-06-10: "one page with synchronized tabs, not screen jumps").
 *
 * URL scheme:
 *   /                        landing (Overview) — LandingTabs also syncs /epics /repos /alerts
 *   /service/{name}          service view, deploy tab
 *   /service/{name}/{tab}    service view, specific tab (data-status, ci, builds, …)
 *
 * Bidirectional: URL changes (back/forward, deep link, header links) drive the
 * selectedService/activeTab state; state changes (ServiceList click, tab click)
 * are mirrored onto the URL. Landing paths clear the service selection — fixing
 * the "URL says /repos but the screen shows a service view" desync.
 *
 * Renders nothing; must live inside the Router. Non-home routes (e.g.
 * /vm-deployments, /chaos) are ignored entirely.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// `/home` is the per-service home shell (cockpit is the default `/`); the others are
// LandingTabs sub-routes. All clear the service selection.
// MUST stay in sync with LandingTabs.tabForPath — a LandingTabs path missing here keeps
// the stale service view on screen instead of the landing tab (`/infra` did exactly that
// until 2026-07-17).
const LANDING_PATHS = new Set(["/home", "/epics", "/repos", "/alerts", "/fleet", "/infra"]);

interface ServiceUrlSyncProps {
  selectedService: string | null;
  activeTab: string;
  onUrlService: (service: string | null, tab: string | null) => void;
}

export function ServiceUrlSync({ selectedService, activeTab, onUrlService }: ServiceUrlSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Tracks the last URL this component itself produced, so the URL→state effect
  // doesn't re-fire state updates for our own navigations (loop guard).
  const selfNavigated = useRef<string | null>(null);

  // URL → state
  useEffect(() => {
    if (selfNavigated.current === location.pathname) {
      selfNavigated.current = null;
      return;
    }
    const serviceMatch = /^\/service\/([^/]+)(?:\/([^/]+))?$/.exec(location.pathname);
    if (serviceMatch) {
      onUrlService(decodeURIComponent(serviceMatch[1]), serviceMatch[2] ?? null);
    } else if (LANDING_PATHS.has(location.pathname)) {
      onUrlService(null, null);
    }
    // Any other path (e.g. /vm-deployments): not ours — leave state alone.
  }, [location.pathname, onUrlService]);

  // state → URL — with CHANGE ATTRIBUTION: when the URL itself just moved (back/forward,
  // header link), the URL wins and this effect must NOT bounce the stale state back onto
  // it (the /repos-shows-service-view desync). Only a STATE change with an unchanged URL
  // (a ServiceList/tab click) pushes a navigation.
  const prevPath = useRef(location.pathname);
  const prevService = useRef(selectedService);
  const prevTab = useRef(activeTab);
  useEffect(() => {
    const pathChanged = location.pathname !== prevPath.current;
    const stateChanged = selectedService !== prevService.current || activeTab !== prevTab.current;
    prevPath.current = location.pathname;
    prevService.current = selectedService;
    prevTab.current = activeTab;

    const onHomeSurface = LANDING_PATHS.has(location.pathname) || location.pathname.startsWith("/service/");
    if (!onHomeSurface || pathChanged || !stateChanged || !selectedService) return;
    const target = `/service/${encodeURIComponent(selectedService)}/${activeTab}`;
    if (location.pathname !== target) {
      selfNavigated.current = target;
      navigate(target, { replace: location.pathname.startsWith("/service/") });
    }
  }, [selectedService, activeTab, location.pathname, navigate]);

  return null;
}
