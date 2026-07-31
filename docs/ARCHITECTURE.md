# deployment-ui — Architecture

## Purpose

React 18 operations dashboard for the deployment system — provides a 16-screen interface (7 nav groups) over
`deployment-api` for managing deployments, monitoring build status, checking service readiness, and inspecting config.

## Tab Structure

Single source of truth: `src/components/NavMenu.tsx` (`NAV_GROUPS`) — drives both the desktop dropdown and the
mobile hamburger menu, so the two can't drift from each other.

| Group                | Route(s)                                       | Purpose                                                                                   |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Overview             | `/cockpit`, `/home`, `/epics`                  | Health rollup (default page) · service picker · roadmap/plan status                       |
| Deploy & Deployments | `/deploy`, `/deployments`, `/venue-config`     | Launch/rollback · unified live/batch/paper deployment table · venue credentials & config  |
| Data                 | `/service/:name/data-status`, `/consolidators` | Per-service GCS coverage/manifest · index age & shard fallback                            |
| Cost & Artifacts     | `/costs`, `/vm-resources`, `/artifacts`        | Tri-cloud spend breakdown · cross-VM resource comparison · build→artifact→deploy pipeline |
| Repos & Alerts       | `/ci`, `/alerts`                               | Last-green / promotion lag · open alerts + log stream                                     |
| Safety & Chaos       | `/safety-ops`, `/chaos`                        | Kill-switch + guardrails · resilience testing                                             |
| Research             | `/launch`                                      | ML · strategy · execution backtests                                                       |

Routes with no nav entry but still reachable: `/deployments/:name`, `/vm-deployments/:deploymentId`,
`/vms/:vmName` (drill-down detail pages).

## Component Structure

```
src/
├── pages/            # One file per screen (Cockpit.tsx hosts several cockpit-tab panes as named
│                      # exports — CockpitHealth, CockpitDeploy, CockpitConsolidators, CockpitCi,
│                      # CockpitAlerts, CockpitLaunch, CockpitChaos, CockpitSafety — routed individually
│                      # in App.tsx rather than one page per file for that group)
├── auth/
│   ├── RequireAuth.tsx           # Auth gate — dispatches to Google or Cognito by VITE_AUTH_PROVIDER
│   ├── GoogleAuth.tsx
│   └── CognitoAuth.tsx           # AWS Cognito OAuth 2.0 PKCE
├── components/
│   ├── NavMenu.tsx               # NAV_GROUPS — SSOT for top-bar nav (dropdown + mobile)
│   ├── ui/                       # Radix UI + Tailwind primitives (button, card, dialog, ...)
│   └── *.tsx                     # Flat: deployment-flow components (DeployForm, DeploymentReadinessTab,
│                                  # DataStatusTab, CloudBuildsTab, ...) — no deployment/ subdir
├── api/
│   └── deploymentApi.ts         # Typed fetch wrappers for deployment-api
└── hooks/
    └── useServiceStatus.ts      # Polling hook for live status updates
```

## API Integration

All calls go to `deployment-api` at `VITE_DEPLOYMENT_API_URL` (default: `http://localhost:8004`).

Key endpoints consumed (see `src/api/deploymentApi.ts` for the full typed surface — all under `/api/`):

- `POST /api/deployments/{service}/deploy` — trigger deployment
- `GET /api/deployments` — history
- `GET /api/services` — service inventory / health
- `GET /api/builds/{service}` — Cloud Build history
- `GET /api/vm-deployments` — VM-kind deployment inventory

## Auth

`RequireAuth` gates on `VITE_AUTH_PROVIDER` (default `google`): Google OAuth or AWS Cognito PKCE — same pattern as
strategy-ui. All API calls include `Authorization: Bearer {token}` header. `VITE_SKIP_AUTH=true` bypasses the gate
for local/mock-mode dev.

## Tech Stack

- React 18 + TypeScript + Vite
- Radix UI — accessible component primitives
- Tailwind CSS — utility-first styling
- Lucide React — icon set
- React Query — server state + polling
