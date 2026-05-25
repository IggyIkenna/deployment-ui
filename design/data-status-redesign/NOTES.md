# Data Status — redesign prototype

A self-contained React + HTML prototype of the redesigned **Data Status** tab for `deployment-ui`. Built against the SSOT in `docs/SHARD_AXIS_REFERENCE.md` + `docs/shard-axis-matrix.json`.

---

## Quick start

Open `Data Status.html` directly in a browser (or serve it from any static file server). No build step — everything is JSX transpiled in-browser via Babel standalone.

---

## File map

| File | What it does |
|---|---|
| `Data Status.html` | Entry point. Loads React 18 + Babel + all the JSX files in order. Contains the persisted `TWEAK_DEFAULTS` JSON. |
| `styles.css` | All styling. Faithful to `src/index.css` tokens (IBM Plex / JetBrains Mono / cyan-on-dark-zinc). Adds new classes: `.cols-*` (Miller columns), `.day-strip-*` (in-detail-pane day strip), `.tooltip-*`. |
| `tweaks-panel.jsx` | Tweaks shell — host protocol + `<TweakRadio>`, `<TweakSelect>`, etc. |
| `js/util.jsx` | Icons (inline SVG, lucide-style), date helpers (`ymd`, `fmtDateShort`, `fmtDateFull`), seeded RNG (`mulberry32`). |
| `js/axes.jsx` | **SSOT in code.** `SHARD_AXIS_MATRIX` mirrored from `docs/shard-axis-matrix.json`. `getShardAxes(service, ag)`, `getPrimaryAxis`, `axisValues`, `axisLabel`. |
| `js/data.jsx` | Synthetic data generator. `buildServiceDataset({service, seed, shardCap})` walks the axis matrix and produces a per-(ag, primary, date) grid of cell stats. Bypass-and-replace for real backend integration: same return shape ⇒ visuals just work. |
| `js/chrome.jsx` | Top bar (`TopHeader`), left service sidebar (`ServiceSidebar`), service tab strip + the shard-shape **hover tooltip** (`ServiceTabs`). |
| `js/summary.jsx` | The "hero" — `KeyStats`, per-AG `AssetGroupTile` cards, the simplified/full coverage `CoverageStack` legend, mode strip (Batch / Scheduled / Live). |
| `js/filters.jsx` | Filter bar with date-range presets, asset-group pill toggles, advanced popover (freshness gating, first-day-only, region). |
| `js/issues.jsx` | "Needs attention" panel (Failures / Missing dates / Stale capture) wired to `recentFailures` / `recentMissing` / `staleCapture` from `data.jsx`. |
| `js/visual-heatmap.jsx` | Visual #1 — per-AG mini calendars. |
| `js/visual-stacked.jsx` | Visual #2 — primary-axis-value rows with stacked coverage bars. |
| `js/visual-matrix.jsx` | Visual #3 — primary × day grid heatmap. |
| `js/visual-columns.jsx` | Visual #4 — Miller / Finder-style pivot columns (one column per axis incl. date). The big idea. |
| `js/drawer.jsx` | Right-side drilldown drawer with breadcrumbs. Multi-level stack with `useDrillStack` hook. Used by all visuals as a fallback "inspect" surface. |
| `js/app.jsx` | Top-level `App` component — wires everything + the Tweaks panel. |
| `docs/SHARD_AXIS_REFERENCE.md` | The doc you provided. Authoritative. |
| `docs/shard-axis-matrix.json` | The SSOT JSON. Authoritative. |

---

## Wiring to real APIs

The visuals all read from one shape: `ds = buildServiceDataset({service, seed, shardCap})`. That's the only place to swap.

`ds` shape:
```ts
{
  service: string,
  ags: string[],
  agData: {
    [ag: string]: {
      primary: string,           // primary axis name from SHARD_AXIS_MATRIX
      primaryValues: string[],   // ordered list of primary values
      subAxes: string[],         // remaining shard axes
      shardsPerCell: number,     // estimated sub-shards per (primary, day) cell
      grid: {                    // dense per-(primary, day) rollup
        [primaryValue: string]: {
          [date: string]: CellStats
        }
      },
      byPrimary: { [pv: string]: CellStats },  // grid rolled across dates
      total: CellStats,
    }
  }
}

CellStats = {
  total, captured, empty, 'known-empty', failed, unattempted, partial,
  status: 'captured' | 'partial' | 'failed' | 'missing' | 'empty' | 'future',
  coverage: number,    // 0..1
  rows: number,
}
```

Backend should produce this shape per `(service, date_range, asset_group_filter)` request, ideally by aggregating once over a pandas DataFrame and shipping the rollup. Per-cell sub-shard detail (instrument_id × data_type × …) is fetched on drilldown, not in the initial payload.

---

## What's still a placeholder

- **Cross-column synthesized counts** in the Columns view. The pivot view fakes deep-axis cardinality via a deterministic RNG keyed off the current selection. Replace `coverageFor` and `shardCountFor` in `js/visual-columns.jsx` with backend calls. Cache by selection-set on the client; backend can return all coverages in a single payload (one row per axis value, scoped to current selections).
- **Leaf shard parquet schema & sample rows** (in the drawer). Hardcoded mock — wire to `fetchShardSchema(...)`.
- **Live mode + Scheduled mode** — only the toggle is wired. The data layer currently models batch only.

---

## Visuals — pick-list

- `heatmap` — calendars per AG, color-coded days
- `stacked` — primary-axis rows, full-width stacked coverage bar each
- `matrix` — primary × day cell grid (dense)
- `columns` — Miller columns, every axis as a column, click to pin/unpin, full pivot navigation

User-toggleable via the Tweaks panel (top-right floating). The default is whatever the most recent `TWEAK_DEFAULTS` JSON in `Data Status.html` says.

---

## Conventions to preserve when porting

- IBM Plex Sans (UI), JetBrains Mono (any code/id/path), 13px base.
- Status colors: green `#4ade80` (captured), amber `#fbbf24` (partial / warn), red `#f87171` (failed / bad), sky `#7dd3fc` (known-empty), teal `#2dd4bf` (empty confirmed), missing = 50% red mixed with bg.
- "Honest coverage" uppercase legend / lowercase status strings — same convention as the existing app.
- Action affordances: cyan primary (`#22d3ee`) for the one action per surface.
