#!/usr/bin/env bash
# Stop deployment-ui + deployment-api.
set -euo pipefail

UI_PORT=5183
API_PORT=8004

for port in $UI_PORT $API_PORT; do
  PID=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "Stopping port $port (PID $PID)"
    kill $PID 2>/dev/null || true
  else
    echo "Nothing on port $port"
  fi
done

echo "Deployment stack stopped."
