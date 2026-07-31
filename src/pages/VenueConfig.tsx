import { VenueCredentialsPanel } from "../components/VenueCredentialsPanel";
import { VenueDateRangePanel } from "../components/VenueDateRangePanel";
import { VenueRelaunchEstimatePanel } from "../components/VenueRelaunchEstimatePanel";
import { VenueTardisWindowsPanel } from "../components/VenueTardisWindowsPanel";

/**
 * VenueConfig — `/venue-config`, the canonical home for the 4 venue-config panels
 * (VenueCredentialsPanel/VenueDateRangePanel/VenueRelaunchEstimatePanel/VenueTardisWindowsPanel).
 *
 * These previously only rendered inside `VmDeploymentsContent`'s non-compact mode (the
 * standalone, now-legacy-quarantined `/vm-deployments` page) — see
 * `unified-trading-pm/plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md`.
 * Grouped under "Deploy & Deployments" in navItems.ts: all 4 panels directly configure/inform
 * the VM deployment workflow (credential status, backfill date ranges, relaunch cost, Tardis
 * concurrency), so they belong next to Deploy Console / Deployments, not under Fleet (which is
 * git-health/orphan-VM infra observability, a different concern).
 */
export function VenueConfig() {
  return (
    <main className="w-full app-shell-gutter py-4" data-testid="venue-config-page">
      <div className="mb-4">
        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Venue Config</h1>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
          Per-venue credential status, backfill date ranges, relaunch cost estimates, and Tardis concurrency windows.
        </p>
      </div>
      <div className="space-y-6">
        <VenueCredentialsPanel />
        <VenueDateRangePanel />
        <VenueRelaunchEstimatePanel />
        <VenueTardisWindowsPanel />
      </div>
    </main>
  );
}
