/**
 * Header — the one top bar: brand · always-visible page nav · status chip.
 *
 * Layout (operator 2026-07-17): the bar used to spend its left third on a two-line
 * "Unified Trading Deployment / deployment monitoring & orchestration" title and its right
 * half on seven always-on utility chips, leaving nowhere to put the page nav — which is why
 * the nav lived in a dropdown and, separately, as a tab bar inside the Cockpit. Brand is now
 * "UTS", the utilities collapse into StatusMenu, and the reclaimed middle carries TopNavBar
 * on every route.
 *
 * The dropdown (NavMenu) was deliberately kept alongside the bar for an A/B comparison; RULED
 * 2026-07-28 in favour of the bar (it survives every route, the dropdown's earlier cockpit
 * placement did not) and DELETED — see
 * plans/active/issues/deployment_ui_nav_consolidation_2026_07_17.md. The bar is now the sole
 * desktop nav surface; the brand is a static logo, not a menu trigger.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Server, X } from "lucide-react";
import { NAV_LINKS_FLAT } from "./NavMenu";
import { StatusMenu } from "./StatusMenu";
import { TopNavBar } from "./TopNavBar";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="relative border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-2 px-3 py-2 md:gap-3 md:px-4">
        {/* Brand — static logo, no menu affordance (the dropdown it used to trigger was
            deleted 2026-07-28; the always-visible bar below is the sole desktop nav). */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-accent-cyan)]/30 bg-[var(--color-accent-cyan)]/10">
            <Server className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          </div>
          <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">UTS</h1>
        </div>

        {/* The reclaimed middle — the always-visible page nav, on every route. */}
        <TopNavBar />

        {/* Hamburger — mobile only (the bar is desktop-only; this lists the same entries) */}
        <button
          className="ml-auto rounded p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] md:hidden"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          data-testid="mobile-menu-btn"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <StatusMenu />
      </div>

      {/* Mobile nav dropdown — same entries as the desktop dropdown (NAV_LINKS_FLAT). */}
      {mobileMenuOpen && (
        <nav
          className="flex flex-col gap-2 border-t border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3 md:hidden"
          data-testid="mobile-nav"
        >
          {NAV_LINKS_FLAT.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className="rounded px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
