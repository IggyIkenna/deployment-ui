## What this tab is

Every asset-group's data pipeline ends in **one consolidated index** — `_index/availability_index.parquet` — that a Cloud Run **manifest consolidator** rebuilds each cycle by merging the per-VM shard files written across the fleet.

This tab is the **data-correctness lens** over the ~25 consolidators: _did each one's last run actually produce its data?_ The **Deployments** tab is the companion **liveness lens**: _did the job fire, on time?_ Same jobs, two questions.

Cards are grouped into the pipeline stages — **instruments → market data → features → ml → strategy → execution** — in that fixed order (gas-fees rolls into market data; all feature types share one **Features** group). Within each group, **worst-first** floats anything broken to the top.

## Reading a card

One card = one consolidator. The top row is five numbers:

- **rows** — absolute rows in the consolidated index (its parquet `num_rows`): how many availability records it holds right now.
- **size** — the index file's size on disk. A very large index is what makes the recovery-merge run out of memory and fall behind — the usual cause of `stale output`.
- **fed by** — fan-in width: how many per-VM shard files currently feed this index (roughly, active writer VMs). `0` means nothing is writing / it's fully consolidated.
- **index age** — time since the index was last written, against its staleness budget, shown `age / budget`. It ticks live and turns **amber, then red · over** once it's older than budget. The budget is **cadence-matched per consolidator** (from the catalog): live market-data ticks get **2m** (they run every minute), everything else gets **24h** (daily-ish batch / feature / instrument jobs) — so a slow-cadence job is judged against its own schedule, not a uniform 2m.
- **backlog** — `pending / total`: shards written since the last merge (**pending**) out of all shards present (**total**). `pending > 0` means data is on disk but not yet folded into the index. When there's a backlog, a second line shows **oldest** — the age of the oldest un-absorbed shard, i.e. how long the merge has been behind. It turns **red** once that wait exceeds the budget (the merge has been stuck that long).

The **job** and **bkt** lines at the bottom name the Cloud Run job (the key the Deployments tab links on) and the GCS bucket. Both truncate — hover to see the full value.

## The chart

The chart is this session's **backlog over time** (pending shards at each poll):

- **rising** = falling behind — shards are arriving faster than they merge.
- **dropping** = a merge landed — shards were absorbed.
- the **Y-axis** shows the real scale, so a 0–8 backlog and a 0–100 backlog don't look identical.

A healthy consolidator sawtooths (accumulate, merge, repeat); a stuck one climbs and stays high.

## Verdict badge (top-right)

- **produced** — index fresh and caught up; the last run wrote its data, no backlog waiting.
- **producing** — index fresh and actively absorbing a live backlog (the healthy sawtooth).
- **stale output** — index older than its budget while shards wait: the consolidator is behind or down, so its output is stale.
- **fired · empty** — the job's latest Cloud Run execution **succeeded** (exit 0) recently, yet the index is still stale: it **ran green but wrote nothing**. This is the silent failure the liveness lens shows as "succeeded" — the exact gap this data-correctness tab exists to catch.
- **empty** — no index and no shards: a genuinely empty bucket, not an outage.
- **unknown** — the index couldn't be read (a transient error), not necessarily unhealthy.
