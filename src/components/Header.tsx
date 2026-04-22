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
} from "lucide-react";
import { MOCK_MODE as FRONTEND_MOCK } from "../lib/mock-api";
import { useHealth } from "../hooks/useHealth";
import {
  useCloudProvider,
  type CloudTarget,
} from "../contexts/CloudProviderContext";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import * as api from "../api/client";

export function Header() {
  const { health, isHealthy, error } = useHealth();
  const { target, switchTarget, switching } = useCloudProvider();
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

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

  return (
    <header className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-secondary)]">
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-cyan)]/10 border border-[var(--color-accent-cyan)]/30">
            <Server className="h-5 w-5 text-[var(--color-accent-cyan)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
              Unified Trading Deployment
            </h1>
            <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
              deployment monitoring & orchestration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Data-mode chip: surface frontend + backend mock state */}
          {(() => {
            const backendMock = Boolean(health?.mock_mode);
            if (FRONTEND_MOCK && backendMock) {
              return (
                <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-300" title="VITE_MOCK_API=true + backend CLOUD_MOCK_MODE=true">
                  <FlaskConical className="h-3 w-3" /> MOCK (both)
                </Badge>
              );
            }
            if (backendMock) {
              return (
                <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-300" title="Backend CLOUD_MOCK_MODE=true — sample data, not live cloud">
                  <FlaskConical className="h-3 w-3" /> MOCK (API)
                </Badge>
              );
            }
            if (FRONTEND_MOCK) {
              return (
                <Badge variant="outline" className="text-xs gap-1 border-amber-500/40 text-amber-300" title="VITE_MOCK_API=true — UI intercepts /api/* locally">
                  <FlaskConical className="h-3 w-3" /> MOCK (UI)
                </Badge>
              );
            }
            return (
              <Badge variant="outline" className="text-xs gap-1 border-green-500/40 text-green-300" title={`Live data from ${health?.cloud_provider ?? "cloud"}`}>
                <Database className="h-3 w-3" /> LIVE
              </Badge>
            );
          })()}
          {/* Admin nav */}
          <Link
            to="/vm-deployments"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]"
          >
            VM Deployments
          </Link>
          <Link
            to="/client-subscriptions"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]"
          >
            Subscriptions
          </Link>
          <Link
            to="/chaos"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-accent-cyan)]"
          >
            Chaos
          </Link>
          {/* Cloud Provider Toggle */}
          <div className="flex items-center rounded-lg border border-[var(--color-border-default)] overflow-hidden">
            <button
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

          {switching && (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
          )}

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
                <span className="text-sm text-[var(--color-text-secondary)]">
                  API
                </span>
                <Badge variant="success">Connected</Badge>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-4 w-4 text-[var(--color-accent-red)]" />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  API
                </span>
                <Badge variant="error">Disconnected</Badge>
              </>
            ) : (
              <>
                <Activity className="h-4 w-4 text-[var(--color-text-tertiary)] animate-pulse" />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  API
                </span>
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
                color: health.gcs_fuse.active
                  ? "var(--color-accent-green)"
                  : "var(--color-accent-red)",
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
    </header>
  );
}
