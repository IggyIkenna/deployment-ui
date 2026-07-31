#!/usr/bin/env bash
# Epic: infrastructure_master
# Lifecycle: permanent
# Delete-when: NA
# Quality Gates Stub — TypeScript/React UI
# SSOT: unified-trading-pm/codex/06-coding-standards/quality-gates-ui-template.sh
#
# Rolled out via: python3 unified-trading-pm/scripts/propagation/rollout-quality-gates-unified.py
# Do NOT edit per-repo — edit base-ui.sh in PM and re-run rollout to propagate.
# Gate logic lives in: unified-trading-pm/scripts/quality-gates-base/base-ui.sh
#
# Usage:
#   bash scripts/quality-gates.sh           # Full: typecheck + lint + tests + build
#   bash scripts/quality-gates.sh --test    # Typecheck + tests only (skip lint + build)
#   bash scripts/quality-gates.sh --lint    # Typecheck + lint only (skip tests + build)
#   bash scripts/quality-gates.sh --quick   # Typecheck + lint only (skip tests + build)
#   bash scripts/quality-gates.sh --no-fix  # Same as full (no-op flag; kept for compatibility)
#
EXPECTED_BASE_VERSION="2.0"
WORKSPACE_ROOT="$(cd "$(git rev-parse --show-toplevel)/.." && pwd)"
BASE_UI="${WORKSPACE_ROOT}/unified-trading-pm/scripts/quality-gates-base/base-ui.sh"

# Raise test timeout: 75+ test files × jsdom env overhead (~60s) pushes past the 120s default on CI.
STEP_TIMEOUT_TEST=300

# Raise typecheck timeout: tsc --noEmit measures ~40s warm-cache locally, but on the newly-flipped
# self-hosted glue runner (5e0c49e/22df17f/210e4c4) it hit the 60s base default and was killed
# (run 30387759220, 2026-07-28 — promote PR deployment-ui#440 blocked). Same self-hosted I/O
# contention already forced a 10min->25min job-level timeout bump; give the internal step matching
# headroom rather than let it race the clock. Mirrors unified-trading-system-ui's
# STEP_TIMEOUT_TYPECHECK=600 precedent for the identical failure class.
STEP_TIMEOUT_TYPECHECK=300

# Bump total-runtime budget: unit-test suite has organically grown to ~184s, breaching the
# 180s base default (run 29113061555, 2026-07-10). Per codex/06-coding-standards/quality-gates.md
# "bump MAX_DURATION when a suite organically outgrows the budget" — never skip/deselect tests.
# Raised further (300->600) alongside the typecheck bump above so a slow-but-legitimate typecheck
# on the contended self-hosted runner doesn't itself trip the total-duration gate.
MAX_DURATION=600

# ── Per-repo QG exclusions ─────────────────────────────────────────────────

# Hardcoded-colour exclusions: pre-existing violations.
# DeployMissingButton: inline hex for warning-toast overlay.
# FixtureBreakdown: bg-[var(--color-bg-elevated,#111)] — CSS-var fallback, not a raw literal.
# ServiceEmissionStateBadge: state-specific palette (green/amber/orange/red) defined inline.
# index.css: root CSS variable definitions — hex values here are canonical design tokens.
# LiveDeployments: bg-[var(--color-bg-selected,#f0f4ff)] — CSS-var fallback, pre-existing.
# HealthFactorMonitorTile: recharts StrokeProps use hex inline — pre-existing chart styling.
CODEX_COLOUR_EXCLUDE_GLOBS=(
  "!src/components/DeployMissingButton.tsx"
  "!src/components/FixtureBreakdown.tsx"
  "!src/components/ServiceEmissionStateBadge.tsx"
  "!src/index.css"
  "!src/pages/LiveDeployments.tsx"
  "!src/components/widgets/strategy/HealthFactorMonitorTile.tsx"
  "!src/components/widgets/strategy/RecursiveBorrowDrilldown.tsx"
)

# console.* exclusions: legitimate uses that cannot be replaced with structured logging.
# ErrorBoundary: console.error is the only way to surface render errors to the browser devtools
#                before the error boundary UI renders — no structured logger available here.
CODEX_CONSOLE_EXCLUDE_GLOBS=(
  "!src/components/ErrorBoundary.tsx"
)

# Localhost-URL exclusions: these files use the correct import.meta.env.VITE_* pattern
# with http://localhost:... only as a dev-only fallback. CloudProviderContext has a JSDoc
# comment explaining why localhost is mentioned. All 3 are pre-existing.
CODEX_LOCALHOST_EXCLUDE_GLOBS=(
  "!src/api/treasury.ts"
  "!src/api/clientReporting.ts"
  "!src/contexts/CloudProviderContext.tsx"
)

if [[ ! -f "$BASE_UI" ]]; then
  echo "❌ Cannot find base-ui.sh at: $BASE_UI" >&2
  echo "   Ensure unified-trading-pm is cloned at the workspace root." >&2
  exit 1
fi

source "$BASE_UI" "$@"
