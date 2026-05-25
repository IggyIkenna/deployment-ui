# Data Status Redesign — Integration Plan

Working plan for porting the `design/data-status-redesign/` prototype into the real
`deployment-ui` (React 19 + TS + Vite) app and wiring it to `deployment-api`.

- **Branch:** `feat/data-status-redesign` (both `deployment-ui` and `deployment-api`)
- **Worktree:** slot 3 (`.tabs/3/`) — root repos stay on `live-defi-rollout`.
- **Prototype reference:** `design/data-status-redesign/` (Babel-in-browser, synthetic data).
- **Target component being replaced:** `src/components/DataStatusTab.tsx` (~7.3k lines today).

---

## 1. Status-name remap (prototype ↔ backend SSOT)

The prototype invented its own status names; the backend uses the manifest 4-state vocabulary.
Normalise to the backend names at the API boundary; keep prototype names only as CSS class hooks.

| Prototype     | Backend (`capture_status`) | Notes                                                                         |
| ------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `captured`    | `captured`                 | 1:1                                                                           |
| `known-empty` | `empty_confirmed`          | honest empty (typed reason)                                                   |
| `empty`       | `empty_confirmed`          | backend does NOT split empty vs known-empty → collapse to one                 |
| `failed`      | `attempted_failed`         | 1:1                                                                           |
| `unattempted` | `expected_unattempted`     | 1:1                                                                           |
| `partial`     | _(derived)_                | UI-only: a `(primary,day)` cell whose sub-shards are mixed (0 < coverage < 1) |
| `future`      | _(derived)_                | UI-only: date > today                                                         |

**Action:** one mapping module `src/api/dataStatusModel.ts` — `normalizeCaptureStatus()` + the `CellStats` type. Every visual imports `CellStats` from here.

---

## 2. The contract the visuals need (`ds`) vs what the backend returns

All four visuals read one shape (see `NOTES.md` § "Wiring to real APIs"):

```
ds.agData[ag] = { primary, primaryValues, subAxes, shardsPerCell,
                  grid[primaryValue][date] = CellStats,
                  byPrimary[primaryValue] = CellStats,
                  total = CellStats }
```

| `ds` piece                                                 | Powers                          | Backend source today                                                        | Status                       |
| ---------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- | ---------------------------- |
| `primary`, `primaryValues`, `subAxes`                      | all                             | `getShardAxisMatrix()` (`/config/shard-axis-matrix`)                        | ✅ have                      |
| `byPrimary[pv]`, `total` (rollup across dates)             | stacked, summary hero, AG tiles | `getDataStatusTurbo()` per-venue `capture_status_counts`                    | ✅ have (remap fields)       |
| `grid[pv][date]` (**per-day** status)                      | heatmap, matrix                 | turbo collapses day → counts; drilldown is axis-based, not date-based       | ⛔ **GAP — new endpoint**    |
| Miller-column per-axis-value coverage                      | columns                         | `getHierarchicalDrilldown()` tree, per-node `capture_status_counts`         | ✅ have (paginate per level) |
| drawer leaf detail                                         | drawer                          | `/drilldown` leaf + `/data-status/schema` (cols) + `/instruments-for-shard` | 🟡 partial (no sample rows)  |
| `failedSubShards[].reason/pillar`, NeedsAttention failures | issues panel                    | only `attempted_failed` enum; reason text only in CSV headers               | ⛔ **GAP — surface reason**  |
| stale-capture list                                         | issues panel                    | `/live` (stub) / per-AG `last-updated` only                                 | ⛔ **GAP (batch staleness)** |
| mode strip Batch/Scheduled/Live                            | summary                         | batch ✅, live = stub, scheduled = n/a                                      | 🟡 batch only for now        |

---

## 3. Backend work (`deployment-api`, same branch)

### 3a. P0 — per-(primary × date) coverage grid ← unblocks heatmap + matrix

New endpoint `GET /data-status/grid`:

- **Params:** `service`, `start_date`, `end_date`, `asset_group[]` (+ optional `venue[]`).
- **Returns:** per `(asset_group, primary_value, date)` →
  `{captured, empty_confirmed, attempted_failed, expected_unattempted, total, coverage}`,
  plus `byPrimary[pv]` and `total` rollups (so one call fills `ds.agData[ag]` fully).
- **Source:** the SAME availability-manifest indices the turbo rollup reads
  (`read_availability_index`), but `groupby(primary_axis, day)` **without collapsing the day axis**.
  The data already exists per-shard-per-day; turbo just aggregates it away.
- **Perf:** mirror turbo's offline-rollup pattern — extend the `data_status_rollup_worker`
  to emit a date-resolved grid blob, 5-min TTL. Keep payload lean: rollup only (sub-shard
  detail stays on drilldown).

### 3b. P1 — failure reason on rollup

Add `failure_reason` / error-classification + top-N `failedSubShards` to the grid/turbo response
(reason text exists; today only in CSV download headers). Powers NeedsAttention.

### 3c. P2 — batch staleness + leaf sample rows

- `last_captured_at` per primary/cell for the stale-capture list (batch).
- Extend `/data-status/schema` to optionally return N sample rows for the drawer.
- "Scheduled" mode: decide whether it's a real pipeline mode or just a filter (operator call).

---

## 4. UI port — component map (prototype → `src/`)

Rebuild as `.tsx` (React 19, repo's `ui/` primitives + `index.css` tokens — the prototype's
`styles.css` is already token-faithful, lift the new classes `.cols-*`, `.day-strip-*`, `.tooltip-*`).

| Prototype file                                 | Target                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `js/axes.jsx`                                  | drop — use live `getShardAxisMatrix()`; keep `docs/shard-axis-matrix.json` as mock fixture  |
| `js/data.jsx` (`buildServiceDataset`)          | `src/api/dataStatusModel.ts` — real fetch → `ds`; keep synthetic gen behind `VITE_MOCK_API` |
| `js/util.jsx`                                  | fold into `src/lib/` (dates) + existing icon set                                            |
| `js/chrome.jsx`                                | reuse existing sidebar/tab chrome where possible; add shard-shape tooltip                   |
| `js/summary.jsx`                               | `src/components/dataStatus/SummaryHero.tsx`                                                 |
| `js/filters.jsx`                               | `src/components/dataStatus/FilterBar.tsx`                                                   |
| `js/issues.jsx`                                | `src/components/dataStatus/NeedsAttention.tsx` (gated on 3b)                                |
| `js/visual-heatmap/stacked/matrix/columns.jsx` | `src/components/dataStatus/visuals/*.tsx`                                                   |
| `js/drawer.jsx`                                | `src/components/dataStatus/DrilldownDrawer.tsx` (wire to `/drilldown`)                      |
| `tweaks-panel.jsx`                             | dev-only; gate behind a flag or drop for prod                                               |
| `js/app.jsx`                                   | becomes the new `DataStatusTab.tsx`                                                         |

---

## 5. Phasing (each phase independently shippable)

1. **Spike (validates the approach):** port **Miller-columns + drilldown drawer** wired to the
   _existing_ `getHierarchicalDrilldown()` + `getShardAxisMatrix()`. No backend change needed —
   proves the hardest real-data path works. Keep heatmap/matrix on mock.
2. **Stacked + Summary hero + Filters** on `getDataStatusTurbo()` (remap fields). Real data.
3. **Backend 3a** (`/data-status/grid`) → switch heatmap + matrix to real per-day data.
4. **Backend 3b** + NeedsAttention panel.
5. **3c** + mode strip + drawer sample rows. Retire old `DataStatusTab.tsx`.

## 6. Gates (per workspace rules)

- TS strict: no `any`, no `@ts-ignore`, zero ESLint warnings.
- UI playwright gate (HARD RULE): each shipped UI item needs `pw:L2 ✓` (`npx playwright test --project=chromium tests/smoke/`) + a regression spec in `tests/`.
- `deployment-api` changes: `bash scripts/quality-gates.sh` green (basedpyright strict, ruff) before merge.
- Quickmerge `--agent`, not raw push.
