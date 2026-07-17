/**
 * StatusMenu — the top bar's right-hand utilities, collapsed behind one chip.
 *
 * The top bar used to spend its whole right half on always-on chrome (data-mode badge,
 * env badge, cloud toggle, Clear Cache, API status, storage badge, version) — which left
 * no room for the page nav (operator 2026-07-17). They are all still here, one click away.
 *
 * What stays VISIBLE on the chip is the pair you must not have to click to discover:
 *   - the health dot — green connected / red disconnected / grey checking
 *   - LIVE vs MOCK — mistaking sample data for live capture is the expensive error, so the
 *     mock state is never hidden (and stays amber, matching MockModeBanner).
 * Everything else — the things you look up rather than monitor — lives in the panel.
 */

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  FlaskConical,
  Loader2,
  Trash2,
} from "lucide-react";
import { MOCK_MODE as FRONTEND_MOCK } from "../lib/mock-api";
import { useHealth } from "../hooks/useHealth";
import { useCloudProvider, type CloudTarget } from "../contexts/CloudProviderContext";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import * as api from "../api/client";

type EnvTier = "dev" | "staging" | "prod";

function resolveEnvTier(): EnvTier {
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "dev";
  if (h.startsWith("staging.")) return "staging";
  return "prod";
}

export function StatusMenu() {
  const { health, isHealthy, error } = useHealth();
  const { target, switchTarget, switching } = useCloudProvider();
  const [open, setOpen] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const envTier = resolveEnvTier();
  const backendMock = Boolean(health?.mock_mode);
  const anyMock = FRONTEND_MOCK || backendMock;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

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

  const handleCloudSwitch = (t: CloudTarget) => switchTarget(t);

  const dotClass = isHealthy
    ? "bg-[var(--color-accent-green)]"
    : error
      ? "bg-[var(--color-accent-red)]"
      : "bg-[var(--color-text-tertiary)]";

  // Mock is the one state worth shouting about even when collapsed.
  const modeLabel = anyMock ? "MOCK" : "LIVE";

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Status and settings"
        data-testid="status-menu-trigger"
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
          anyMock
            ? "border-amber-500/40 text-amber-300 hover:border-amber-400"
            : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent-cyan)]/40"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="font-mono">{modeLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Status and settings"
          data-testid="status-menu"
          className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3 shadow-2xl"
        >
          {/* Data mode — the full badge the top bar used to carry. */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Data
            </div>
            {FRONTEND_MOCK && backendMock ? (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-amber-500/40 text-amber-300"
                title="VITE_MOCK_API=true + backend CLOUD_MOCK_MODE=true"
              >
                <FlaskConical className="h-3 w-3" /> MOCK (both)
              </Badge>
            ) : backendMock ? (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-amber-500/40 text-amber-300"
                title="Backend CLOUD_MOCK_MODE=true — sample data, not live cloud"
              >
                <FlaskConical className="h-3 w-3" /> MOCK (API)
              </Badge>
            ) : FRONTEND_MOCK ? (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-amber-500/40 text-amber-300"
                title="VITE_MOCK_API=true — UI intercepts /api/* locally"
              >
                <FlaskConical className="h-3 w-3" /> MOCK (UI)
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-green-500/40 text-green-300"
                title={`Live data from ${health?.cloud_provider ?? "cloud"}`}
              >
                <Database className="h-3 w-3" /> LIVE DATA
              </Badge>
            )}
          </div>

          {/* API status + storage + version */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              API
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isHealthy ? (
                <>
                  <Activity className="h-4 w-4 text-[var(--color-accent-green)]" />
                  <Badge variant="success">Connected</Badge>
                </>
              ) : error ? (
                <>
                  <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                  <Badge variant="error">Disconnected</Badge>
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 text-[var(--color-text-tertiary)] animate-pulse" />
                  <Badge variant="pending">Checking...</Badge>
                </>
              )}
              {health?.gcs_fuse && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  title={health.gcs_fuse.reason}
                  style={{ color: health.gcs_fuse.active ? "var(--color-accent-green)" : "var(--color-accent-red)" }}
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
              {health && (
                <span className="rounded bg-[var(--color-bg-tertiary)] px-2 py-1 font-mono text-xs text-[var(--color-text-muted)]">
                  v{health.version}
                </span>
              )}
            </div>
          </div>

          {/* Environment — read-only, computed from hostname. NEVER a toggle. */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Environment
            </div>
            <div className="flex items-center gap-2">
              <span
                data-testid="env-tier-badge"
                className={`rounded border px-2 py-1 font-mono text-xs font-semibold ${
                  envTier === "dev"
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : envTier === "staging"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                {envTier.toUpperCase()}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1 font-mono text-xs">
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

          {/* Cloud provider toggle */}
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Cloud
            </div>
            <div className="flex items-center overflow-hidden rounded-lg border border-[var(--color-border-default)]">
              <button
                data-testid="cloud-toggle-gcp"
                onClick={() => handleCloudSwitch("gcp")}
                disabled={switching}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  target === "gcp"
                    ? "border-r border-[var(--color-border-default)] bg-[var(--color-accent-cyan)]/15 text-[var(--color-accent-cyan)]"
                    : "border-r border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                <Cloud className="h-3.5 w-3.5" />
                GCP
              </button>
              <button
                data-testid="cloud-toggle-aws"
                onClick={() => handleCloudSwitch("aws")}
                disabled={switching}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  target === "aws"
                    ? "bg-[var(--color-accent-orange)]/15 text-[var(--color-accent-orange)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }`}
              >
                <Cloud className="h-3.5 w-3.5" />
                AWS
              </button>
              {switching && <Loader2 className="mx-2 h-4 w-4 animate-spin text-[var(--color-text-muted)]" />}
            </div>
          </div>

          {/* Cache */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearCache}
            disabled={clearingCache}
            className="w-full justify-start text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            title="Clear all caches - forces fresh data on next request"
          >
            {clearingCache ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : cacheCleared ? (
              <CheckCircle2 className="mr-1 h-4 w-4 text-[var(--color-accent-green)]" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            {cacheCleared ? "Cleared!" : "Clear Cache"}
          </Button>
        </div>
      )}
    </div>
  );
}
