# deployment-ui

**Status:** v0.1.0 scaffold — UI extracted from unified-trading-deployment-v3 (ARCHIVED 2026-03-03)

Deployment management UI (React/TypeScript):

- Orchestrator run status and shard progress dashboard
- Cloud Build trigger logs and CI/CD status
- Service health overview (Cloud Run instances)
- IBKR Gateway configuration UI
- Batch job scheduling controls

## Architecture

Per ui-service-separation rule: this UI is a SEPARATE repo from the deployment backend.

- `deployment-service` — Terraform, configs, shard calculator, Cloud Build YAML (no UI code)
- `deployment-api` — FastAPI orchestrator API
- `deployment-ui` — React/TypeScript UI calling deployment APIs via REST/SSE

## API Dependency

Calls `deployment-api` orchestrator API endpoints.
Consumes SSE stream for live deployment progress.
