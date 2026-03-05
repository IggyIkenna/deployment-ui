# deployment-ui

**Status:** v0.1.0 scaffold — UI split from unified-trading-deployment-v3

Deployment management UI (React/TypeScript):
- Orchestrator run status and shard progress dashboard
- Cloud Build trigger logs and CI/CD status
- Service health overview (Cloud Run instances)
- IBKR Gateway configuration UI
- Batch job scheduling controls

## Architecture

Per ui-service-separation rule: this UI is a SEPARATE repo from `unified-trading-deployment-v3`.
- `unified-trading-deployment-v3` — Terraform, configs, shard calculator, Cloud Build YAML (no UI code)
- `deployment-ui` — React/TypeScript UI calling deployment APIs via REST/SSE

## API Dependency

Calls `unified-trading-deployment-v3` orchestrator API endpoints.
Consumes SSE stream for live deployment progress.
