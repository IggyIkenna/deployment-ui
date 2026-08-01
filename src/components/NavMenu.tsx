import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Database,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers,
  Package,
  Rocket,
  Server,
  ShieldCheck,
  Trophy,
} from "lucide-react";

type NavItem = {
  id: string;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  /** Compact label for the always-visible top bar (the mobile hamburger list uses `label`). */
  short?: string;
};
/** `legacy: true` = the redundant-route quarantine (see NAV_GROUPS). */
type NavGroup = { heading: string; items: NavItem[]; legacy?: boolean };

/**
 * Single source of truth for the top-bar page navigation. Consumed by the always-visible
 * TopNavBar and the mobile hamburger list (Header) so the two never drift.
 * Internal operator tool — every surface is one click away.
 *
 * ONE ENTRY PER SCREEN (2026-07-17 nav audit). The menu previously mixed chromes —
 * some entries pointed at a cockpit tab, others at the standalone page holding the
 * SAME component — so which chrome you got depended on which item you clicked, and
 * the same content appeared under two labels. Every canonical entry below now points
 * at the cockpit tab wherever a fold exists; `/home`, `/epics`, `/costs` are
 * canonical because they have no cockpit twin.
 *
 * `/vm-deployments` (the standalone list page) is fully RETIRED as of 2026-07-21 — its
 * archive/history table folded into Deployments' per-target History card, its 4
 * venue-config panels moved to the canonical `/venue-config`, "Reconcile Registry" moved to
 * /deployments' own header, and the raw active+archive VM table was deleted as redundant
 * with /deployments' own unified VM-kind inventory (see plans/active/issues/
 * vm_deployments_venue_panels_orphaned_route_2026_07_21.md). No `legacy` group currently
 * exists — the `legacy?: boolean` flag on `NavGroup` is a reusable convention (visible-but-
 * quarantined, kept so old bookmarks survive while functionality migrates out) for a FUTURE
 * fold, not a currently-populated group; `scripts/orphan-audit.ts`'s whitelist reason
 * prefixes (MACHINE-ONLY / API-HANDLER / UNAUTHENTICATED-FUNNEL) still apply to any route
 * kept reachable with no nav entry, like `/vm-deployments/:deploymentId` below.
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
      {
        // Relocated 2026-07-21 from the legacy-quarantined /vm-deployments page (see
        // plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md) —
        // these panels configure/inform the deploy workflow, not Fleet's infra observability.
        id: "venue-config",
        to: "/venue-config",
        label: "Venue Config",
        icon: KeyRound,
        desc: "Credentials · date range · relaunch estimate · Tardis windows",
        short: "Venue",
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
    heading: "Cost & Artifacts",
    items: [
      {
        id: "costs",
        to: "/costs",
        label: "Costs",
        icon: CircleDollarSign,
        desc: "Tri-cloud spend breakdown",
        short: "Costs",
      },
      {
        id: "vm-resource-comparison",
        to: "/vm-resources",
        label: "VM Resources",
        icon: Activity,
        desc: "Cross-VM CPU/mem/disk rolling-window comparison",
        short: "VM Resources",
      },
      {
        id: "artifacts",
        to: "/artifacts",
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
  // survives only as a bookmark-compat redirect in App.tsx (→ /ci), with no nav entry. /infra
  // (formerly → /fleet) has no redirect target left since /fleet's own removal (2026-07-27,
  // deployment_ui_fleet_tab_removal_2026_07_27.md) and now falls through to the catch-all.
  // The "Legacy" quarantine group (/vm-deployments, reintroduced for the Fleet-tab consolidation,
  // BLK-7cb5bbbc) was REMOVED 2026-07-21 — both features it existed to preserve now have real
  // homes: "Reconcile Registry" moved to /deployments' header, and the raw active+archive VM
  // table was deleted as redundant with /deployments' own unified VM-kind inventory (which
  // already has an archive/"all" status view). /vm-deployments/:deploymentId (the per-run
  // drill-down DeploymentDetail's History card links to) stays a real route with no nav entry —
  // same pattern as /deployments/:name. See
  // plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md.
];

/** The deduplicated nav — one entry per screen (excludes the legacy quarantine). */
export const NAV_GROUPS_CANONICAL = NAV_GROUPS.filter((g) => !g.legacy);

/** The canonical entries, flat + in group order. Drives the always-visible top bar. */
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
 * Is `to` the screen currently on display? Drives the always-visible top bar's highlight
 * rule. Plain path match, with prefix matching for deeper routes (e.g. /deployments/:name
 * keeps the Deployments entry lit).
 */
export function navItemIsActive(to: string, pathname: string): boolean {
  const path = to.split("?")[0];
  return pathname === path || (path !== "/" && pathname.startsWith(path + "/"));
}

/** Flattened {to,label} list for the mobile hamburger menu (Header). */
export const NAV_LINKS_FLAT = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label })));
