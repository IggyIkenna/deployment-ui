# Data Status Redesign — Overview & Current Status

_Last updated: 2026-05-26 · branch `feat/data-status-redesign` (deployment-ui + deployment-api) · slot 3 worktree._

## 1. What we're trying to do

Replace the old, cramped **Data Status** tab in `deployment-ui` with the redesigned, dark, modern layout the operator
built in Claude Design (reference screenshots in [`../reference/`](../reference/)), and polish the surrounding app chrome
along the way. Goals:

- A clean **dark** dashboard (the app was accidentally rendering light on light-mode machines).
- A **coverage/health hero** (Honest Coverage %, Shards Captured, Needs Attention, As-Of) + per-asset-group tiles with
  stacked green/red coverage bars.
- A **Needs-Attention** panel (failures / missing dates / stale capture).
- A **COVERAGE visual switcher** with four layouts: **Heatmap** (per-AG calendars), **Stacked** (per-venue bars),
  **Matrix** (primary × day grid), **Columns** (Miller-column pivot) + a drilldown **drawer**.
- The old **inventory metrics** (Total shards, Instrument rows, Dates, Asset groups, Unique venues, Instruments latest).
- Wire it to **real data from current manifests** (manifest **v8**); defer anything needing GCS rewrites.

## 2. How we're working (isolation)

- All work is on branch **`feat/data-status-redesign`** in both **deployment-ui** and **deployment-api**, in the **slot-3
  worktree** (`.tabs/3/`). Root checkouts stay on `live-defi-rollout` — untouched.
- Local dev stack: **frontend** `:5183` (Vite) → **backend** `:8004` (deployment-api). Two backend modes:
  - **mock** (`CLOUD_MOCK_MODE=true`) — synthetic data; the redesign renders fully. Used for UI dev.
  - **real** (`CLOUD_PROVIDER=gcp CLOUD_MOCK_MODE=false`) — reads real GCS manifests (read-only; same as prod).
- Branches pushed to remote (GitHub `IggyIkenna/<repo>`). `feat/*` branches have **no remote CI** — quality enforced
  locally (typecheck + 0 console errors).

## 3. What's done (shipped on the branch)

### Frontend (`deployment-ui`)

- **Dark default** — light is now opt-in via `.theme-light` (was OS-forced, washing the UI white). `1d99062`
- **Readability + de-cramp** — killed 123 sub-10px fonts; row padding, gaps, defined stat cards. `bc163de`, `d0240a8`
- **Full redesign ported onto the real tab** — `DataStatusRedesign` replaces the old dense body for data-pipeline
  services (instruments / MTDS / MDPS / features): hero, AG tiles, legend, filter bar, Needs-Attention, the 4-visual
  switcher + drawer; uses the prototype's `redesign.css` verbatim. `f99a149`
- **Design-matching coverage colors** — green ≥95 / amber 80–95 / red <80. `7b11899`
- **Chrome polish** — fixed-width sidebar (`w-64`), bigger sidebar/tab/nav fonts, clickable logo + **Home** button. `be98e44`
- **Filter presets** — 30d / 60d / 90d / All. `f8e0705`
- **Columns small-axis columns populated** — `data_type` / `instrument_type` / etc. shipped up-front (instrument_id stays
  lazy). `1a8bec1`
- **Inventory stat row** (old "Instrument Coverage Summary" metrics) + **collapsible Needs-Attention**. `893a281`
- **Columns Download button wired** (was a dead placeholder) → builds the real `/download-csv` URL. `fe635b1`

### Backend (`deployment-api`)

- **`uv.lock` fix** — corrupt lock (werkzeug) blocked local boot; regenerated. (also pushed to LDR as `8937b39`) `fe900d1`
- **Mock drilldown tree** — synthesises a per-shard frame in mock mode so the UI renders locally. `33a5bd6`
- **`GET /data-status/grid`** — per-`(asset_group, primary, date)` coverage rollup (feeds heatmap/matrix/stacked/hero). `be9ed9a`
- **`axis_values` on `/grid`** — small-axis value lists fresh from the manifest (for the Columns columns). `3b3db4d`
- **Mock `coverage-summary`** populated (so inventory cards show numbers locally). `3bd18d3`

## 4. Current status: mock vs real

| Surface                                                | Mock backend                                      | Real backend                               |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------ |
| Hero / AG tiles / Stacked / Heatmap / Matrix / Columns | ✅ render                                         | ⛔ **hang** (see §5)                       |
| Inventory cards                                        | ✅ (sample numbers)                               | ✅ (real, ~1.7s)                           |
| Columns Download button                                | enables + opens URL; CSV is 404 (no mock parquet) | would return real CSV (once Columns loads) |

**The redesign fully works on the mock backend.** On the **real** backend it does **not** yet load its coverage data —
that's the main remaining work.

## 5. The blocker for real data (most important)

The redesign feeds entirely from **`/data-status/grid`**, and the Columns/drawer use **`/data-status/drilldown`**. Both
call `read_availability_index(bucket)`, which **downloads + parses the entire manifest index parquet on every request**.
The real MTDS-cefi index is **172 MB** → these endpoints take **60–90s+** and time out; a single slow request also stalls
the (single-worker) backend.

By contrast the **existing** endpoints are fast because they read a **pre-computed rollup blob**:
`/coverage-summary` ≈ 1.7s, `/turbo` ≈ 3.5s, `/config/shard-axis-matrix` ≈ instant.

## 6. Recommended next steps (to make the redesign work on real data)

1. **Re-architect the redesign's data layer to the fast endpoints (~80% win, no heavy backend work).**
   Hero, AG tiles, Stacked, and inventory only need per-venue rollups + totals → **`/turbo` + `/coverage-summary`
   already provide these fast**. Re-point `buildServiceDataset` at them. Only Heatmap + Matrix truly need per-day data.
2. **Date-resolved grid rollup (the one real backend lift).** Extend `data_status_rollup_worker` to emit a
   per-`(asset_group, primary, date)` blob (date-resolved, not collapsed), ~5-min TTL like turbo; `/grid` reads that blob
   instead of the raw index. Unblocks Heatmap + Matrix on real data.
3. **Cache/rollup-back `/drilldown`** — route it through the shared cached index (`DataStatusService._INDEX_CACHE`,
   5-min TTL) so the 172 MB read happens once, not per click. Unblocks Columns + drawer + the Download button on real data.
4. **Smaller gaps:** surface `failure_reason` text + batch `stale capture` for the Needs-Attention panel (the index has
   `capture_status` but not reason text); filter all reads to **`schema_version == 8`**; clear the ADC quota-project
   warning. Decide whether "Scheduled" mode is a real pipeline mode or a filter.

## 7. Deferred (operator-flagged)

- Anything requiring **GCS bucket data rewrites** or "drastic backend" changes (per operator 2026-05-25).
- Backfill button (no endpoint yet) — currently disabled.
- Live mode (backend `/live` is a Phase-11 stub).

## 8. How to run locally

```bash
# backend (from slot-3 deployment-api), MOCK — redesign renders fully:
cd .tabs/3/deployment-api
CLOUD_PROVIDER=local CLOUD_MOCK_MODE=true DISABLE_AUTH=true GCP_PROJECT_ID=test-project \
  ../../deployment-api/.venv/bin/python -m uvicorn deployment_api.main:app --host 127.0.0.1 --port 8004 &
# backend REAL (reads GCS; redesign coverage hangs until §6 lands) — add --workers 3 to stay responsive:
#   CLOUD_PROVIDER=gcp CLOUD_MOCK_MODE=false DISABLE_AUTH=true GCP_PROJECT_ID=central-element-323112 ... --workers 3

# frontend (from slot-3 deployment-ui):
cd .tabs/3/deployment-ui && npm run dev    # http://localhost:5183  → pick a service → Data Status
```

## 9. Where things are

- Prototype (design source): [`./`](./) — `js/*.jsx`, `styles.css`, `NOTES.md`. Reference screenshots: [`../reference/`](../reference/).
- Ported UI: `src/components/dataStatus/` (`DataStatusRedesign.tsx`, `redesign{Summary,Visuals,Drawer,Data,Icons,Util}`, `redesign.css`).
- Integration map: [`INTEGRATION_PLAN.md`](./INTEGRATION_PLAN.md). Shard-axis reference: [`docs/SHARD_AXIS_REFERENCE.md`](./docs/SHARD_AXIS_REFERENCE.md).
- Backend: `deployment_api/services/data_status_grid.py`, `data_status_mock_drilldown.py`, route in `routes/data_status.py`.
