# Data Status — Coverage Fidelity (missing / empty / failed / phantom visibility)

> Living doc. Goal: make the redesigned Data Status tab a top-notch instrument for seeing —
> per service × asset_group × venue × data_type × date — exactly **what is captured, what is
> remaining, what is honestly empty, and what was attempted-and-failed (and WHY)**, across
> `instruments-service`, `market-tick-data-service` (MTDS) and `market-data-processing-service`
> (MDPS). Manifest **v8** only.
>
> Author: slot-3 / data-status redesign. Status: in progress.

## 1. Ground truth — real v8 manifest probe (2026-05-27, prod GCS, mock_mode=false)

Read live via `read_availability_index(bucket)` against `central-element-323112`.

### Bucket resolution (the three services)

`SERVICE_TO_KIND`: `instruments-service → instruments-store`, **both** `market-tick-data-service`
and `market-data-processing-service` → `market-data` (they **share one bucket per asset_group**;
the raw-vs-processed split is by `data_type`, not bucket).

| asset_group | instruments-service | MTDS + MDPS |
|---|---|---|
| cefi | `instruments-store-cefi-prd-central-element-323112` | `market-data-tick-cefi-prd-central-element-323112` |
| defi | `instruments-store-defi-prd-…` | `market-data-tick-defi-prd-…` |
| tradfi | `instruments-store-tradfi-prd-…` | `market-data-tick-tradfi-prd-…` |
| sports | `instruments-store-sports-prd-…` | `market-data-tick-sports-prd-…` |
| prediction | `instruments-store-pred-prd-…` | `market-data-tick-pred-prd-…` |

### Manifest schema (v8) — columns present

`date, venue, data_type, timeframe, league_id, chain, instrument_type, underlying, feature_group,
model_family, training_period, strategy_id, client_id, instruction_type, instrument_id,
instrument_count, service_name, written_at, schema_version, expected, available, capture_status,
error_reason, attempted_at, asset_group, row_count, enumerator_run_id, service_emission_state,
last_emission_decision_at, expected_window_completeness_fraction, pipeline_mode, feature_family,
quote_asset, margin_type, combo_type, leg_weights, fixture_id, job_id`

### `schema_version` — NO version drift at the index level (verified ALL buckets)

Full-index `schema_version` value_counts across **all 9 readable buckets** (2026-05-27):

| bucket | rows | schema_version | capture_status |
|---|---:|---|---|
| instruments-store-cefi | 30,803 | **100% '8'** | captured 18,431 · **NULL 12,372** |
| instruments-store-defi | 125,242 | **100% '8'** | captured 67,776 · **NULL 57,466** |
| instruments-store-tradfi | 20,264 | **100% '8'** | captured 8,891 · NULL 11,301 · empty 72 |
| instruments-store-sports | 2,680,309 | **100% '8'** | empty 1,908,861 · captured 586,554 · failed 178,025 · NULL 6,869 |
| market-data-tick-cefi | 2,632,931 | **100% '8'** | failed 1,330,095 · captured 1,302,686 · empty 150 |
| market-data-tick-defi | 1,633,711 | **100% '8'** | empty 1,292,275 · captured 339,203 · failed 2,233 |
| market-data-tick-tradfi | 144,062 | **100% '8'** | captured 100,536 · empty 37,490 · failed 6,036 |
| market-data-tick-sports | 786,235 | **100% '8'** | empty 583,948 · captured 202,067 · failed 220 |
| market-data-tick-pred | 16,812 | **100% '8'** | captured 14,491 · empty 2,321 |

**Every row is v8** — the version drift the operator worried about does NOT appear in the
consolidated availability index (the 2026-05-20 "0% at v8" incident has since been migrated to
100% v8). Drift, if any, would now be in the *raw data parquet* footers in the old vs PRD buckets,
not the manifest. See §3.

> **Transparency (sampled vs walked):** I read the FULL availability index for 9/10 buckets (not a
> sample). `instruments-store-pred` could not be read in the probe harness (UTL read-path needed
> `setup_events()` — an env quirk of the standalone probe, NOT a data problem; the API reads it
> fine since it initialises events on boot). Re-verify pred on next pass.

> **NULL `capture_status` in instruments-store** (cefi 12.4k / defi 57.5k / tradfi 11.3k / sports
> 6.9k): legacy rows the Tier-3D reconciler hasn't stamped. UTL legacy-read semantics + the UI
> classifier both coerce NULL → `captured`. The UI should label these "captured (legacy, unstamped)"
> so the operator knows they're un-reconciled, not freshly captured.

### `capture_status` — the 4-state taxonomy (3 populated today)

| status | defi rows | cefi rows | meaning |
|---|---|---|---|
| `captured` | 339,203 | 1,302,686 | manifest + GCS parquet both present → good |
| `empty_confirmed` | 1,292,275 | 150 | honest absence (typed reason) |
| `attempted_failed` | 2,233 | 1,330,095 | adapter ran and raised → `error_reason` set |
| `expected_unattempted` | 0 | 0 | not present in these buckets (handled defensively) |

> CeFi has **more `attempted_failed` (1.33M) than `captured` (1.30M)** — but most of those are
> legacy/migration markers, not live fetch failures (see reason split below). The UI must
> categorise, or the operator reads it as "half of CeFi is broken" which is false.

### `error_reason` — the dimension the redesign currently THROWS AWAY

Real distinct values observed (raw repr strings stamped by the writer):

**DeFi** — `EXPECTED_PRE_GENESIS_CHAIN` (688k), `EXPECTED_INSTRUMENT_NOT_LISTED` (598k), `''`
(captured, 339k), `SOURCE_RETURNED_ZERO` (6k), `404 GET https` (1.7k), `SCHEMA_VALIDATION_FAILED`
(198), `LegacyBlankErrorReasonError` (60), `legacy_bare_name_migrated_to_protocol_solana_…` (228),
`EXPECTED_PAST_SOURCE_COVERAGE_END` (8).

**CeFi** — `''` (captured, 1.30M), `LegacyBlankErrorReasonError` (789k),
`LEGACY_THIRDKEY_DRIFT_RECON_2026_05_07` (452k), `VENUE_FETCH_FAILED` (84k), `HTTP_429` (3.6k),
`HTTPSConnectionPool(host='storage.googleapis.com'…)` (870), `UNCLASSIFIED_VENUE_ERROR` (377),
`Connection timeout to host https` (180), `EXPECTED_PRE_VENUE_LAUNCH` (150),
`[Errno 28] Error writing bytes to file` (33), **`phantom_captured_no_parquet_at_canonical_path`**
(32 — literal phantom marker), `Server disconnected` (32), `HTTP_405` (7),
`Response payload is not completed` (3), `In CSV column #4` (2).

This maps directly onto the operator's mental model:
- **rate-limit** → `HTTP_429`
- **auth / API-key / OAuth** → `VENUE_FETCH_FAILED`, `UNCLASSIFIED_VENUE_ERROR`, `HTTP_401/403`
- **network** → `Connection timeout`, `Server disconnected`, `HTTPSConnectionPool`, `Response payload not completed`
- **not-found** → `404 …`, `HTTP_405`
- **schema/parse** → `SCHEMA_VALIDATION_FAILED`, `In CSV column …`
- **disk/io** → `[Errno 28] …`
- **phantom** (manifest says captured but no GCS parquet) → `phantom_captured_no_parquet_at_canonical_path`
- **legacy-migration noise** (NOT a live failure) → `LegacyBlankErrorReasonError`, `LEGACY_THIRDKEY_DRIFT_RECON_…`, `legacy_bare_name_migrated_…`
- **honest-empty** → `EXPECTED_*` (calendar/coverage), `SOURCE_RETURNED_ZERO`

### DATA-QUALITY BUG found — `instrument_type` case drift

`instrument_type` carries BOTH cases as distinct values:
`perpetual` (570k) **and** `PERPETUAL` (143k); `spot_pair` (390k) **and** `SPOT_PAIR` (177k);
`future` (598) **and** `FUTURE` (26); `pool` (252k) **and** `POOL` (2.4k). `data_type` also has a
blank `''` bucket (cefi 9.7k). These split a single logical shard family into two rows and make
coverage look worse than it is. The UI must surface this (group case-insensitively + flag the
drift); a manifest re-stamp is the real fix but is OUT OF SCOPE here (backfill/migration in
flight — do not run reconcilers).

## 2. Where each state/reason reaches the frontend today (the gaps)

| Path | Endpoint | Carries | Gap |
|---|---|---|---|
| Fast overview | `/turbo` (precomputed rollup, ~3s) | per-venue `dates_found/expected_venue/missing`, `missing_dates`, `completion_pct`, `missing_data_types`, `honest_data_types`, `capture_status_counts` | **NO `error_reason` categories.** `failure_pillars`/`empty_reasons` declared in TS but NOT populated by the rollup blob. |
| Inventory | `/coverage-summary` | totals, latest day | fine |
| Per-day grid | `/grid` (live, slow on 172MB) | per-(venue,date) counts | `_counts` drops 2 of 4 states (only captured/empty/failed); no reasons |
| Drilldown | `/drilldown/{svc}/{ag}` (live, bounded slice) | per-leaf `capture_status` + raw `error_reason` | reason is RAW string, not categorised; redesign drawer doesn't render it |

**Redesign UI gap:** `redesignData.ts::toAgData` extracts ONLY `capture_status_counts` per venue and
discards every per-venue completion field turbo already provides. Result: the operator opening
"DeFi Arbitrum" cannot see dates-done / dates-remaining / which dates / which data_types.

## 3. Old-bucket vs PRD-bucket + turbo label drift

- `resolve_bucket_name(...)` (live grid + drilldown) returns `…-prd-…` names.
- The **turbo precomputed rollup** labels its bucket WITHOUT `-prd-`
  (e.g. `market-data-tick-defi-central-element-323112`). The rollup blob was computed against the
  legacy (non-prd) bucket name. The numbers still render, but the *label* drifts from where the
  live grid/drilldown actually read. **Action:** surface the resolved (prd) bucket name in the UI
  and note the rollup-label provenance; do not silently mix. Tracked as a known drift, not fixed
  here (rollup recompute is a backend op outside this UI scope).
- Raw parquet old-vs-PRD physical split: the *manifest index* is unified at v8 in the PRD bucket;
  individual raw parquets may still live in the old bucket (migration in flight). This is exactly
  why a `captured` row can become `phantom_captured_no_parquet_at_canonical_path` — the manifest
  points at the canonical (PRD) path but the parquet is still in the old bucket. The UI flags
  phantom; the reconciler fixes it post-migration (NOT run here).

## 4. Architecture decisions (this work)

1. **Per-venue completion is frontend-only.** Turbo already has it → wire it through `toAgData`
   into `byPrimary` cells + the drawer. Zero backend risk. Biggest operator win.
2. **Reason categorisation needs `error_reason` → drilldown path.** Add a closed-set classifier
   (`reason_taxonomy.py`) shared by drilldown (per-leaf + per-slice rollup) and the coverage
   failure/empty rollups so categories show even without drilling. Bounded compute (one slice).
3. **Grid `_counts` → full 4-state** (cheap correctness fix; heatmap/matrix were undercounting
   known-empty/unattempted).
4. **Do NOT** run phantom reconcilers / re-stampers (backfill + migration in flight). Surface,
   don't mutate.
5. **Manifest v8 only:** filter reads to `schema_version == 8` where a column exists (defensive;
   indexes are already pure-v8).

## 4b. Finding — drilldown tree hides bundled-data_type failures (use reason_summary)

The drilldown axis order for MTDS DeFi is `venue → chain → data_type → instrument_id → date`.
Bundled data_types (`dex_swaps`, `dex_pool_swaps`, `oracle_prices`, …) have **blank
`instrument_id`** (the shard atom is venue+chain+data_type+date, no per-instrument row).
`_children_for_axis` drops blank-valued axis nodes (`v != "" and v != "nan"`), so those rows never
materialise a leaf and **disappear from the tree** — e.g. DeFi/ARBITRUM April: 60 `dex_swaps`
failures (`404 GET https`) are invisible in the leaf tree. They ARE counted in the response-level
`totals` + `reason_summary` (`{captured:270, fail_not_found:60}`), which is therefore the
**authoritative** failure surface. The redesign reason panel binds `reason_summary`, NOT the leaf
tree, so failures are never hidden. (Proper fix — collapse the spurious instrument_id axis for
bundled data_types in the tree — is a drilldown-shape change tracked as a follow-up, not this UI
pass.)

## 5. Reason taxonomy (closed set the UI binds)

`captured` · `empty_calendar` (EXPECTED_HOLIDAY/WEEKEND/PAUSED/SEASON/…) ·
`empty_coverage` (EXPECTED_PRE_GENESIS_CHAIN/PRE_VENUE_LAUNCH/PRE_SOURCE/NOT_LISTED/DELISTED/PAST_SOURCE/…) ·
`empty_source_zero` (SOURCE_RETURNED_ZERO/EXPECTED_UPSTREAM_EMPTY) · `empty_unclassified` ·
`fail_rate_limited` (HTTP_429) · `fail_auth` (HTTP_401/403, VENUE_FETCH_FAILED, UNCLASSIFIED_VENUE_ERROR, OAuth/api-key) ·
`fail_network` (timeout/disconnect/ConnectionPool/payload-not-completed) · `fail_not_found` (404/405) ·
`fail_schema` (SCHEMA_VALIDATION_FAILED/CSV/malformed) · `fail_io` ([Errno …]) ·
`fail_phantom` (phantom_captured_no_parquet…) · `fail_legacy_migration` (LegacyBlankErrorReasonError/THIRDKEY_DRIFT/bare_name_migrated) ·
`fail_other` (catch-all — never silently drop).

## 6. What shipped (2026-05-27)

Backend (deployment-api `e6b8a9a`, `261bd1e`):
- `reason_taxonomy.py` — `classify_reason` + vectorised `rollup_reasons_frame` (37 unit cases).
- Drilldown response now carries `reason_summary` (categorised counts for the filtered slice —
  authoritative, counts bundled-data_type rows the tree omits) + per-leaf `reason_category`.
- Grid `_counts` → full 4-state + NULL `capture_status` → captured (fixes the ~57k-row undercount).

UI (deployment-ui `89692e7`):
- `reasonCategory.ts` — frontend SSOT (labels/tone/group/hint) mirroring the backend closed set.
- `redesignData.AgData.primaryMeta` carries turbo per-venue completion (days with data / remaining,
  missing-dates list, missing data_types, venue start).
- **Stacked** visual shows per-venue `X/Y dates · N missing` + missing data_types.
- **Drawer venue view**: Completion block (progress %, days with data / remaining, the actual
  missing-date list +N more, missing-data_type chips) + **WHY panel** (instant coarse 3-state bar
  from turbo cell, then categorised reason bars from the drilldown). Verified live: DeFi/ARBITRUM
  Apr = 60 `fail_not_found`; CeFi/KRAKEN-SPOT = "360 captured · 465 failed" all `fail_legacy_migration`
  (i.e. NOT real failures — the operator-insight the old UI hid).
- **Columns Download fixed**: was permanently disabled (required data_type+instrument_type which are
  blank/never-pinned for many shards incl. all instruments-service shards = venue+date only). Now
  needs only venue+date; unpinned axes sent as "". Endpoint streams CSV for present parquets and
  returns honest 502 path-drift / 404 never-attempted for phantom/missing — which now reads as the
  phantom/missing surfacing rather than a dead button.
- Fixed a spurious "unavailable" in the WHY + "By data type" panels (unstable whole-`ds` useEffect
  dep self-aborting the fetch with no abort guard). Send lowercase `asset_group` (canonical + single
  index cache key).

### Known cost / follow-ups (NOT this pass)
- First drilldown per bucket per process is a cold ~9s read of the raw index (172MB / up to 2.6M
  rows); subsequent calls are cached (~0.15s). The coarse-immediate WHY bar masks the cold wait.
  Proper fix = cache/pre-resolve the index read — deferred backend work.
- Bundled-data_type drilldown-tree gap (§4b) — reason_summary covers it; tree fix deferred.

### Columns small-axis prefill (`1b4cf47`)
The Columns layout showed empty `data_type` / `instrument_type` for MTDS/MDPS. Root cause: the
Batch-1 re-architecture made the overview turbo-based + lazy `/grid` (heatmap/matrix only), so
Columns read the AG-level `ag.data_types` map — which turbo leaves **empty for MTDS/MDPS** (it puts
data_types per-venue). `/grid` DOES compute `axis_values`, but `loadAgGrid` never merges it and
Columns never triggers the grid → dead path. Fix: `axisValuesOf` now unions the small axes across
`ag.venues` (`expected_data_types` + `data_types` + `honest_data_types` keys → data_type;
`instrument_types` keys → instrument_type). Cheap (turbo already fetched, no index read); heavy axes
(`instrument_id`, `date`) stay lazy/backend-resolved. This is also the **correct** source: `/grid`
reads the shared `market-data-tick` bucket and would leak MTDS raw data_types into the MDPS view.

### MDPS (market-data-processing-service) expectation
MDPS shares the `market-data-tick-*` buckets with MTDS (distinguished by processed `data_type`s).
Until the raw backfill completes, MDPS processed data_types are largely absent → they surface as
`empty_*` / `pending` (honest) or `attempted_failed` rather than `captured`. The redesign shows this
honestly (low completion + empty/pending reasons), so "MDPS looks empty" is expected + explained,
not a UI bug. No separate MDPS code path — same components.
