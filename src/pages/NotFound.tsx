/**
 * Real 404 — rendered for any URL that isn't a declared route AND isn't one of the
 * home-shell's own recognized surfaces (`/home`, `/service/:name(/:tab)`).
 *
 * Before this page existed, the `*` catch-all unconditionally rendered the per-service
 * home shell for every unmatched URL, so a typo'd or dead link silently showed "something"
 * instead of failing visibly — that's what let `/infra` render the wrong screen for weeks
 * (see unified-trading-pm/plans/active/issues/deployment_ui_nav_consolidation_2026_07_17.md).
 */
import { useLocation, Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";

export function NotFoundPage() {
  const location = useLocation();

  return (
    <main data-testid="not-found-page" className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <AlertCircle className="h-10 w-10 text-[var(--color-accent-red)] mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">Page not found</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mb-1">
          There's no screen at <code className="font-mono">{location.pathname}</code>.
        </p>
        <p className="text-sm text-[var(--color-text-secondary)] mb-6">
          Check the link, or use the nav bar above to find what you're looking for.
        </p>
        <Button asChild>
          <Link to="/cockpit">Back to Cockpit</Link>
        </Button>
      </div>
    </main>
  );
}
