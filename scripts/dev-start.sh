#!/usr/bin/env bash
# Start deployment-ui + deployment-api for local development.
# Ports are hardcoded to match ui-api-mapping.json (SSOT):
#   UI:  5183
#   API: 8004
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$(cd "$UI_DIR/../deployment-api" && pwd)"
WORKSPACE="$(cd "$UI_DIR/.." && pwd)"

UI_PORT=5183
API_PORT=8004

# ── Kill any existing processes on our ports ──
for port in $UI_PORT $API_PORT; do
  PID=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "Killing existing process on port $port (PID $PID)"
    kill -9 $PID 2>/dev/null || true
    sleep 1
  fi
done

# ── Start deployment-api (backend) ──
echo "Starting deployment-api on port $API_PORT..."
cd "$API_DIR"
source .venv/bin/activate 2>/dev/null || { echo "No .venv in deployment-api — run setup.sh first"; exit 1; }
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-central-element-323112}"
export CLOUD_PROVIDER="${CLOUD_PROVIDER:-gcp}"
export CLOUD_MOCK_MODE="${CLOUD_MOCK_MODE:-false}"
export DISABLE_AUTH="${DISABLE_AUTH:-true}"

nohup python3 -m uvicorn deployment_api.main:app \
  --host 0.0.0.0 --port $API_PORT \
  --reload \
  --reload-dir "$API_DIR/deployment_api" \
  --reload-dir "$WORKSPACE/unified-api-contracts/unified_api_contracts" \
  --reload-dir "$WORKSPACE/unified-trading-library/unified_trading_library" \
  --reload-dir "$WORKSPACE/deployment-service/deployment_service" \
  --timeout-keep-alive 120 \
  > /tmp/deployment-api.log 2>&1 &

API_PID=$!
echo "  API PID: $API_PID (log: /tmp/deployment-api.log)"

# Wait for API to be ready
for i in {1..10}; do
  if curl -s "http://localhost:$API_PORT/health" > /dev/null 2>&1; then
    echo "  API ready on http://localhost:$API_PORT"
    break
  fi
  sleep 1
done

# ── Start deployment-ui (frontend) ──
echo "Starting deployment-ui on port $UI_PORT..."
cd "$UI_DIR"
nohup npx vite --port $UI_PORT --host 0.0.0.0 > /tmp/deployment-ui.log 2>&1 &
UI_PID=$!
echo "  UI PID: $UI_PID (log: /tmp/deployment-ui.log)"
sleep 2

echo ""
echo "=== Deployment stack running ==="
echo "  UI:  http://localhost:$UI_PORT"
echo "  API: http://localhost:$API_PORT"
echo "  API hot-reload watches: deployment-api, UAC, UTL, deployment-service"
echo ""
echo "Stop: bash scripts/dev-stop.sh"
