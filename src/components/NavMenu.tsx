import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Database,
  FlaskConical,
  GitBranch,
  Layers,
  Package,
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
 * at the cockpit tab wherever a fold exists; `/home`, `/epics`, `/ops/costs` are
 * canonical because they have no cockpit twin. `/vm-deployments`'s archive/history
 * table folded into Deployments' per-target detail History card (Fleet-tab
 * consolidation, 2026-07-21), but the ROUTE itself stays live in the `legacy` group
 * below (NOT deleted/redirected — operator decision, BLK-7cb5bbbc) because its
 * non-compact mode is the only reachable home for 4 venue-config panels the
 * consolidation audit never accounted for. The cockpit's Fleet tab embeds only the
 * COMPACT `VmDeploymentsContent` (active/archive census, no venue panels).
 *
 * The `legacy` group is the legacy URLs, kept visible-but-quarantined so the operator can
 * compare chromes before deciding what to delete. Three kinds live here now: routes that
 * still render a SECOND COPY of the screen (compare them against the canonical entry); routes
 * that merely REDIRECT to the canonical tab (kept so old bookmarks/deep-links survive, since
 * the LandingTabs bar was deleted 2026-07-17); and a route whose PRIMARY content folded into a
 * canonical screen but which still carries UNIQUE functionality with no other home
 * (`/vm-deployments`'s venue-config panels — see the fold note above). Listing routes here is
 * also what keeps them reachable: `scripts/orphan-audit.ts` fails a declared route with no
 * inbound <Link>, and the whitelist's three reason prefixes (MACHINE-ONLY / API-HANDLER /
 * UNAUTHENTICATED-FUNNEL) deliberately have no "compat redirect" category. Delete the group
 * — and the routes — together.
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
        to: "/deploy",
        label: "Deploy Console",
        icon: Rocket,
        desc: "Launch / rollback",
        short: "Deploy",
      },
      {
        id: "deployments",
        to: "/deployments",
        label: "Deployments",
        icon: Layers,
        desc: "Live · batch · paper + live ops",
        short: "Deployments",
      },
    ],
  },
  {
    heading: "Data",
    items: [
      {
        // Data Status is a PER-SERVICE tab (/service/<name>/data-status) — 8 services have
        // one, so a single nav entry has to name a default. instruments-service is the
        // canonical pick: it's the service the cockpit's own Data Coverage tile reads
        // (health_overview._coverage_tile -> read_coverage_rollup_if_fresh("instruments-service")).
        // Switch service from the sidebar once you're there.
        id: "data-status",
        to: "/service/instruments-service/data-status",
        label: "Data Status",
        icon: Database,
        desc: "Coverage · manifest (instruments-service)",
        short: "Data Status",
      },
      {
        id: "consolidators",
        to: "/consolidators",
        label: "Consolidators",
        icon: Boxes,
        desc: "Index age · shard fallback",
        short: "Consolidators",
      },
    ],
  },
  {
    heading: "Fleet & Cost",
    items: [
      {
        id: "fleet",
        to: "/fleet",
        label: "Fleet",
        icon: Layers,
        desc: "Census · orphans · git · infra",
        short: "Fleet",
      },
      {
        id: "costs",
        to: "/ops/costs",
        label: "Costs",
        icon: CircleDollarSign,
        desc: "Tri-cloud spend breakdown",
        short: "Costs",
      },
      {
        id: "artifacts",
        to: "/ops/artifacts",
        label: "Artifacts",
        icon: Package,
        desc: "Build → artifact → deploy pipeline",
        short: "Artifacts",
      },
    ],
  },
  {
    heading: "Repos & Alerts",
    items: [
      {
        id: "repos",
        to: "/ci",
        label: "Repos / CI",
        icon: GitBranch,
        desc: "Last-green · promotion lag",
        short: "CI",
      },
      {
        id: "alerts",
        to: "/alerts",
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
        to: "/safety-ops",
        label: "Safety Ops",
        icon: ShieldCheck,
        desc: "Kill-switch + guardrails",
        short: "Safety",
      },
      {
        id: "chaos",
        to: "/chaos",
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
        to: "/launch",
        label: "Launch Console",
        icon: FlaskConical,
        desc: "ML · strategy · execution backtests",
        short: "Launch",
      },
    ],
  },
  // The "Duplicate routes — pending removal" quarantine group was DELETED 2026-07-17 together
  // with its routes: the UI moved to ONE plain-URL scheme (operator decision), so `?tab=` is
  // gone and the standalone/redirect duplicates it existed to compare no longer exist. /repos
  // and /infra survive only as bookmark-compat redirects in App.tsx (→ /ci, /fleet), with no
  // nav entry.
  {
    // Legacy quarantine REINTRODUCED (Fleet-tab consolidation, operator decision 2026-07-21 —
    // BLK-7cb5bbbc): /vm-deployments' archive/history table folded into Deployments' per-target
    // History card, but the route stays LIVE (not deleted/redirected) because its non-compact
    // mode is the only reachable home for 4 venue-config panels (VenueCredentialsPanel/
    // VenueDateRangePanel/VenueRelaunchEstimatePanel/VenueTardisWindowsPanel) — an audit gap the
    // consolidation plan never accounted for. Removed from the canonical dropdown/bar only;
    // still in NAV_LINKS_FLAT (mobile hamburger) + still a real route, so old bookmarks/deep-links
    // and the venue panels stay reachable.
    heading: "Legacy",
    legacy: true,
    items: [
      {
        id: "vm-deployments",
        to: "/vm-deployments",
        label: "VM Deployments (legacy)",
        icon: Server,
        desc: "Full per-VM history + venue config panels — folded into Deployments' History card",
        short: "VMs",
      },
    ],
  },
];

/** The deduplicated nav — one entry per screen (excludes the legacy quarantine). */
export const NAV_GROUPS_CANONICAL = NAV_GROUPS.filter((g) => !g.legacy);

/** The 14 canonical entries, flat + in group order. Drives BOTH the dropdown and the cockpit bar. */
export const NAV_ITEMS_CANONICAL = NAV_GROUPS_CANONICAL.flatMap((g) => g.items);

/**
 * The former cockpit-tab id for a nav entry's plain route, or `null` if the entry has no
 * cockpit-pane heritage. Since the `?tab=` scheme was retired (2026-07-17) every pane is its
 * own plain route; this map lets the always-visible bar keep its stable `cockpit-tab-<id>`
 * testids (vs `cockpit-navlink-<id>` for the five screens that were never cockpit panes).
 */
const PLAIN_ROUTE_TO_TAB_ID: Record<string, string> = {
  "/cockpit": "health",
  "/deploy": "deploy",
  "/deployments": "deployments",
  "/fleet": "fleet",
  "/consolidators": "consolidators",
  "/ci": "ci",
  "/alerts": "alerts",
  "/launch": "launch",
  "/chaos": "chaos",
  "/safety-ops": "safety",
};

export function cockpitTabIdFor(to: string): string | null {
  return PLAIN_ROUTE_TO_TAB_ID[to] ?? null;
}

/**
 * Is `to` the screen currently on display? Shared by the dropdown and the always-visible top
 * bar so their highlight rules can't diverge. Plain path match, with prefix matching for
 * deeper routes (e.g. /deployments/:name keeps the Deployments entry lit).
 */
export function navItemIsActive(to: string, pathname: string): boolean {
  const path = to.split("?")[0];
  return pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
}

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

  const isActive = (to: string): boolean => navItemIsActive(to, location.pathname);

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
      </div>
    </>
  );
}
