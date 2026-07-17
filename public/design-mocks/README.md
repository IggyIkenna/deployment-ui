# Design mocks — temporary

Static, standalone HTML design mocks. **Not part of the app** — no build wiring, no nav link, no API calls. Open the
file directly, or with the dev server running browse to `/design-mocks/<file>.html`.

## artifact-pipeline.html

Design mock for the proposed **/ops/artifacts** page — the deployment estate's final stage end-to-end (build → artifact
→ deploy lineage across GCP + AWS). Five views: what's running (with drift flags), deploy timeline, pipeline, artifacts,
health.

Every row is **real data probed live on 2026-07-17** (build IDs, SHAs, digests, tags, bucket counts, Cloud Run
revisions). Where the pipeline genuinely can't answer a question, the cell says _unknown_ rather than guessing.

**Plan / SSOT:** `unified-trading-pm/plans/active/artifact_pipeline_observability_2026_07_17.md`

**Delete-when:** the real `/ops/artifacts` page ships — then remove this whole folder.
