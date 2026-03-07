# AGENTS.md

## Setup

```bash
npm install
```

## Quality Gates

```bash
npm run typecheck
npm run lint
npm run build
```

## Key Entry Points

- `src/main.tsx` — React application entry point

## Notes

- React + TypeScript + Vite UI for deployment management
- Unit tests via Vitest: `npm test`
- E2E tests via Playwright: `npm run test:e2e`
- Part of the 4-repo deployment cluster; consumes `deployment-api`
