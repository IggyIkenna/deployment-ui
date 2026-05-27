/**
 * Frontend mirror of the backend reason taxonomy
 * (`deployment_api/services/reason_taxonomy.py::ReasonCategory`).
 *
 * The drilldown endpoint returns `reason_summary` (category → count) and a
 * per-leaf `reason_category`. This module gives each category a label, a tone
 * (which status color it renders as) and a group (so the WHY panel can stack
 * "honest empty" vs "real failures" vs "phantom" separately). Keep in sync with
 * the Python closed set — both cite COVERAGE_FIDELITY.md §5.
 */

export type ReasonCategoryId =
  | "captured"
  | "empty_calendar"
  | "empty_coverage"
  | "empty_source_zero"
  | "empty_unclassified"
  | "fail_rate_limited"
  | "fail_auth"
  | "fail_network"
  | "fail_not_found"
  | "fail_schema"
  | "fail_io"
  | "fail_phantom"
  | "fail_legacy_migration"
  | "fail_other"
  | "pending";

/** Which broad bucket a category belongs to — drives the stacked WHY panel. */
export type ReasonGroup = "captured" | "empty" | "failed" | "phantom" | "pending";

export interface ReasonMeta {
  id: ReasonCategoryId;
  label: string;
  /** Short chip label (drilldown leaf badge). */
  short: string;
  group: ReasonGroup;
  /** CSS `data-status` token the swatch borrows its color from. */
  tone: "captured" | "empty" | "failed" | "partial" | "missing";
  /** One-line operator hint — what it means + what to do. */
  hint: string;
}

export const REASON_META: Record<ReasonCategoryId, ReasonMeta> = {
  captured: {
    id: "captured",
    label: "Captured",
    short: "OK",
    group: "captured",
    tone: "captured",
    hint: "Manifest + parquet both present.",
  },
  empty_calendar: {
    id: "empty_calendar",
    label: "Empty — calendar / season",
    short: "Calendar",
    group: "empty",
    tone: "empty",
    hint: "Honestly empty: holiday / weekend / paused league / off-season. Expected, no action.",
  },
  empty_coverage: {
    id: "empty_coverage",
    label: "Empty — outside source coverage",
    short: "Pre-coverage",
    group: "empty",
    tone: "empty",
    hint: "Before venue launch / chain genesis / listing, or after delisting. Expected, no action.",
  },
  empty_source_zero: {
    id: "empty_source_zero",
    label: "Empty — source returned zero",
    short: "Zero",
    group: "empty",
    tone: "empty",
    hint: "Source was queried and returned no rows for the day. Usually expected.",
  },
  empty_unclassified: {
    id: "empty_unclassified",
    label: "Empty — unclassified (legacy)",
    short: "Empty?",
    group: "empty",
    tone: "partial",
    hint: "Empty row with no typed reason yet — Tier-3D reconciler hasn't stamped it. Back-fill progress indicator.",
  },
  fail_rate_limited: {
    id: "fail_rate_limited",
    label: "Failed — rate limited (HTTP 429)",
    short: "429",
    group: "failed",
    tone: "failed",
    hint: "Venue throttled us. Back off / raise the tier / spread requests.",
  },
  fail_auth: {
    id: "fail_auth",
    label: "Failed — auth / API key / OAuth",
    short: "Auth",
    group: "failed",
    tone: "failed",
    hint: "Credential rejected or missing (401/403, VENUE_FETCH_FAILED). Rotate / provision the key.",
  },
  fail_network: {
    id: "fail_network",
    label: "Failed — network / timeout",
    short: "Network",
    group: "failed",
    tone: "failed",
    hint: "Connection timeout / disconnect / SSL. Often transient — retry; investigate if persistent.",
  },
  fail_not_found: {
    id: "fail_not_found",
    label: "Failed — not found (HTTP 404/405)",
    short: "404",
    group: "failed",
    tone: "failed",
    hint: "Endpoint / resource not found. URL or symbol mapping likely wrong.",
  },
  fail_schema: {
    id: "fail_schema",
    label: "Failed — schema / parse",
    short: "Schema",
    group: "failed",
    tone: "failed",
    hint: "Response failed validation / CSV parse. Adapter schema may have drifted from the venue.",
  },
  fail_io: {
    id: "fail_io",
    label: "Failed — disk / I/O",
    short: "I/O",
    group: "failed",
    tone: "failed",
    hint: "Write failed (e.g. no space). Infra issue, not data.",
  },
  fail_phantom: {
    id: "fail_phantom",
    label: "Phantom — manifest says captured, no parquet",
    short: "Phantom",
    group: "phantom",
    tone: "missing",
    hint: "Manifest claims captured but the parquet is missing (often still in the old bucket mid-migration). Reconciler fixes post-migration.",
  },
  fail_legacy_migration: {
    id: "fail_legacy_migration",
    label: "Legacy migration marker (not a live failure)",
    short: "Legacy",
    group: "failed",
    tone: "partial",
    hint: "A migration/recon marker, NOT a real adapter failure. Ignore for live-health; clears post-backfill.",
  },
  fail_other: {
    id: "fail_other",
    label: "Failed — other / unclassified",
    short: "Other",
    group: "failed",
    tone: "failed",
    hint: "Failure we haven't categorised yet. Inspect the raw error_reason.",
  },
  pending: {
    id: "pending",
    label: "Pending fetch (not yet attempted)",
    short: "Pending",
    group: "pending",
    tone: "missing",
    hint: "Declared expected but not yet attempted. Backfill will pick it up.",
  },
};

/** Ordered category list for rendering the WHY panel (captured → empty → failed → phantom → pending). */
export const REASON_ORDER: ReasonCategoryId[] = [
  "captured",
  "empty_calendar",
  "empty_coverage",
  "empty_source_zero",
  "empty_unclassified",
  "fail_rate_limited",
  "fail_auth",
  "fail_network",
  "fail_not_found",
  "fail_schema",
  "fail_io",
  "fail_legacy_migration",
  "fail_other",
  "fail_phantom",
  "pending",
];

export function reasonMeta(id: string): ReasonMeta {
  return REASON_META[id as ReasonCategoryId] ?? REASON_META.fail_other;
}

/** Sum a reason_summary into the 5 broad groups (for headline counts). */
export function groupReasonSummary(
  summary: Record<string, number> | undefined,
): Record<ReasonGroup, number> {
  const out: Record<ReasonGroup, number> = {
    captured: 0,
    empty: 0,
    failed: 0,
    phantom: 0,
    pending: 0,
  };
  if (!summary) return out;
  for (const [id, n] of Object.entries(summary)) {
    if (!n) continue;
    const group = (REASON_META[id as ReasonCategoryId] ?? REASON_META.fail_other).group;
    out[group] += n;
  }
  return out;
}

/** True when a reason_summary has at least one real (non-legacy) failure. */
export function hasRealFailures(summary: Record<string, number> | undefined): boolean {
  if (!summary) return false;
  return REASON_ORDER.some(
    (id) =>
      REASON_META[id].group === "failed" && id !== "fail_legacy_migration" && (summary[id] ?? 0) > 0,
  );
}
