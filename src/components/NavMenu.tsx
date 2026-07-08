import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart2,
  Boxes,
  CircleDollarSign,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Radio,
  Rocket,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";

type NavItem = {
  id: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
};
type NavGroup = { heading: string; items: NavItem[] };

/**
 * Single source of truth for the top-bar page navigation. Consumed by the desktop
 * dropdown (NavMenu) and the mobile hamburger list (Header) so the two never drift.
 * Internal operator tool — every deployment/health/research surface is one click from
 * the top-left trigger; the trigger no longer force-navigates to /cockpit (operator
 * 2026-07-08 — the cockpit was a forced full-page trip, this is a dismissable menu).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { id: "cockpit", to: "/cockpit", label: "Cockpit", icon: Activity, desc: "Unified health hub" },
      { id: "home", to: "/home", label: "Home (services)", icon: Server, desc: "Per-service shell" },
    ],
  },
  {
    // live/batch/paper were separate cockpit sub-tabs — MERGED into one Deployments tab
    // (operator 2026-07-08); mode is now a filter inside the unified all-modes table.
    heading: "Deploy & Deployments",
    items: [
      { id: "deploy", to: "/cockpit?tab=deploy", label: "Deploy Console", icon: Rocket, desc: "Launch / rollback" },
      {
        id: "deployments",
        to: "/cockpit?tab=deployments",
        label: "Deployments",
        icon: Boxes,
        desc: "Live · batch · paper (unified)",
      },
      {
        id: "vm-deployments",
        to: "/vm-deployments",
        label: "VM Deployments",
        icon: Server,
        desc: "Per-VM launch history",
      },
      { id: "live-ops", to: "/ops/live-deployments", label: "Live Ops", icon: Radio, desc: "Running services + feeds" },
    ],
  },
  {
    heading: "Fleet & Cost",
    items: [
      { id: "fleet", to: "/cockpit?tab=fleet", label: "Fleet VMs", icon: Layers, desc: "GCP + AWS census · orphans" },
      { id: "fleet-git", to: "/fleet", label: "Fleet Git", icon: GitBranch, desc: "Slot / worktree health" },
      {
        id: "consolidators",
        to: "/cockpit?tab=consolidators",
        label: "Consolidators",
        icon: Database,
        desc: "Index age · shard fallback",
      },
      { id: "costs", to: "/ops/costs", label: "Costs", icon: CircleDollarSign, desc: "Tri-cloud spend breakdown" },
    ],
  },
  {
    heading: "Repos & Alerts",
    items: [
      { id: "repos", to: "/repos", label: "Repos / CI", icon: GitBranch, desc: "Last-green · promotion lag" },
      { id: "alerts", to: "/alerts", label: "Alerts", icon: AlertCircle, desc: "Open alerts by class" },
      { id: "epics", to: "/epics", label: "Epics & Plans", icon: Database, desc: "Roadmap + plan status" },
    ],
  },
  {
    heading: "Safety & Chaos",
    items: [
      { id: "safety", to: "/safety-ops", label: "Safety Ops", icon: ShieldCheck, desc: "Kill-switch + guardrails" },
      { id: "chaos", to: "/chaos", label: "Chaos", icon: AlertTriangle, desc: "Resilience testing" },
    ],
  },
  {
    heading: "Research",
    items: [
      {
        id: "launch",
        to: "/cockpit?tab=launch",
        label: "Launch Console",
        icon: Rocket,
        desc: "ML / strategy / exec launch",
      },
      { id: "ml", to: "/research/ml-experiments", label: "ML Experiments", icon: FlaskConical, desc: "Training runs" },
      {
        id: "strategy",
        to: "/research/strategy-backtests",
        label: "Strategy Backtests",
        icon: BarChart2,
        desc: "Strategy sims",
      },
      {
        id: "exec",
        to: "/research/execution-backtests",
        label: "Execution Backtests",
        icon: Boxes,
        desc: "Execution sims",
      },
    ],
  },
];

/** Flattened {to,label} list for the mobile hamburger menu (same source as the dropdown). */
export const NAV_LINKS_FLAT = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label })));

/**
 * Top-bar navigation dropdown. Opens from the top-left trigger, lists every page grouped
 * by domain, and closes on: an item click, the ✕, a click on the backdrop, or Escape —
 * so opening it never commits you to leaving the current page.
 */
export function NavMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isActive = (to: string): boolean => {
    const [path, query] = to.split("?");
    // Cockpit entries are per-tab: match the ?tab= param (base /cockpit == the default health tab).
    if (path === "/cockpit") {
      if (location.pathname !== "/cockpit") return false;
      const current = new URLSearchParams(location.search).get("tab") ?? "health";
      const want = query ? (new URLSearchParams(query).get("tab") ?? "health") : "health";
      return current === want;
    }
    return location.pathname === path || (path !== "/" && location.pathname.startsWith(path + "/"));
  };

  return (
    <>
      {/* Click-away backdrop — dismiss without navigating. */}
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        tabIndex={-1}
        data-testid="nav-menu-backdrop"
        className="fixed inset-0 z-40 cursor-default bg-black/20"
      />
      <div
        ref={panelRef}
        role="menu"
        aria-label="Primary navigation"
        data-testid="nav-menu"
        className="absolute left-2 top-full z-50 mt-1 w-[min(92vw,760px)] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Go to</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            data-testid="nav-menu-close"
            className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.heading}>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {group.heading}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      onClick={onClose}
                      role="menuitem"
                      data-testid={`nav-menu-item-${item.id}`}
                      className={`group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                        active
                          ? "bg-[var(--color-accent-cyan)]/10 text-[var(--color-accent-cyan)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 flex-none ${
                          active
                            ? ""
                            : "text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]"
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium leading-tight">{item.label}</span>
                        <span className="block truncate text-xs text-[var(--color-text-tertiary)]">{item.desc}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
