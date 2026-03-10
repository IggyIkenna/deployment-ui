#!/usr/bin/env bash
#
# Quality Gates Template — TypeScript/React UI
# SSOT: unified-trading-codex/06-coding-standards/quality-gates-ui-template.sh
#
# Rolled out via: python3 unified-trading-pm/scripts/propagation/rollout-quality-gates-unified.py
# Do NOT edit per-repo — edit this template and re-run rollout.
#
# Usage:
#   bash scripts/quality-gates.sh           # Full: typecheck + lint + build
#   bash scripts/quality-gates.sh --no-fix  # Same (no auto-fix for UI)
#   bash scripts/quality-gates.sh --quick   # Typecheck + lint only (skip build)
#
set -euo pipefail

QG_START=$(date +%s)

# Colour helpers
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_success() { echo -e "${GREEN}  ✅ $*${NC}"; }
log_fail()    { echo -e "${RED}  ❌ $*${NC}" >&2; }
log_warn()    { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
log_section() { echo -e "\n${GREEN}── $* ──${NC}"; }

QUICK=false
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    --no-fix) ;;  # no-op for UI; kept for interface compatibility
  esac
done

echo "======================================================================"
echo "  UI Quality Gates — $(basename "$(pwd)")"
echo "======================================================================"

# ── [1] TYPE CHECK ─────────────────────────────────────────────────────────
log_section "[1/3] TYPE CHECK"
if [ ! -f "package.json" ]; then
  log_fail "No package.json found"; exit 1
fi
if npm run typecheck 2>&1; then
  log_success "TypeScript type check passed"
else
  log_fail "TypeScript type check FAILED"; exit 1
fi

# ── [2] LINT ───────────────────────────────────────────────────────────────
log_section "[2/3] LINT"
if npm run lint 2>&1; then
  log_success "ESLint passed"
else
  log_fail "ESLint FAILED"; exit 1
fi

# ── [3] BUILD ──────────────────────────────────────────────────────────────
if [ "$QUICK" = false ]; then
  log_section "[3/3] BUILD"
  if npm run build 2>&1; then
    log_success "Build passed"
  else
    log_fail "Build FAILED"; exit 1
  fi
else
  log_section "[3/3] BUILD — skipped (--quick)"
fi

# ── DURATION ───────────────────────────────────────────────────────────────
MAX_DURATION=${MAX_DURATION:-180}
QG_END=$(date +%s); DUR=$((QG_END - QG_START))
[ $DUR -gt $MAX_DURATION ] && { log_fail "Quality gates must complete in <${MAX_DURATION}s (took ${DUR}s)"; exit 1; }

echo -e "\n${GREEN}======================================================================"
echo -e "✅ ALL UI QUALITY GATES PASSED (${DUR}s)${NC}"
echo "======================================================================"
