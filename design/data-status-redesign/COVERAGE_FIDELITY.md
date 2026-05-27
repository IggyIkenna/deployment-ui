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

### `schema_version` — NO version drift at the index level

`market-data-tick-{defi,cefi}` and `instruments-store-cefi` indexes are **100% `'8'`**. The
"version drift" the operator worried about does **not** appear in the consolidated availability
index — every row is v8. (Drift, if any, would be in the *raw data parquet* footers in the old
vs PRD buckets, not the manifest. See §3.)

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

## 5. Reason taxonomy (closed set the UI binds)

`captured` · `empty_calendar` (EXPECTED_HOLIDAY/WEEKEND/PAUSED/SEASON/…) ·
`empty_coverage` (EXPECTED_PRE_GENESIS_CHAIN/PRE_VENUE_LAUNCH/PRE_SOURCE/NOT_LISTED/DELISTED/PAST_SOURCE/…) ·
`empty_source_zero` (SOURCE_RETURNED_ZERO/EXPECTED_UPSTREAM_EMPTY) · `empty_unclassified` ·
`fail_rate_limited` (HTTP_429) · `fail_auth` (HTTP_401/403, VENUE_FETCH_FAILED, UNCLASSIFIED_VENUE_ERROR, OAuth/api-key) ·
`fail_network` (timeout/disconnect/ConnectionPool/payload-not-completed) · `fail_not_found` (404/405) ·
`fail_schema` (SCHEMA_VALIDATION_FAILED/CSV/malformed) · `fail_io` ([Errno …]) ·
`fail_phantom` (phantom_captured_no_parquet…) · `fail_legacy_migration` (LegacyBlankErrorReasonError/THIRDKEY_DRIFT/bare_name_migrated) ·
`fail_other` (catch-all — never silently drop).
