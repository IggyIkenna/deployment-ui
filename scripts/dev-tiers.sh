#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# dev-tiers.sh — Start the deployment stack at a specific runtime tier.
#
# Mirrors the unified-trading-system-ui tier ladder. Each tier flips ONE
# topology axis without changing the code path. Pick the tier matching the
# scope of validation you need:
#
#   T0 — UI only with in-browser mock (frontend-only dev / smoke). No backend
#        process. VITE_MOCK_API=true → all /api/* calls resolved by
#        src/lib/mock-api.ts. Fast, deterministic, no GCP.
#
#   T1 — Local UI + local deployment-api. Both in MOCK mode
#        (CLOUD_MOCK_MODE=true, DISABLE_AUTH=true). Same as `dev-start.sh
#        --stack deployment --mode mock`. Backend serves mock data; UI's
#        in-browser mock-api is ALSO active (overrides backend at fetch
#        layer). Useful when iterating on UI without backend changes.
#
#   T2 — Local UI + local deployment-api. NEITHER in mock. UI off-mock
#        (VITE_MOCK_API=false) hits real backend; backend off-mock
#        (CLOUD_MOCK_MODE=false) reads real GCP via ADC. Auth still skipped
#        (DISABLE_AUTH=true) so no OAuth dance. Validates the wiring
#        against actual services.
#
#   T3 — Local UI + cloud-deployed deployment-api. UI off-mock points at
#        the staging Cloud Run URL. Useful for debugging UI changes against
#        a stable backend without spinning up a local API. NOT YET DEPLOYED
#        — see "Cloud deployment" below.
#
#   T4 — Cloud-deployed UI + cloud-deployed deployment-api. Mirrors prod /
#        staging. Just opens the Cloud Run URLs in the browser. NOT YET
#        DEPLOYED — see "Cloud deployment" below.
#
# Usage:
#   bash scripts/dev-tiers.sh --tier 0
#   bash scripts/dev-tiers.sh --tier 1
#   bash scripts/dev-tiers.sh --tier 2
#   bash scripts/dev-tiers.sh --tier 3
#   bash scripts/dev-tiers.sh --tier 4
#   bash scripts/dev-tiers.sh --stop
#   bash scripts/dev-tiers.sh --status
#
# Cloud deployment (one-time setup for T3/T4):
#   cd deployment-api && gcloud builds submit --config=cloudbuild.yaml
#   cd deployment-ui  && gcloud builds submit --config=cloudbuild.yaml
#   Update STAGING_API_URL / STAGING_UI_URL below once deployed.
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE="$(cd "$UI_ROOT/.." && pwd)"
PM_DEV="$WORKSPACE/unified-trading-pm/scripts/dev"

# Cloud Run URLs for T3/T4 — empty until first deploy lands.
STAGING_API_URL="${DEPLOYMENT_API_CLOUD_URL:-}"
STAGING_UI_URL="${DEPLOYMENT_UI_CLOUD_URL:-}"

TIER=""
DO_STOP=false
DO_STATUS=false
NO_OPEN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier)        TIER="$2"; shift 2 ;;
    --stop)        DO_STOP=true; shift ;;
    --status)      DO_STATUS=true; shift ;;
    --no-open)     NO_OPEN=true; shift ;;
    --help|-h)
      grep '^#' "$0" | head -50
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if $DO_STOP; then
  bash "$PM_DEV/dev-stop.sh" 2>&1 | grep -v '^$' | tail -10
  exit 0
fi

if $DO_STATUS; then
  bash "$PM_DEV/dev-status.sh" 2>&1
  exit 0
fi

if [[ -z "$TIER" ]]; then
  echo "ERROR: --tier required (0|1|2|3|4)" >&2
  exit 1
fi

# Stop any existing stack so tier transitions are clean.
bash "$PM_DEV/dev-stop.sh" 2>&1 | grep -v '^$' | tail -3 || true

OPEN_FLAG=""
$NO_OPEN && OPEN_FLAG="--no-open"

case "$TIER" in
  0)
    echo ">>> T0 — UI only (in-browser mock; no backend)"
    # Frontend-only: API process not started; UI mock-api intercepts /api/*.
    bash "$PM_DEV/dev-start.sh" --ui deployment-ui --mode mock $OPEN_FLAG
    cat <<EOF

━━━ T0 active ━━━
  UI:        http://localhost:5183  (VITE_MOCK_API=true)
  Backend:   not started — UI mock-api handles all /api/* calls.
  Use case:  pure frontend dev, no GCP, no Python.
EOF
    ;;

  1)
    echo ">>> T1 — Local UI + local API, BOTH in mock mode"
    bash "$PM_DEV/dev-start.sh" --stack deployment --mode mock $OPEN_FLAG
    cat <<EOF

━━━ T1 active ━━━
  UI:        http://localhost:5183  (VITE_MOCK_API=true)
  API:       http://localhost:8004  (CLOUD_MOCK_MODE=true, DISABLE_AUTH=true)
  Use case:  full local stack, no real GCP, deterministic mock data.
  Note:      UI mock-api intercepts BEFORE backend — so backend effectively
             unused in this tier. Switch to T2 to exercise the real API path.
EOF
    ;;

  2)
    echo ">>> T2 — Local UI + local API, NEITHER in mock"
    # Force UI off-mock + backend reads real GCP via ADC.
    # Auth still skipped so we don't need OAuth setup locally.
    VITE_MOCK_API=false \
      CLOUD_MOCK_MODE=false \
      CLOUD_PROVIDER=gcp \
      DISABLE_AUTH=true \
      bash "$PM_DEV/dev-start.sh" --stack deployment --mode mock $OPEN_FLAG
    cat <<EOF

━━━ T2 active ━━━
  UI:        http://localhost:5183  (VITE_MOCK_API=false — hits backend)
  API:       http://localhost:8004  (CLOUD_MOCK_MODE=false — real GCP via ADC)
  Auth:      DISABLE_AUTH=true (no OAuth required)
  Use case:  validate full wiring against real cloud reads. Needs gcloud ADC:
               gcloud auth application-default login
EOF
    ;;

  3)
    echo ">>> T3 — Local UI + CLOUD deployment-api"
    if [[ -z "$STAGING_API_URL" ]]; then
      cat >&2 <<EOF

ERROR: T3 requires a deployed deployment-api Cloud Run service.

No URL configured. Either:
  1. Deploy deployment-api:
       cd $WORKSPACE/deployment-api
       gcloud builds submit --config=cloudbuild.yaml --project=central-element-323112
     Then re-run with the resulting URL:
       DEPLOYMENT_API_CLOUD_URL=https://deployment-api-...run.app bash $0 --tier 3

  2. Or set DEPLOYMENT_API_CLOUD_URL=https://<your-service>.run.app inline.

EOF
      exit 1
    fi
    VITE_MOCK_API=false \
      VITE_DEPLOYMENT_API="$STAGING_API_URL" \
      bash "$PM_DEV/dev-start.sh" --ui deployment-ui --mode mock $OPEN_FLAG
    cat <<EOF

━━━ T3 active ━━━
  UI:        http://localhost:5183  (VITE_MOCK_API=false)
  API:       $STAGING_API_URL  (Cloud Run)
  Use case:  iterate on UI against stable cloud backend.
EOF
    ;;

  4)
    echo ">>> T4 — Cloud UI + Cloud API"
    if [[ -z "$STAGING_UI_URL" || -z "$STAGING_API_URL" ]]; then
      cat >&2 <<EOF

ERROR: T4 requires both deployment-ui AND deployment-api on Cloud Run.

UI=$STAGING_UI_URL
API=$STAGING_API_URL

Deploy both:
  cd $WORKSPACE/deployment-api && gcloud builds submit --config=cloudbuild.yaml --project=central-element-323112
  cd $WORKSPACE/deployment-ui  && gcloud builds submit --config=cloudbuild.yaml --project=central-element-323112

Then export both URLs:
  DEPLOYMENT_UI_CLOUD_URL=https://...
  DEPLOYMENT_API_CLOUD_URL=https://...

EOF
      exit 1
    fi
    cat <<EOF

━━━ T4 — pointing at cloud ━━━
  UI:    $STAGING_UI_URL
  API:   $STAGING_API_URL

Nothing to start locally. Open the UI in your browser.
EOF
    if ! $NO_OPEN; then
      open "$STAGING_UI_URL" 2>/dev/null || true
    fi
    ;;

  *)
    echo "ERROR: --tier must be 0, 1, 2, 3, or 4 (got '$TIER')" >&2
    exit 1
    ;;
esac
