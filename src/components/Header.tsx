import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Server,
  AlertCircle,
  Trash2,
  Loader2,
  CheckCircle2,
  Cloud,
  Database,
  FlaskConical,
  Menu,
  X,
} from "lucide-react";
import { MOCK_MODE as FRONTEND_MOCK } from "../lib/mock-api";
import { useHealth } from "../hooks/useHealth";
import { useCloudProvider, type CloudTarget } from "../contexts/CloudProviderContext";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { NavMenu, NAV_LINKS_FLAT } from "./NavMenu";
import * as api from "../api/client";

type EnvTier = "dev" | "staging" | "prod";

function resolveEnvTier(): EnvTier {
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "dev";
  if (h.startsWith("staging.")) return "staging";
  return "prod";
}

export function Header() {
  const { health, isHealthy, error } = useHealth();
  const { target, switchTarget, switching } = useCloudProvider();
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [envTooltipOpen, setEnvTooltipOpen] = useState(false);
  const envTier = resolveEnvTier();

  const handleClearCache = async () => {
    setClearingCache(true);
    setCacheCleared(false);
    try {
      await api.clearCache();
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
    } catch {
      // Error surfaced via UI state
    } finally {
      setClearingCache(false);
    }
  };

  const handleCloudSwitch = (t: CloudTarget) => {
    switchTarget(t);
  };

  // Page nav is shared with the desktop dropdown (NavMenu) via NAV_LINKS_FLAT so the
  // mobile hamburger list and the dropdown never drift. The top-left trigger opens the
  // dropdown instead of force-navigating to /cockpit (operator 2026-07-08).
  const NAV_LINKS = NAV_LINKS_FLAT;

  return (
    <header className="relative border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        {/* Top-left trigger — opens the page-nav dropdown. Internal operator tool, so this
            is a menu affordance (dismissable), not a customer-facing home logo. */}
        <button
          type="button"
          data-testid="nav-cockpit"
          onClick={() => setNavOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={navOpen}
          aria-label="Open navigation menu"
          className="flex items-center gap-3 group"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30 group-hover:border-[var(--color-accent-cyan)]">
            <Server className="h-5 w-5 text-[var(--color-accent-cyan)]" />
          </div>
          <div className="text-left">
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight flex items-center gap-1.5">
              Unified Trading Deployment
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
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">deployment monitoring & orchestration</p>
          </div>
        </button>

        <NavMenu open={navOpen} onClose={() => setNavOpen(false)} />

        {/* Hamburger — mobile only */}
        <button
          className="md:hidden p-2 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          data-testid="mobile-menu-btn"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <div className="hidden md:flex items-center gap-3">
          {/* Data-mode chip: surface frontend + backend mock state */}
          {(() => {
            const backendMock = Boolean(health?.mock_mode);
            if (FRONTEND_MOCK && backendMock) {
              return (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-amber-500/40 text-amber-300"
                  title="VITE_MOCK_API=true + backend CLOUD_MOCK_MODE=true"
                >
                  <FlaskConical className="h-3 w-3" /> MOCK (both)
                </Badge>
              );
            }
            if (backendMock) {
              return (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-amber-500/40 text-amber-300"
                  title="Backend CLOUD_MOCK_MODE=true — sample data, not live cloud"
                >
                  <FlaskConical className="h-3 w-3" /> MOCK (API)
                </Badge>
              );
            }
            if (FRONTEND_MOCK) {
              return (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 border-amber-500/40 text-amber-300"
                  title="VITE_MOCK_API=true — UI intercepts /api/* locally"
                >
                  <FlaskConical className="h-3 w-3" /> MOCK (UI)
                </Badge>
              );
            }
            return (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-green-500/40 text-green-300"
                title={`Live data from ${health?.cloud_provider ?? "cloud"}`}
              >
                <Database className="h-3 w-3" /> LIVE DATA
              </Badge>
            );
          })()}
          {/* No page-nav here — the logo links to the cockpit (the default page), which
              hosts every surface. Top bar is utility-only below. Plan 0.7. */}
          {/* Env tier badge — read-only, computed from hostname. NEVER a toggle. */}
          <div className="relative">
            <button
              onClick={() => setEnvTooltipOpen((v) => !v)}
              onBlur={() => setTimeout(() => setEnvTooltipOpen(false), 150)}
              className={`px-2 py-1 text-xs font-mono font-semibold rounded border transition-colors ${
                envTier === "dev"
                  ? "bg-green-500/10 border-green-500/30 text-green-400 hover:border-green-400"
                  : envTier === "staging"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400 hover:border-red-400"
              }`}
              aria-label={`Environment: ${envTier}`}
            >
              {envTier.toUpperCase()}
            </button>
            {envTooltipOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-48 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3 shadow-xl text-xs">
                <div className="font-semibold text-[var(--color-text-primary)] mb-2">Environment</div>
                <div className="flex flex-col gap-1 font-mono">
                  <span>
                    <span className="text-[var(--color-text-tertiary)]">env: </span>
                    <span className="text-[var(--color-text-secondary)]">{envTier}</span>
                  </span>
                  <span>
                    <span className="text-[var(--color-text-tertiary)]">api: </span>
                    <span className="text-[var(--color-text-secondary)]">{window.location.origin}/api</span>
                  </span>
                  <span>
                    <span className="text-[var(--color-text-tertiary)]">cloud: </span>
                    <span className="text-[var(--color-text-secondary)]">{target}</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Cloud Provider Toggle */}
          <div className="flex items-center rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <button
              data-testid="cloud-toggle-gcp"
              onClick={() => handleCloudSwitch("gcp")}
              disabled={switching}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                target === "gcp"
                  ? "bg-[var(--color-accent-cyan)]/15 text-[var(--color-accent-cyan)] border-r border-[var(--color-border-default)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] border-r border-[var(--color-border-default)]"
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              GCP
            </button>
            <button
              data-testid="cloud-toggle-aws"
              onClick={() => handleCloudSwitch("aws")}
              disabled={switching}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                target === "aws"
                  ? "bg-[var(--color-accent-orange)]/15 text-[var(--color-accent-orange)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              AWS
            </button>
          </div>

          {switching && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />}

          {/* Clear Cache Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCache}
            disabled={clearingCache}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Clear all caches - forces fresh data on next request"
          >
            {clearingCache ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : cacheCleared ? (
              <CheckCircle2 className="h-4 w-4 mr-1 text-[var(--color-accent-green)]" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            {cacheCleared ? "Cleared!" : "Clear Cache"}
          </Button>

          {/* API Status */}
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <>
                <Activity className="h-4 w-4 text-[var(--color-accent-green)] animate-pulse" />
                <span className="text-sm text-[var(--color-text-secondary)]">API</span>
                <Badge variant="success">Connected</Badge>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                <span className="text-sm text-[var(--color-text-secondary)]">API</span>
                <Badge variant="error">Disconnected</Badge>
              </>
            ) : (
              <>
                <Activity className="h-4 w-4 text-[var(--color-text-tertiary)] animate-pulse" />
                <span className="text-sm text-[var(--color-text-secondary)]">API</span>
                <Badge variant="pending">Checking...</Badge>
              </>
            )}
          </div>

          {/* Storage Type */}
          {health?.gcs_fuse && (
            <Badge
              variant="outline"
              className="text-xs"
              title={health.gcs_fuse.reason}
              style={{
                color: health.gcs_fuse.active ? "var(--color-accent-green)" : "var(--color-accent-red)",
              }}
            >
              {target === "aws"
                ? health.gcs_fuse.active
                  ? "S3"
                  : "S3 API"
                : health.gcs_fuse.active
                  ? "GCS Fuse"
                  : "GCS API"}
            </Badge>
          )}

          {/* Version */}
          {health && (
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 rounded">
              v{health.version}
            </span>
          )}
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileMenuOpen && (
        <nav
          className="md:hidden border-t border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-4 py-3 flex flex-col gap-2"
          data-testid="mobile-nav"
        >
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium py-2 px-3 rounded text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]"
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
