# Shard-Axis Reference (for the Data Status page redesign)

> **Why this file exists.** The Data Status page renders data coverage broken down by "shard"
> axes. The authoritative definition of those axes lives in a **different repo**
> (`unified-api-contracts`, served by `deployment-api`), which the design agent cannot see.
> This file is a self-contained snapshot of that definition so the redesign can be done from
> inside `deployment-ui` alone. **Authoritative source:**
> `unified-api-contracts/unified_api_contracts/registry/data_status_axis_matrix.py`.
> Machine-readable copy alongside this doc: [`shard-axis-matrix.json`](./shard-axis-matrix.json)
> (this is the exact shape the UI fetches from `GET /api/config/shard-axis-matrix`).

---

## 1. What a "shard" is

A **shard** is the smallest independently-written/failable unit of data. The pipeline writes one
parquet (and one manifest row) per shard per **day**. The Data Status page shows, for each
`(service, asset_group)`, whether each shard is `captured`, `empty_confirmed`, `attempted_failed`,
or missing — across a date range.

A shard is identified by a tuple of **axis values**. Example: an MTDS CeFi shard is
`(venue, data_type, instrument_type, instrument_id)` + day, e.g.
`binance / trades / perpetual / BTCUSDT @ 2026-05-20`.

**Day is implicit on every shard** — it is never listed as an axis.

## 2. The four axis kinds (this is what drives the UI)

For every `(service, asset_group)` pair there are four axis lists. Each plays a different UI role:

| Axis kind            | UI role                                                                                                                       | Notes                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **`primary_axis`**   | The **main dimension** of the cell grid (the columns/rows you scan first). Exactly one.                                       | e.g. `venue` for pricing services, `data_type` for sports, `strategy_id` for strategy. |
| **`shard_axes`**     | The tuple that **defines the shard atom** (manifest row key).                                                                 | The "real" granularity. Drives the drilldown depth.                                    |
| **`display_axes`**   | Columns useful only for **filter/group in the UI** — NOT part of the shard key.                                               | No manifest-row inflation.                                                             |
| **`breakdown_axes`** | What the **"Breakdowns" accordion** renders as secondary selectors. Derived = `(shard ∪ display) − primary`, order preserved. | This is the list the UI actually loops over for secondary dropdowns.                   |

So in the UI:

- **`primary_axis`** = the headline grid dimension.
- **`breakdown_axes`** = the secondary breakdown dropdowns / accordion under it.
- **`shard_axes`** = how deep the drilldown goes (drill from primary → … → shard atom → day).

**Drilldown order** matches the operator's natural navigation:

- **CeFi / TradFi:** `venue → data_type → instrument_type → instrument_id → day`
- **DeFi:** `venue → chain → data_type → instrument_id → day`
- **Sports:** `data_type → league_id → day`
- **Prediction:** `venue → canonical_question_group → data_type → day`

## 3. Coverage matrix — which services × asset_groups exist

8 services × 6 asset_groups (not every cell exists — blank = service doesn't cover that group).
Asset_group keys are lowercase: `cefi`, `defi`, `tradfi`, `sports`, `prediction`, `shared`
(`shared` = cross-asset, e.g. ML services).

| Service                                 | cefi | defi | tradfi | sports | prediction | shared |
| --------------------------------------- | :--: | :--: | :----: | :----: | :--------: | :----: |
| `instruments-service`                   |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   —    |
| `market-tick-data-service` (MTDS)       |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   —    |
| `market-data-processing-service` (MDPS) |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   —    |
| `features-service`                      |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   ✓    |
| `ml-training-service`                   |  —   |  —   |   —    |   —    |     —      |   ✓    |
| `ml-inference-service`                  |  —   |  —   |   —    |   —    |     —      |   ✓    |
| `strategy-service`                      |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   —    |
| `execution-service`                     |  ✓   |  ✓   |   ✓    |   ✓    |     ✓      |   —    |

## 4. Full axis matrix (the authoritative shard granularity)

`P` = primary axis (bold). Shard axes listed in drilldown order. Breakdown = what the accordion shows.

### Pricing pipeline — `instruments-service`

| asset_group | shard_axes (= granularity)        | primary       | breakdown_axes (UI accordion)       |
| ----------- | --------------------------------- | ------------- | ----------------------------------- |
| cefi        | `venue`                           | **venue**     | instrument_type, data_type          |
| tradfi      | `venue`                           | **venue**     | instrument_type, data_type          |
| defi        | `venue, chain`                    | **venue**     | chain, instrument_type, data_type   |
| sports      | `data_type, league_id`            | **data_type** | league_id, source                   |
| prediction  | `venue, canonical_question_group` | **venue**     | canonical_question_group, data_type |

### Market data — `market-tick-data-service` (MTDS) and `market-data-processing-service` (MDPS) — identical axes

| asset_group | shard_axes (= granularity)                         | primary       | breakdown_axes (UI accordion)                    |
| ----------- | -------------------------------------------------- | ------------- | ------------------------------------------------ |
| cefi        | `venue, data_type, instrument_type, instrument_id` | **venue**     | data_type, instrument_type, instrument_id        |
| tradfi      | `venue, data_type, instrument_type, instrument_id` | **venue**     | data_type, instrument_type, instrument_id        |
| defi        | `venue, chain, data_type, instrument_id`           | **venue**     | chain, data_type, instrument_id, instrument_type |
| sports      | `data_type, league_id`                             | **data_type** | league_id, source, fixture_id                    |
| prediction  | `venue, canonical_question_group, data_type`       | **venue**     | canonical_question_group, data_type              |

> MTDS CeFi/TradFi is the **deepest** shard granularity in the system (per-instrument; ~35 GB+ per
> venue per day). This is the page's worst-case for number of cells — design for thousands of shards.

### Features — `features-service`

| asset_group | shard_axes (= granularity)                                  | primary           | breakdown_axes (UI accordion)                                   |
| ----------- | ----------------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| cefi        | `venue, feature_group, timeframe, instrument_id`            | **venue**         | feature_group, timeframe, instrument_id, instrument_type        |
| tradfi      | `venue, feature_group, timeframe, instrument_id`            | **venue**         | feature_group, timeframe, instrument_id, instrument_type        |
| defi        | `venue, chain, feature_group, timeframe, instrument_id`     | **venue**         | chain, feature_group, timeframe, instrument_id, instrument_type |
| sports      | `feature_group, league_id`                                  | **feature_group** | league_id, source, data_type                                    |
| prediction  | `venue, canonical_question_group, feature_group, timeframe` | **venue**         | canonical_question_group, feature_group, timeframe              |
| shared      | `feature_group, timeframe`                                  | **feature_group** | timeframe                                                       |

### ML — experiment-keyed (cross-asset → `shared`)

| service                | shard_axes (= granularity)              | primary          | breakdown_axes (UI accordion)                   |
| ---------------------- | --------------------------------------- | ---------------- | ----------------------------------------------- |
| `ml-training-service`  | `model_family, training_period, job_id` | **model_family** | training_period, job_id, client_id, asset_group |
| `ml-inference-service` | `model_family, job_id`                  | **model_family** | job_id, client_id, asset_group                  |

### Strategy / Execution — experiment-keyed, per asset_group (all 5 groups share the same shape)

| service                                                  | shard_axes (= granularity)              | primary              | breakdown_axes (UI accordion)         |
| -------------------------------------------------------- | --------------------------------------- | -------------------- | ------------------------------------- |
| `strategy-service` (cefi/defi/tradfi/sports/prediction)  | `strategy_id, job_id`                   | **strategy_id**      | job_id, archetype, client_id          |
| `execution-service` (cefi/defi/tradfi/sports/prediction) | `strategy_id, instruction_type, job_id` | **instruction_type** | strategy_id, job_id, venue, client_id |

## 5. Axis value cheat-sheet (illustrative — for realistic mock data)

> ⚠️ The **axes** above are authoritative. The **values** below are illustrative examples so mock
> data looks realistic — they are NOT exhaustive enums. Use them for cardinality/shape only.

| Axis                           | Example values                                                                     | Rough cardinality      |
| ------------------------------ | ---------------------------------------------------------------------------------- | ---------------------- |
| `venue` (cefi)                 | binance, bybit, okx, deribit, hyperliquid, aster, kraken, coinbase                 | ~8                     |
| `venue` (defi DEX)             | uniswap_v3, curve, balancer, sushiswap, pancakeswap, phoenix, orca, raydium, drift | ~9                     |
| `venue` (prediction)           | polymarket, kalshi                                                                 | ~2                     |
| `chain` (defi)                 | ethereum, arbitrum, base, polygon, optimism, solana, bsc                           | ~7                     |
| `data_type` (cefi)             | trades, quotes, funding_rate, open_interest, liquidations, klines, mark_price      | ~7                     |
| `data_type` (defi)             | swaps, pool_state, lending_rates, lst_apr                                          | ~4                     |
| `data_type` (sports)           | fixtures, odds, results, lineups                                                   | ~4                     |
| `instrument_type` (cefi)       | spot, perpetual, future, option                                                    | ~4                     |
| `instrument_type` (defi)       | pool, lending, lst                                                                 | ~3                     |
| `instrument_id`                | BTCUSDT, ETHUSDT, SOLUSDT, … (per-symbol)                                          | **hundreds–thousands** |
| `feature_group`                | delta_one, volatility, onchain, calendar, microstructure                           | ~5                     |
| `timeframe`                    | 1m, 5m, 15m, 1h, 4h, 1d                                                            | ~6                     |
| `league_id` (sports)           | e.g. EPL, NBA, NFL, MLB, …                                                         | tens                   |
| `model_family`                 | xgboost, lstm, transformer, …                                                      | a few                  |
| `instruction_type` (execution) | sim/algo type, e.g. twap, vwap, passive, aggressive                                | a few                  |
| `strategy_id` / `job_id`       | UUIDs                                                                              | many                   |
| `archetype`                    | carry_staked_basis, arbitrage_price_dispersion                                     | ~2 (MVP)               |
| `client_id`                    | client identifiers                                                                 | a few                  |
| `canonical_question_group`     | prediction-market question groupings                                               | tens                   |

## 6. Don't confuse this with date granularity

There is a **separate, unrelated** `date_granularity` (`daily` / `weekly` / `monthly` / `none`)
used for backfill/deployment runs. That is about how a run is chunked in time — **not** the shard
axes above. `ml-training-service` uses `none`. The shard-axis matrix is about the
non-time partitioning of data.

## 7. How the UI consumes this (live wiring, for reference)

- Fetch: `src/api/client.ts` → `getShardAxisMatrix(service)` → `GET /config/shard-axis-matrix?service=…`
- Backend returns `{ shard_axes, display_axes, primary_axis, breakdown_axes }` keyed by `(service, asset_group)`.
- `src/components/DataStatusTab.tsx` stores it in `shardAxisMatrix` state and reads
  `shardAxisMatrix.breakdown_axes[service][assetGroup]` to render the per-asset-group breakdown accordions.
- The JSON in [`shard-axis-matrix.json`](./shard-axis-matrix.json) here uses `"service|asset_group"`
  string keys (flattened from the backend's tuple keys) so it's easy to drop into a mock.
