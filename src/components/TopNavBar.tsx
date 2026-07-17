/**
 * TopNavBar — the always-visible page nav, in the top bar on EVERY route.
 *
 * The A/B twin of the top-left dropdown (NavMenu): both render the same 14 canonical
 * entries from NAV_ITEMS_CANONICAL, so they can never drift apart. Lifting it out of the
 * Cockpit (where it was a `TabsList`, visible only on /cockpit) is what makes it actually
 * "always visible" — the four entries with no cockpit twin (Services / Epics / VMs /
 * Costs) used to take the bar away with them when clicked.
 *
 * Every entry is a plain Link, including the cockpit tabs: the Cockpit derives its active
 * tab from `?tab=` in the URL, so a Link to /cockpit?tab=fleet selects that tab from any
 * page. That also means the browser Back button walks the tab history, which the old
 * in-place `setSearchParams(..., {replace:true})` swallowed.
 *
 * Testids are unchanged from the old cockpit bar (`cockpit-tab-<tabId>` /
 * `cockpit-navlink-<id>`) so the existing cockpit specs keep driving it.
 */

import { Link, useLocation } from "react-router-dom";
import { cockpitTabIdFor, navItemIsActive, NAV_ITEMS_CANONICAL } from "./NavMenu";

export function TopNavBar() {
  const location = useLocation();

  return (
    <nav
      aria-label="Pages"
      data-testid="top-nav-bar"
      className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex"
    >
      {NAV_ITEMS_CANONICAL.map((item) => {
        const Icon = item.icon;
        const tabId = cockpitTabIdFor(item.to);
        const active = navItemIsActive(item.to, location.pathname, location.search);
        return (
          <Link
            key={item.id}
            to={item.to}
            title={item.desc}
            data-testid={tabId ? `cockpit-tab-${tabId}` : `cockpit-navlink-${item.id}`}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              active
                ? "bg-[var(--color-accent-cyan)]/10 text-[var(--color-accent-cyan)]"
                : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {item.short ?? item.label}
          </Link>
        );
      })}
    </nav>
  );
}
