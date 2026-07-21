# Design mocks — temporary

Static, standalone HTML design mocks. **Not part of the app** — no build wiring, no nav link, no API calls. Open the
file directly, or with the dev server running browse to `/design-mocks/<file>.html`.

## artifact-pipeline.html

Design mock for the proposed **/ops/artifacts** page — the deployment estate's final stage end-to-end (build → artifact
→ deploy lineage across GCP + AWS). Five views: what's running (with drift flags), deploy timeline, pipeline, artifacts,
health.

Every row is **real data** — GCP (build IDs, SHAs, digests, tags, bucket counts, Cloud Run revisions) probed live
**2026-07-17**; AWS (App Runner operation history, ECR per-repo inventory, ECS service state) probed live **2026-07-21**.
Where the pipeline genuinely can't answer a question, the cell says _unknown_ / _resolve ↗_ rather than guessing.

All five views carry filter chips (e.g. deploy timeline: new-code-only / live-now / failed; artifacts: orphaned-GC /
empty; health: by severity). Health rows cross-link to the view that proves them. The deploy timeline is estate-wide (a
GCE VM launch is treated as the tarball-lane deploy event), and marks what is live right now vs. historical revisions.

**Plan / SSOT:** `unified-trading-pm/plans/active/artifact_pipeline_observability_2026_07_17.md`

**Delete-when:** the real `/ops/artifacts` page ships — then remove this whole folder.
