/**
 * Header — the one top bar: brand + nav trigger · always-visible page nav · status chip.
 *
 * Layout (operator 2026-07-17): the bar used to spend its left third on a two-line
 * "Unified Trading Deployment / deployment monitoring & orchestration" title and its right
 * half on seven always-on utility chips, leaving nowhere to put the page nav — which is why
 * the nav lived in a dropdown and, separately, as a tab bar inside the Cockpit. Brand is now
 * "UTS", the utilities collapse into StatusMenu, and the reclaimed middle carries TopNavBar
 * on every route.
 *
 * The dropdown (NavMenu) is deliberately KEPT alongside the bar: both render the same 14
 * canonical entries, and the operator is comparing the two interaction models.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, Server, X } from "lucide-react";
import { NavMenu, NAV_LINKS_FLAT } from "./NavMenu";
import { StatusMenu } from "./StatusMenu";
import { TopNavBar } from "./TopNavBar";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="relative border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center gap-2 px-3 py-2 md:gap-3 md:px-4">
        {/* Top-left trigger — opens the page-nav dropdown. Internal operator tool, so this
            is a menu affordance (dismissable), not a customer-facing home logo. */}
        <button
          type="button"
          data-testid="nav-cockpit"
          onClick={() => setNavOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={navOpen}
          aria-label="Open navigation menu"
          className="group flex shrink-0 items-center gap-2"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-accent-cyan)]/30 bg-[var(--color-accent-cyan)]/10 group-hover:border-[var(--color-accent-cyan)]">
            <Server className="h-4 w-4 text-[var(--color-accent-cyan)]" />
          </div>
          <h1 className="flex items-center gap-1 text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
            UTS
            <svg
              className={`h-4 w-4 text-[var(--color-text-tertiary)] transition-transform ${navOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </h1>
        </button>

        <NavMenu open={navOpen} onClose={() => setNavOpen(false)} />

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
