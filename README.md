# deployment-ui

**Port:** 5183 | **API:** deployment-api (port 8004) | **Type:** ui-control

Deployment control centre for batch and live services. Operators use this to deploy new versions of any service, monitor
build progress, check service readiness, review config, and access deployment history. Supports both batch pipeline
deployments and live trading service deployments.

## What it does

The top-bar nav (`src/components/NavMenu.tsx` — single source of truth for both the desktop dropdown and mobile
hamburger) groups 16 screens into 7 sections:

| Group                | Screens                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Overview             | Cockpit (health rollup, default page) · Home (service picker) · Epics & Plans                      |
| Deploy & Deployments | Deploy Console (launch/rollback) · Deployments (live/batch/paper + live ops) · Venue Config        |
| Data                 | Data Status (per-service GCS coverage/manifest) · Consolidators (index age, shard fallback)        |
| Cost & Artifacts     | Costs (tri-cloud spend) · VM Resources (cross-VM CPU/mem/disk) · Artifacts (build→artifact→deploy) |
| Repos & Alerts       | Repos / CI (last-green, promotion lag) · Alerts & Logs                                             |
| Safety & Chaos       | Safety Ops (kill-switch + guardrails) · Chaos (resilience testing)                                 |
| Research             | Launch Console (ML · strategy · execution backtests)                                               |

## Architecture

This is a separate repo from the deployment backend per the UI/service separation rule:

- `deployment-service` — Terraform, configs, shard calculator, Cloud Build YAML (no UI code)
- `deployment-api` — FastAPI orchestrator API, SSE progress stream
- `deployment-ui` — This repo. React/TypeScript UI calling `deployment-api` via REST and SSE

## Local dev

```bash
npm install
cp .env.example .env.development   # set VITE_DEPLOYMENT_API_URL and VITE_GOOGLE_CLIENT_ID
npm run dev                         # http://localhost:5183
```

Static mock mode (no backend needed):

```bash
VITE_MOCK_API=true VITE_SKIP_AUTH=true npm run dev
```

## Environment variables

| Variable                  | Default                 | Description                               |
| ------------------------- | ----------------------- | ----------------------------------------- |
| `VITE_DEPLOYMENT_API_URL` | `http://localhost:8004` | deployment-api base URL                   |
| `VITE_GOOGLE_CLIENT_ID`   | —                       | Google OAuth client ID                    |
| `VITE_MOCK_API`           | `false`                 | Enable client-side static mock mode       |
| `VITE_SKIP_AUTH`          | `false`                 | Bypass auth gate (use with VITE_MOCK_API) |

## Tests

```bash
npm test               # Vitest unit tests
npm run test:e2e       # Playwright smoke tests
```

## Quality gates

```bash
bash scripts/quality-gates.sh        # lint + typecheck + tests
bash scripts/quickmerge.sh "message" # merge after gates pass
```

## Tech stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router v6 · Radix UI · class-variance-authority

## Dependency migration (2026-04-16)

This repo previously depended on three external sibling packages:

- `@unified-trading/ui-kit` — shared shadcn components
- `@unified-trading/ui-auth` — OAuth 2.0 PKCE / Cognito / Google adapters
- `@unified-admin/core` — API client and auth helpers

All three repos have been **archived on GitHub** (read-only). Their functionality is now
inlined in this repo:

- UI components → `src/components/ui/` (standard shadcn/Radix implementations)
- Auth adapters → `src/auth/` (Cognito + Google OAuth, inline)
- API client → `src/api/client.ts` (fetch-based, no external dependency)
