import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CircleDollarSign,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Rocket,
  Server,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

type NavItem = {
  id: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  /** Compact label for the always-visible cockpit bar (the dropdown uses `label`). */
  short?: string;
};
/** `legacy: true` = the redundant-route quarantine (see NAV_GROUPS). */
type NavGroup = { heading: string; items: NavItem[]; legacy?: boolean };

/**
 * Single source of truth for the top-bar page navigation. Consumed by the desktop
 * dropdown (NavMenu) and the mobile hamburger list (Header) so the two never drift.
 * Internal operator tool — every surface is one click from the top-left trigger; the
 * trigger does not force-navigate (operator 2026-07-08 — dismissable menu).
 *
 * ONE ENTRY PER SCREEN (2026-07-17 nav audit). The menu previously mixed chromes —
 * some entries pointed at a cockpit tab, others at the standalone page holding the
 * SAME component — so which chrome you got depended on which item you clicked, and
 * the same content appeared under two labels. Every canonical entry below now points
 * at the cockpit tab wherever a fold exists; `/home`, `/epics`, `/ops/costs` and
 * `/vm-deployments` are canonical because they have no cockpit twin (the cockpit's
 * Fleet tab embeds only a COMPACT vm-deployments view).
 *
 * The `legacy` group is the standalone duplicates, kept visible-but-quarantined so
 * the operator can compare chromes before deciding what to delete. It is intended to
 * be DELETED once the standalone routes are redirected (nav-audit Option A) — it is
 * not a permanent section.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      {
        id: "cockpit",
        to: "/cockpit",
        label: "Cockpit",
        icon: Activity,
        desc: "Health rollup — default page",
        short: "Health",
      },
      {
        id: "home",
        to: "/home",
        label: "Home (services)",
        icon: Server,
        desc: "Service picker → per-service tabs",
        // "Home", not "Services": the home shell's own sidebar heading IS "Services",
        // and two identical labels on one screen is an ambiguity (both for the operator
        // and for every getByText("Services") locator).
        short: "Home",
      },
      {
        id: "epics",
        to: "/epics",
        label: "Epics & Plans",
        icon: Trophy,
        desc: "Roadmap + plan status",
        short: "Epics",
      },
    ],
  },
  {
    // live/batch/paper were separate cockpit sub-tabs — MERGED into one Deployments tab
    // (operator 2026-07-08); mode is now a filter inside the unified all-modes table.
    heading: "Deploy & Deployments",
    items: [
      {
        id: "deploy",
        to: "/cockpit?tab=deploy",
        label: "Deploy Console",
        icon: Rocket,
        desc: "Launch / rollback",
        short: "Deploy",
      },
      {
        id: "deployments",
        to: "/cockpit?tab=deployments",
        label: "Deployments",
        icon: Layers,
        desc: "Live · batch · paper + live ops",
        short: "Deployments",
      },
      {
        id: "vm-deployments",
        to: "/vm-deployments",
        label: "VM Deployments",
        icon: Server,
        desc: "Per-VM launch history (full)",
        short: "VMs",
      },
    ],
  },
  {
    heading: "Fleet & Cost",
    items: [
      {
        id: "fleet",
        to: "/cockpit?tab=fleet",
        label: "Fleet",
        icon: Layers,
        desc: "Census · orphans · git · infra",
        short: "Fleet",
      },
      {
        id: "consolidators",
        to: "/cockpit?tab=consolidators",
        label: "Consolidators",
        icon: Database,
        desc: "Index age · shard fallback",
        short: "Consolidators",
      },
      {
        id: "costs",
        to: "/ops/costs",
        label: "Costs",
        icon: CircleDollarSign,
        desc: "Tri-cloud spend breakdown",
        short: "Costs",
      },
    ],
  },
  {
    heading: "Repos & Alerts",
    items: [
      {
        id: "repos",
        to: "/cockpit?tab=ci",
        label: "Repos / CI",
        icon: GitBranch,
        desc: "Last-green · promotion lag",
        short: "CI",
      },
      {
        id: "alerts",
        to: "/cockpit?tab=alerts",
        label: "Alerts & Logs",
        icon: AlertCircle,
        desc: "Open alerts + log stream",
        short: "Alerts",
      },
    ],
  },
  {
    heading: "Safety & Chaos",
    items: [
      {
        id: "safety",
        to: "/cockpit?tab=safety",
        label: "Safety Ops",
        icon: ShieldCheck,
        desc: "Kill-switch + guardrails",
        short: "Safety",
      },
      {
        id: "chaos",
        to: "/cockpit?tab=chaos",
        label: "Chaos",
        icon: AlertTriangle,
        desc: "Resilience testing",
        short: "Chaos",
      },
    ],
  },
  {
    heading: "Research",
    items: [
      {
        id: "launch",
        to: "/cockpit?tab=launch",
        label: "Launch Console",
        icon: FlaskConical,
        desc: "ML · strategy · execution backtests",
        short: "Launch",
      },
    ],
  },
  {
    heading: "Duplicate routes — pending removal",
    legacy: true,
    items: [
      {
        id: "dup-deployments",
        to: "/deployments",
        label: "/deployments",
        icon: Layers,
        desc: "same component as Deployments",
      },
      {
        id: "dup-live-ops",
        to: "/ops/live-deployments",
        label: "/ops/live-deployments",
        icon: Activity,
        desc: "folded into Deployments",
      },
      { id: "dup-fleet-git", to: "/fleet", label: "/fleet", icon: GitBranch, desc: "folded into Fleet (Git)" },
      { id: "dup-fleet-infra", to: "/infra", label: "/infra", icon: Activity, desc: "folded into Fleet (Infra)" },
      { id: "dup-repos", to: "/repos", label: "/repos", icon: GitBranch, desc: "same component as Repos / CI" },
      { id: "dup-alerts", to: "/alerts", label: "/alerts", icon: AlertCircle, desc: "wrapped by Alerts & Logs" },
      { id: "dup-chaos", to: "/chaos", label: "/chaos", icon: AlertTriangle, desc: "same component as Chaos" },
      {
        id: "dup-safety",
        to: "/safety-ops",
        label: "/safety-ops",
        icon: ShieldCheck,
        desc: "same component as Safety Ops",
      },
      {
        id: "dup-ml",
        to: "/research/ml-experiments",
        label: "/research/ml-experiments",
        icon: FlaskConical,
        desc: "folded into Launch",
      },
      {
        id: "dup-strategy",
        to: "/research/strategy-backtests",
        label: "/research/strategy-backtests",
        icon: FlaskConical,
        desc: "folded into Launch",
      },
      {
        id: "dup-exec",
        to: "/research/execution-backtests",
        label: "/research/execution-backtests",
        icon: FlaskConical,
        desc: "folded into Launch",
      },
    ],
  },
];

/** The deduplicated nav — one entry per screen (excludes the legacy quarantine). */
export const NAV_GROUPS_CANONICAL = NAV_GROUPS.filter((g) => !g.legacy);

/** The 14 canonical entries, flat + in group order. Drives BOTH the dropdown and the cockpit bar. */
export const NAV_ITEMS_CANONICAL = NAV_GROUPS_CANONICAL.flatMap((g) => g.items);

/**
 * The cockpit tab a nav entry selects, or `null` if it navigates to its own route.
 * `/cockpit` (no query) is the default `health` tab. Lets the always-visible cockpit
 * bar render tab-switchers and route-links from the SAME list as the dropdown, so the
 * two can never drift.
 */
export function cockpitTabIdFor(to: string): string | null {
  const [path, query] = to.split("?");
  if (path !== "/cockpit") return null;
  return query ? (new URLSearchParams(query).get("tab") ?? "health") : "health";
}

/**
 * Is `to` the screen currently on display? Shared by the dropdown and the always-visible
 * top bar so their highlight rules can't diverge. Cockpit entries compare the `?tab=`
 * param (bare `/cockpit` == the default `health` tab); everything else matches the path
 * (or a deeper detail route under it, e.g. /deployments/:name keeps Deployments lit).
 */
export function navItemIsActive(to: string, pathname: string, search: string): boolean {
  const [path] = to.split("?");
  if (path === "/cockpit") {
    if (pathname !== "/cockpit") return false;
    const current = new URLSearchParams(search).get("tab") ?? "health";
    return current === (cockpitTabIdFor(to) ?? "health");
  }
  return pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
}

/** The redundant-route quarantine, rendered apart from the canonical grid. */
const LEGACY_GROUP = NAV_GROUPS.find((g) => g.legacy);

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

  const isActive = (to: string): boolean => navItemIsActive(to, location.pathname, location.search);

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
        className="absolute left-2 top-full z-50 mt-1 max-h-[min(80vh,720px)] w-[min(92vw,760px)] overflow-y-auto rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 shadow-2xl"
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
          {NAV_GROUPS_CANONICAL.map((group) => (
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

        {/* Redundant-route quarantine — every entry here renders the SAME component as a
            canonical entry above, just under different chrome. Kept clickable so the two
            can be compared side by side; delete this whole group once the standalone
            routes are redirected into their cockpit tab. */}
        {LEGACY_GROUP ? (
          <div className="mt-4 border-t border-[var(--color-border-default)] pt-3" data-testid="nav-menu-legacy">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent-orange)]">
                {LEGACY_GROUP.heading}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                same content as above — different chrome
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {LEGACY_GROUP.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={onClose}
                    role="menuitem"
                    title={item.desc}
                    data-testid={`nav-menu-item-${item.id}`}
                    className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                      active
                        ? "border-[var(--color-accent-orange)]/50 bg-[var(--color-accent-orange)]/10 text-[var(--color-accent-orange)]"
                        : "border-[var(--color-border-default)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
