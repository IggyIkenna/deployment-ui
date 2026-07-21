/**
 * Deployments — the /repos-grade observability surface for every LIVE / BATCH / PAPER
 * deployment, MERGED into ONE flat all-modes table (operator 2026-07-08 — was three
 * separate mode presets; consolidated into a single table with a Mode column so every
 * VM + Cloud Run job reads on one grid). One inventory source, one column shape:
 *
 *   Mode · Target · Cloud · Service · Asset group · Status · Last run · Progress ·
 *   Exit · Feed health · Controls
 *
 * A cell is "—" where a mode doesn't populate that field (batch has no feed-health,
 * live/paper have no captured-progress count). Mode is a FILTER (All / Live / Batch / Paper), not a
 * tab. Retired columns: the phantom "Uptime" (was last-run mislabelled), the duplicate
 * Heartbeat column (heartbeat now rides the Status chip), the Progress/Coverage dupe
 * (one number), and paper's never-wired Recon-drift / Determinism-ε placeholders.
 *
 * Per-target drill-down (event timeline + live log tail) lives in DeploymentDetail.tsx.
 *
 * Plan: deployment_observability_parity_live_batch_paper_2026_06_22.md Phase 2 → merge.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { DeploymentDetail } from "./DeploymentDetail";
import { LiveDeploymentsContent } from "./LiveDeployments";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Cloud,
  Container,
  FunctionSquare,
  Globe,
  HardDrive,
  Network,
  RefreshCw,
  Server,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import {
  getDeploymentInventory,
  getDeploymentRegions,
  getUmbrellaSummary,
  reconcileVmDeployments,
  type DeploymentCloud,
  type DeploymentItem,
  type DeploymentStatus,
  type DeploymentUmbrella,
  type UmbrellaLastFailure,
  type UmbrellaSummaryResponse,
  type ServiceHealth,
  type VmHealth,
  type VmReconcileResult,
} from "../api/deploymentApi";
import { getDeploymentFreshness, type DeploymentFreshnessResponse } from "../api/health";
import {
  deleteInstance,
  getOrphans,
  reapOrphans,
  type OrphanInventoryResponse,
  type OrphanVerdict,
  type ReapResponse,
} from "../api/client";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { DeploymentsHelpButton } from "../components/DeploymentsHelp";
import { VmControls } from "../components/VmControls";
import { useVisibilityPausedInterval } from "../hooks/useVisibilityPausedInterval";
import { useDebounce } from "../hooks/useDebounce";
import { useColumnSort } from "../hooks/useColumnSort";
import { compareByColumn } from "../lib/columnSort";
import { FilterSelect } from "../components/filters/FilterSelect";
import { StatusFilterChips, type StatusChip } from "../components/filters/StatusFilterChips";
import { TONE_CLASSES, type ChipTone } from "../components/filters/chipTone";

// The mode a row belongs to (EXPERIMENT folds under BATCH — a target classified
// EXPERIMENT shows a BATCH mode badge so the surface stays a 3-mode Live/Batch/Paper view).
type ModeFilter = "" | "LIVE" | "BATCH" | "PAPER" | "EXPERIMENT" | "NONE";
const MODE_OPTIONS: { value: ModeFilter; label: string }[] = [
  { value: "", label: "all" },
  { value: "LIVE", label: "Live" },
  { value: "BATCH", label: "Batch" },
  { value: "PAPER", label: "Paper" },
  { value: "EXPERIMENT", label: "Experiment" },
  // NONE = infra with no trading umbrella (Cloud Run services, functions, schedulers, orphaned
  // disks/IPs) — 187 rows incl. every scheduler. Without this option they're unreachable by Mode.
  { value: "NONE", label: "Infra (none)" },
];

function Chip({ tone, children, testId }: { tone: ChipTone; children: React.ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Mode badge — LIVE (green) / BATCH (blue) / PAPER (amber). EXPERIMENT rides the BATCH badge.
 *  NONE = an always-on service (no trading phase, Open-Q1) → a muted "—", not a badge. */
const MODE_TONE: Record<string, ChipTone> = { LIVE: "green", BATCH: "blue", PAPER: "yellow", EXPERIMENT: "blue" };
function ModeBadge({ umbrella }: { umbrella: DeploymentUmbrella }) {
  if (umbrella === "NONE")
    return (
      <span className="text-[var(--color-text-muted)]" data-testid="mode-badge-NONE">
        —
      </span>
    );
  const label = umbrella === "EXPERIMENT" ? "batch·exp" : umbrella.toLowerCase();
  return (
    <Chip tone={MODE_TONE[umbrella] ?? "gray"} testId={`mode-badge-${umbrella}`}>
      {label}
    </Chip>
  );
}

/** Status badge tone — color-coded like RepoCi's CI status. */
function statusTone(status: DeploymentStatus): ChipTone {
  switch (status) {
    case "succeeded":
      return "green";
    case "running":
      return "blue";
    case "failed":
      return "red";
    case "stale":
      return "yellow";
    default:
      return "gray";
  }
}

/** Cloud badge — GCP (cyan) vs AWS (amber), matching the header cloud-toggle palette. */
function CloudBadge({ cloud }: { cloud: DeploymentCloud }) {
  return (
    <span
      data-testid={`cloud-badge-${cloud}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
        cloud === "GCP" ? TONE_CLASSES.blue : TONE_CLASSES.yellow
      }`}
    >
      <Cloud className="h-3 w-3" aria-hidden="true" />
      {cloud}
    </span>
  );
}

// Per-kind icon + short label + tone. VM/CLOUD_RUN_JOB are backend-live; the
// service/function kinds are the estate the inventory doesn't yet census (mocked).
const KIND_META: Record<
  DeploymentItem["kind"],
  { label: string; tone: ChipTone; Icon: React.ComponentType<{ className?: string }> }
> = {
  VM: { label: "vm", tone: "gray", Icon: Server },
  CLOUD_RUN_JOB: { label: "run-job", tone: "blue", Icon: Workflow },
  CLOUD_RUN_SERVICE: { label: "run-svc", tone: "green", Icon: Globe },
  ECS_SERVICE: { label: "ecs-svc", tone: "green", Icon: Container },
  LAMBDA: { label: "lambda", tone: "yellow", Icon: Zap },
  CLOUD_FUNCTION: { label: "fn", tone: "yellow", Icon: FunctionSquare },
  // WS-D full-estate kinds: orphaned resources (leaked cost) + scheduled-job liveness.
  DISK: { label: "disk", tone: "red", Icon: HardDrive },
  STATIC_IP: { label: "static-ip", tone: "red", Icon: Network },
  SCHEDULER: { label: "scheduler", tone: "blue", Icon: Clock },
};

function kindMeta(kind: string) {
  return (
    KIND_META[kind as DeploymentItem["kind"]] ?? { label: kind.toLowerCase(), tone: "gray" as ChipTone, Icon: Server }
  );
}

const SERVICE_KINDS = new Set(["CLOUD_RUN_SERVICE", "ECS_SERVICE"]);
const FUNCTION_KINDS = new Set(["LAMBDA", "CLOUD_FUNCTION"]);

// Always-on / no-interval kinds (WS-2 decision 2) — the exact complement of the backend's
// `_SINGLE_TIMESTAMP_KINDS ∪ {VM}` in `_apply_date_range` (deployments_inventory.py): every kind
// that carries NO timestamp signal a date-range query could scope on, so the backend passes them
// through unfiltered regardless of range. Services + functions + orphaned disk/IP rows.
const ALWAYS_ON_KINDS = new Set([...SERVICE_KINDS, ...FUNCTION_KINDS, "DISK", "STATIC_IP"]);
const isAlwaysOnKind = (kind: string): boolean => ALWAYS_ON_KINDS.has(kind);

// Provenance chip (WS-D #14) — who launched this compute unit. `adhoc` = a stranded / ad-hoc launch
// (amber — the findable ones an operator should pull into the stack or kill); `deployment-api` =
// managed via the registry; `control-plane` = managed infra with no registry entry; `unknown` = no
// provenance signal yet (the AWS estate until the managed-by tag lands).
const LAUNCHED_BY_META: Record<string, { label: string; tone: ChipTone }> = {
  "deployment-api": { label: "deployment-api", tone: "green" },
  "control-plane": { label: "control-plane", tone: "blue" },
  adhoc: { label: "adhoc", tone: "yellow" },
  unknown: { label: "unknown", tone: "gray" },
};

/** Provenance cell — the launched-by chip; "—" when the census hasn't populated it (legacy row). */
function LaunchedByBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-[var(--color-text-muted)]">—</span>;
  const meta = LAUNCHED_BY_META[value] ?? { label: value, tone: "gray" as ChipTone };
  return <Chip tone={meta.tone}>{meta.label}</Chip>;
}

/** Total inferred $/month a row's unreleased resources are still billing (0 when none / unknown). */
function leakedMonthlyUsd(item: DeploymentItem): number {
  return (item.unreleased_resources ?? []).reduce((sum, r) => sum + (r.est_monthly_usd ?? 0), 0);
}

/** Red "unreleased resources" badge (WS-D #5) — a non-running VM (or an orphaned DISK/STATIC_IP row)
 *  still holding billable resources, with its INFERRED est. monthly cost (principle 8 — labelled
 *  "est" + a "refresh periodically" tooltip, never presented as exact). null when nothing leaked. */
function LeakedBadge({ item }: { item: DeploymentItem }) {
  if (!item.has_unreleased_resources || !item.unreleased_resources?.length) return null;
  const total = leakedMonthlyUsd(item);
  const detail = item.unreleased_resources
    .map((r) => `${r.type} ${r.name}${r.size_gb ? ` ${r.size_gb}GB` : ""} ~$${(r.est_monthly_usd ?? 0).toFixed(0)}/mo`)
    .join(", ");
  return (
    <span
      data-testid={`leaked-${item.name}`}
      title={`Unreleased (est. / refresh periodically): ${detail}`}
      className="inline-flex w-fit items-center gap-1 rounded bg-[var(--color-danger)] px-1 text-[10px] font-medium text-white"
    >
      <AlertTriangle className="h-3 w-3" />
      {item.unreleased_resources.length} leaked · ~${total.toFixed(0)}/mo est
    </span>
  );
}

// Reap-verdict badge (Fleet-tab consolidation) — same label/variant mapping as FleetOrphans'
// VerdictBadge, so the classification reads identically on both surfaces.
const ORPHAN_VERDICT_LABEL: Record<OrphanVerdict, string> = {
  reap: "Reapable",
  keep_within_grace: "Within grace",
  keep_not_ephemeral: "Live/recurring",
  keep_retained: "Retained (keep)",
  keep_no_timestamp: "No stop time",
};

function fmtStoppedAge(hours: number | null | undefined): string | null {
  if (hours == null) return null;
  return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
}

/** Reap-verdict + stopped-age for a currently-stopped VM row — null (renders nothing) when the row
 *  isn't in the orphan candidate set (a running VM, or any non-VM kind). */
function OrphanVerdictCell({ item }: { item: DeploymentItem }) {
  if (!item.reap_verdict) return null;
  const age = fmtStoppedAge(item.stopped_age_hours);
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={item.reap_verdict === "reap" ? "warning" : "outline"} data-testid={`orphan-verdict-${item.name}`}>
        {ORPHAN_VERDICT_LABEL[item.reap_verdict]}
      </Badge>
      {age && <span className="text-[10px] text-[var(--color-text-muted)]">stopped {age}</span>}
    </div>
  );
}

// ── Default sort hierarchy + per-column sort (operator's semantic ordering, 2026-07-10) ──
//
// KIND band — long-running compute first (VMs), then long-running services, then batch jobs, then
// scheduled, then event/one-time functions, then orphaned resources last.
const KIND_RANK: Record<string, number> = {
  VM: 0,
  CLOUD_RUN_SERVICE: 1,
  ECS_SERVICE: 1,
  CLOUD_RUN_JOB: 2,
  SCHEDULER: 3,
  CLOUD_FUNCTION: 4,
  LAMBDA: 4,
  DISK: 5,
  STATIC_IP: 5,
};
const kindRank = (kind: string): number => KIND_RANK[kind] ?? 9;

// STATUS band — what's running / active on top, what's completed / terminal below.
const STATUS_RANK: Record<string, number> = {
  running: 0,
  pending: 1,
  stale: 2,
  succeeded: 3,
  failed: 4,
  stopped: 5,
  unknown: 6,
};
const statusRank = (status: string): number => STATUS_RANK[status] ?? 7;

// The DEFAULT ordering when no column sort is active: liveness (running above completed), then kind
// (long-running above one-time / scheduled), then recency (newest run first), then name (stable).
// `dateFiltered` (WS-2 decision 2) — while a date-range query is active, always-on/no-interval rows
// (Cloud Run/ECS services, functions, orphaned disk/IP) sort LAST regardless of every other band:
// they never obeyed the range to begin with (the backend passes them through unfiltered), so
// interleaving them by their proxy last-run/kind rank would misread as "this row matched the range."
function defaultHierarchyCmp(a: DeploymentItem, b: DeploymentItem, dateFiltered: boolean): number {
  if (dateFiltered) {
    const aAlwaysOn = isAlwaysOnKind(a.kind);
    const bAlwaysOn = isAlwaysOnKind(b.kind);
    if (aAlwaysOn !== bAlwaysOn) return aAlwaysOn ? 1 : -1;
  }
  return (
    statusRank(a.status) - statusRank(b.status) ||
    kindRank(a.kind) - kindRank(b.kind) ||
    (b.last_run_at ?? "").localeCompare(a.last_run_at ?? "") ||
    a.name.localeCompare(b.name)
  );
}

type SortKey =
  | "mode"
  | "kind"
  | "target"
  | "cloud"
  | "launched_by"
  | "service"
  | "asset_group"
  | "status"
  | "last_run"
  | "progress"
  | "cost"
  | "exit"
  | "resources"
  | "health";

/** The comparable value for a column — number or string; null sorts last regardless of direction. */
function columnSortValue(item: DeploymentItem, key: SortKey): string | number | null {
  switch (key) {
    case "mode":
      return item.umbrella;
    case "kind":
      return kindRank(item.kind);
    case "target":
      return item.name.toLowerCase();
    case "cloud":
      return item.cloud;
    case "launched_by":
      return item.launched_by ?? "";
    case "service":
      return item.service ?? "";
    case "asset_group":
      return item.asset_group ?? "";
    case "status":
      return statusRank(item.status);
    case "last_run":
      return item.last_run_at ?? item.last_modified_at ?? null;
    case "progress":
      return item.captured_progress ?? null;
    case "cost":
      return item.cost_actual_usd ?? null;
    case "exit":
      return item.exit_code ?? null;
    case "resources":
      return leakedMonthlyUsd(item);
    case "health":
      return item.composite_health_status ?? null;
  }
}

/** Compare two rows by an active column sort — thin deployment-specific wiring over the shared,
 *  generic `compareByColumn` (`../lib/columnSort`): nulls last, ties broken by the default
 *  hierarchy. While `dateFiltered` (WS-2 decision 2) is true, always-on/no-interval rows sort last
 *  EVEN on an explicit column sort, overriding the column's own asc/desc direction (they carry no
 *  interval to sort by in a date-scoped view; a proxy timestamp like Cloud Run's last-deployed
 *  would otherwise interleave them, misreading as range-matched data) — passed as `forceLast`. */
function deploymentCompareByColumn(
  a: DeploymentItem,
  b: DeploymentItem,
  key: SortKey,
  dir: "asc" | "desc",
  dateFiltered: boolean,
): number {
  return compareByColumn(
    a,
    b,
    key,
    dir,
    columnSortValue,
    (x, y) => defaultHierarchyCmp(x, y, dateFiltered),
    dateFiltered ? (item) => isAlwaysOnKind(item.kind) : undefined,
  );
}

/** Lambda's Last-run cell (WS-D #10): the last-MODIFIED (deploy) time — NEVER mislabelled as
 *  last-invoked. last_run_at is honestly-absent (we avoid the paid CloudWatch metric); a tooltip on
 *  the cell explains the "—" so the operator knows it isn't a bug. */
function lambdaLastLabel(item: DeploymentItem): string {
  if (!item.last_modified_at) return "—";
  return `mod ${item.last_modified_at.slice(0, 16).replace("T", " ")}`;
}

/** Estate-total stranded cost (WS-D #17) — the sum of every row's INFERRED leaked $/mo (leaked
 *  disks/IPs on non-running VMs + orphaned DISK/STATIC_IP rows). Marked "est. / refresh
 *  periodically" (principle 8, never exact); hidden when nothing is leaked. */
function StrandedCostBadge({ items }: { items: DeploymentItem[] }) {
  const total = items.reduce((sum, i) => sum + leakedMonthlyUsd(i), 0);
  const count = items.filter((i) => i.has_unreleased_resources).length;
  if (total <= 0) return null;
  return (
    <div className="pt-2" data-testid="stranded-cost-total">
      <span className="inline-flex items-center gap-1 rounded bg-[var(--color-danger)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--color-danger)]">
        <AlertTriangle className="h-3.5 w-3.5" />
        ~${total.toFixed(0)}/mo stranded across {count} resource
        {count === 1 ? "" : "s"} (est. — refresh periodically)
      </span>
    </div>
  );
}

/** Kind cell — a compact icon + label chip so VM / job / service / lambda read at a glance. */
function KindBadge({ kind }: { kind: DeploymentItem["kind"] }) {
  const { label, tone, Icon } = kindMeta(kind);
  return (
    <span
      data-testid={`kind-badge-${kind}`}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${TONE_CLASSES[tone]}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Exit-code cell — a non-zero (incl. 137=OOM) exit is highlighted red; 0 reads green; absent is "—". */
function ExitCodeCell({ exitCode }: { exitCode: number | null }) {
  if (exitCode == null) return <span className="text-[var(--color-text-muted)]">—</span>;
  if (exitCode === 0)
    return (
      <Chip tone="green" testId="exit-code">
        0
      </Chip>
    );
  return (
    <Chip tone="red" testId="exit-code">
      {exitCode === 137 ? "137 (OOM)" : exitCode}
    </Chip>
  );
}

function lastRunLabel(at: string | null): string {
  if (!at) return "—";
  // Compact ISO → "MM-DD HH:MM" (trim the year + seconds for density).
  return at.length >= 16 ? at.slice(5, 16).replace("T", " ") : at;
}

function heartbeatLabel(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 90) return `${seconds}s`;
  const min = Math.round(seconds / 60);
  if (min < 90) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

/** Summary-chip-row skeleton — shown while the FIRST load is in flight, so the page shows
 * visible progress instead of reading blank during the (historically 30-90s) inventory +
 * umbrella-summary fetch. */
function DeploymentsSummaryHeaderSkeleton() {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="umbrella-summary-skeleton"
      aria-label="Loading deployments summary"
    >
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

/** Summary header — counts by status + last failure, aggregated across every mode in view. */
function DeploymentsSummaryHeader({
  summary,
  loading,
}: {
  summary: UmbrellaSummaryResponse | null;
  loading?: boolean;
}) {
  if (!summary) {
    if (loading) return <DeploymentsSummaryHeaderSkeleton />;
    return (
      <p className="text-sm text-[var(--color-text-muted)]" data-testid="umbrella-summary-empty">
        No summary available.
      </p>
    );
  }
  const order: { key: string; tone: ChipTone; label: string }[] = [
    { key: "succeeded", tone: "green", label: "succeeded" },
    { key: "running", tone: "blue", label: "running" },
    { key: "failed", tone: "red", label: "failed" },
    { key: "stale", tone: "yellow", label: "stale" },
    { key: "unknown", tone: "gray", label: "unknown" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="umbrella-summary">
      <Chip tone="gray" testId="umbrella-total">
        {summary.total} target{summary.total === 1 ? "" : "s"}
      </Chip>
      {order.map(({ key, tone, label }) => {
        const n = summary.counts_by_status[key] ?? 0;
        if (n === 0) return null;
        return (
          <Chip key={key} tone={tone} testId={`summary-count-${key}`}>
            {n} {label}
          </Chip>
        );
      })}
      {summary.stale_count > 0 && (
        <Chip tone="yellow" testId="summary-stale">
          {summary.stale_count} stale
        </Chip>
      )}
      {summary.last_failure && (
        <span className="text-[11px] text-[var(--color-text-muted)]" data-testid="summary-last-failure">
          last failure: <span className="font-mono text-red-400">{summary.last_failure.name}</span>
          {summary.last_failure.exit_code != null ? ` (exit ${summary.last_failure.exit_code})` : ""}
          {summary.last_failure.last_run_at ? ` · ${lastRunLabel(summary.last_failure.last_run_at)}` : ""}
        </span>
      )}
    </div>
  );
}

/** Feed-health read (heartbeat proxy) — a recent heartbeat reads green, stale amber, absent gray.
 * Used only as a fallback when manifest-derived freshness (the `/freshness` endpoint) hasn't loaded. */
function feedHealthLabel(seconds: number | null): { label: string; tone: ChipTone } {
  if (seconds == null) return { label: "—", tone: "gray" };
  if (seconds < 90) return { label: "live", tone: "green" };
  if (seconds < 600) return { label: "lagging", tone: "yellow" };
  return { label: "stale", tone: "red" };
}

/**
 * Feed-health from the per-deployment MANIFEST-DERIVED freshness (GET /api/deployments/
 * {id}/freshness). The real per-shard freshness against the availability index of the
 * asset_group the deployment owns — NOT the in-memory health-ping. A `liveness_only`
 * deployment (gateway / control-plane) renders HONESTLY as such, never a false "fresh".
 */
function freshnessFeedLabel(
  fresh: DeploymentFreshnessResponse,
): { label: string; tone: ChipTone; title: string } | null {
  switch (fresh.freshness_status) {
    case "fresh":
      return { label: "fresh", tone: "green", title: fresh.detail };
    case "stale":
      return { label: "stale", tone: "red", title: fresh.detail };
    case "liveness_only":
      return { label: "liveness only", tone: "gray", title: fresh.detail };
    default:
      return null; // unknown → fall back to the heartbeat proxy
  }
}

/** Human uptime — "18h" under a day, "4d" beyond. */
function uptimeLabel(hours: number | null | undefined): string | null {
  if (hours == null) return null;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

/** Last-run for a job/VM; uptime for an always-on service (which has no last-run). */
function lastRunOrUptime(item: DeploymentItem): string {
  if (item.last_run_at) return lastRunLabel(item.last_run_at);
  const up = uptimeLabel(item.uptime_hours);
  return up ? `up ${up}` : "—";
}

/** Last-run/uptime cell — amber colour-only marker when the value is DERIVED rather than
 *  authoritative (`basis === "approx"`: a heartbeat-stale VM's effective end, a single-timestamp
 *  kind, or the unmanaged-VM fallback). No text label — same convention as CostCell's
 *  `cost_basis === "partial"` (decision 4, 2026-07-20), reused here for one consistent visual
 *  language across the whole table.
 *
 *  While a date-range query is active, an always-on/no-interval row (Cloud Run/ECS service,
 *  function, orphaned disk/IP) gets a DISTINCT "always-on" badge instead — deliberately NOT the
 *  amber approx tone, because this means "not applicable" (the row was never scoped by the range
 *  at all), not "uncertain" (decision 2, 2026-07-20). */
function LastRunCell({ item, dateFiltered }: { item: DeploymentItem; dateFiltered: boolean }): React.ReactElement {
  const label = item.kind === "LAMBDA" ? lambdaLastLabel(item) : lastRunOrUptime(item);
  const isApprox = item.basis === "approx";
  const isAlwaysOn = dateFiltered && isAlwaysOnKind(item.kind);
  return (
    <span
      className={isApprox ? "text-amber-400" : undefined}
      data-testid={`last-run-${item.name}`}
      data-basis={item.basis ?? undefined}
      data-always-on={isAlwaysOn ? "true" : undefined}
    >
      {label}
      {isAlwaysOn ? (
        <span
          className="ml-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-1 py-0.5 text-[9px] font-medium text-cyan-400"
          title="Always-on — no start/end interval, so this row isn't scoped by the date-range filter"
          data-testid={`always-on-badge-${item.name}`}
        >
          always-on
        </span>
      ) : null}
    </span>
  );
}

/** Idle-spend rollup formatting — same fixed-2-decimal shape FleetOrphans uses ("$5.20"), so the
 *  figure reads identically on both surfaces (same estimator, same presentation). */
function fmtIdleUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Compact USD/day — "$38", "$9.1", "$0.10". */
function costLabel(cost: number | null | undefined): string | null {
  if (cost == null) return null;
  if (cost < 1) return `$${cost.toFixed(2)}`;
  if (cost < 10) return `$${cost.toFixed(1)}`;
  return `$${cost.toFixed(0)}`;
}

/** Cost/day cell — three USD figures from the billing exports (all USD; GCP is GBP→USD-converted
 *  server-side, so no toggle here). Primary = actual (most recent complete billing day); beneath it
 *  the trailing 7-day average and the projected "$/day if it runs 24h". "—" when the resource has no
 *  billing row yet (export lag / no resource granularity). When `cost_basis === "partial"` (the
 *  actual figure fell back to a still-accruing day — no complete billing day exists yet), the actual
 *  figure renders in the amber warning tone instead of the normal primary-text tone — colour is the
 *  only signal, no added text/tooltip line (operator decision 4, 2026-07-20). */
function CostCell({ item }: { item: DeploymentItem }): React.ReactElement {
  const actual = costLabel(item.cost_actual_usd);
  const avg = costLabel(item.cost_avg_7d_usd);
  const proj = costLabel(item.cost_projected_24h_usd);
  if (actual == null && avg == null && proj == null) {
    return <span className="text-[var(--color-text-muted)]">—</span>;
  }
  const isPartial = item.cost_basis === "partial";
  const title = [
    item.cost_actual_usd != null ? `Actual (last full day): $${item.cost_actual_usd}` : null,
    item.cost_avg_7d_usd != null ? `7-day avg/day: $${item.cost_avg_7d_usd}` : null,
    item.cost_projected_24h_usd != null ? `Projected if it runs 24h: $${item.cost_projected_24h_usd}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sub = [avg != null ? `7d ${avg}` : null, proj != null ? `24h ${proj}` : null].filter(Boolean).join(" · ");
  return (
    <span title={title} data-testid={`cost-${item.name}`}>
      <span
        className={isPartial ? "text-amber-400" : "text-[var(--color-text-primary)]"}
        data-testid={`cost-actual-${item.name}`}
        data-cost-basis={item.cost_basis ?? undefined}
      >
        {actual ?? avg ?? proj}
      </span>
      {sub ? <span className="block text-[10px] text-[var(--color-text-muted)]">{sub}</span> : null}
    </span>
  );
}

/** Service health (Open-Q7 sub-taxonomy) — ECS desired-vs-running; Cloud Run service by status.
 *  serving (running==desired>0) · scaled-to-zero (desired==0) · dead (desired>0,running==0) ·
 *  degraded (0<running<desired). A service has no exit_code, so this replaces the exit chip. */
function serviceHealthLabel(item: DeploymentItem): { label: string; tone: ChipTone; title: string } {
  const desired = item.desired_count;
  const running = item.running_count;
  if (desired != null && running != null) {
    if (desired === 0) return { label: "scaled-to-zero", tone: "gray", title: "desired=0 — off on purpose" };
    if (running === 0) return { label: "dead", tone: "red", title: `desired ${desired}, running 0 — should be up` };
    if (running < desired) return { label: `degraded ${running}/${desired}`, tone: "yellow", title: "some tasks down" };
    return { label: "serving", tone: "green", title: `${running}/${desired} tasks` };
  }
  // Cloud Run service (no task counts) — fall back to status + latest revision.
  if (item.status === "running" || item.status === "succeeded")
    return { label: "serving", tone: "green", title: item.revision ? `rev ${item.revision}` : "ready" };
  if (item.status === "stopped") return { label: "scaled-to-zero", tone: "gray", title: "not serving" };
  return { label: item.status, tone: "gray", title: "service status" };
}

// Composite WORK-health (parent D.3) — the server-derived verdict, not just fresh/stale. When a
// target carries `composite_health_status`, it wins the Health column; otherwise we fall back to
// the freshness / service signal. Only `working` is green; every failure mode is called out by
// name, coloured by 3-tier severity (Open-Q2): green=working · amber=degraded · red=broken-now.
const HEALTH_META: Record<VmHealth | ServiceHealth, { label: string; tone: ChipTone }> = {
  working: { label: "working", tone: "green" },
  stalled: { label: "stalled", tone: "yellow" },
  "oom-risk": { label: "oom-risk", tone: "red" },
  "workload-dead": { label: "workload-dead", tone: "red" },
  "disk-full": { label: "disk-full", tone: "red" },
  hung: { label: "hung", tone: "red" },
  dead: { label: "dead", tone: "gray" },
  // Cloud Scheduler verdicts (WS-D #9) — the "fired on time?" signal on SCHEDULER rows.
  overdue: { label: "overdue", tone: "red" },
  "on-time": { label: "on-time", tone: "green" },
  paused: { label: "paused", tone: "gray" },
  // Service verdicts (Cloud Run service / ECS, D.3) — the live inventory folds these into
  // composite_health_status too, so the map must cover the service vocabulary, not just VM/scheduler.
  serving: { label: "serving", tone: "green" },
  "scaled-to-zero": { label: "scaled-to-zero", tone: "gray" },
  degraded: { label: "degraded", tone: "yellow" },
  unknown: { label: "unknown", tone: "gray" },
};

/** Tooltip for the Health cell — the resource summary behind the verdict (full vector in the
 *  detail popover). Only the thin-list summary scalars; io/net/workload_alive live on /detail. */
function healthTitle(item: DeploymentItem): string | undefined {
  const parts: string[] = [];
  if (item.cpu_pct != null) parts.push(`cpu ${item.cpu_pct}%`);
  if (item.mem_pct != null)
    parts.push(`mem ${item.mem_pct}%${item.mem_slope != null && item.mem_slope > 0 ? " ↑" : ""}`);
  if (item.disk_pct != null) parts.push(`disk ${item.disk_pct}%`);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Health-chip meta, defensive against a verdict the backend emits before the UI knows it — the live
 *  `composite_health_status` folds the VM + scheduler + service vocabularies, so an unknown value must
 *  degrade to a gray chip, never crash the row render (mirror of kindMeta / LaunchedByBadge). */
function healthMeta(h: string): { label: string; tone: ChipTone } {
  return HEALTH_META[h as VmHealth | ServiceHealth] ?? { label: h, tone: "gray" as ChipTone };
}

/** The composite Health chip content — inlines the actionable number for oom-risk / disk-full. */
function compositeHealthLabel(item: DeploymentItem): { label: string; tone: ChipTone; title?: string } | null {
  const h = item.composite_health_status;
  if (!h) return null;
  const meta = healthMeta(h);
  let label = meta.label;
  if (h === "oom-risk" && item.mem_pct != null) label = `oom-risk ${item.mem_pct}%`;
  else if (h === "disk-full" && item.disk_pct != null) label = `disk-full ${item.disk_pct}%`;
  return { label, tone: meta.tone, title: healthTitle(item) };
}

// LIVE-row feed-health prefers manifest-derived freshness, looked up by row name from this
// map (populated by DeploymentsContent after the inventory loads). Non-live rows show "—".
const FreshnessContext = createContext<Record<string, DeploymentFreshnessResponse>>({});

// When the cockpit embeds the inventory it provides an `onDrill` so a row opens the
// per-target detail IN the cockpit (a slide-over) instead of navigating to /deployments/:name.
// Standalone (no provider) → the row is a Link to the detail page.
const DrillContext = createContext<((name: string) => void) | undefined>(undefined);

// Reap/delete actions (Fleet-tab consolidation) — DeploymentRow is rendered deep inside
// DeploymentMatrix, so the per-row delete-click handler reaches it via context (same pattern as
// DrillContext) rather than prop-drilling through DeploymentMatrix.
const OrphanDeleteContext = createContext<((item: DeploymentItem) => void) | undefined>(undefined);

/** The single unified column set — one shape for every mode (sparse "—" where N/A). Every column
 *  except Controls carries a `sortKey` so its header can drive a click-to-sort (WS-D, 2026-07-10). */
const UNIFIED_COLUMNS: { label: string; align?: "right"; sortKey?: SortKey }[] = [
  { label: "Mode", sortKey: "mode" },
  { label: "Kind", sortKey: "kind" },
  { label: "Target", sortKey: "target" },
  { label: "Cloud", sortKey: "cloud" },
  { label: "Launched by", sortKey: "launched_by" },
  { label: "Service", sortKey: "service" },
  { label: "Asset group", sortKey: "asset_group" },
  { label: "Status", sortKey: "status" },
  { label: "Last run / up", sortKey: "last_run" },
  { label: "Progress", align: "right", sortKey: "progress" },
  { label: "Cost/day", align: "right", sortKey: "cost" },
  { label: "Exit", sortKey: "exit" },
  { label: "Resources", sortKey: "resources" },
  { label: "Health", sortKey: "health" },
  { label: "Controls" },
];

/** One resource metric — a labelled %, coloured only when elevated (amber ≥70) or critical
 * (red ≥90) so a hot VM's mem/disk jumps out; `↑` marks a sustained climb (OOM slope). */
function ResourceMetric({ label, pct, up }: { label: string; pct?: number | null; up?: boolean }) {
  if (pct == null) return null;
  const tone = pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-[var(--color-text-secondary)]";
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="text-[9px] uppercase text-[var(--color-text-muted)]">{label}</span>
      <span className={`font-mono text-[11px] ${tone}`}>
        {pct}
        {up ? "↑" : ""}
      </span>
    </span>
  );
}

/** Resources cell — cpu / mem / disk utilisation from the edge `/proc` push (WS-D). A wedged
 * VM (`hung`) has no samples → "—", honestly (never a fake 0). */
function ResourceCell({ item }: { item: DeploymentItem }) {
  const hasAny = item.cpu_pct != null || item.mem_pct != null || item.disk_pct != null;
  if (!hasAny) return <span className="text-[var(--color-text-muted)]">—</span>;
  return (
    <div className="flex items-center gap-2.5">
      <ResourceMetric label="cpu" pct={item.cpu_pct} />
      <ResourceMetric label="mem" pct={item.mem_pct} up={item.mem_slope != null && item.mem_slope > 0} />
      <ResourceMetric label="dsk" pct={item.disk_pct} />
    </div>
  );
}

/** Errors + throughput (Fleet-tab consolidation "cheap merged columns") — rows_error/rows_in/
 *  events_emitted already exist on DeploymentItem (Tier-0 free wins, previously unrendered).
 *  Null-renders per field so a kind/row without the signal shows nothing, not a fabricated 0. */
function ErrorsThroughput({ item }: { item: DeploymentItem }) {
  const hasErrors = item.rows_error != null && item.rows_error > 0;
  const hasThroughput = item.rows_in != null || item.events_emitted != null;
  if (!hasErrors && !hasThroughput) return null;
  return (
    <div className="flex items-center gap-2 text-[10px]" data-testid={`errors-throughput-${item.name}`}>
      {hasErrors && (
        <span className="font-mono text-red-400" title="rows_error" data-testid={`errors-${item.name}`}>
          {item.rows_error!.toLocaleString()} err
        </span>
      )}
      {item.rows_in != null && (
        <span className="font-mono text-[var(--color-text-muted)]" title="rows_in">
          {item.rows_in.toLocaleString()} in
        </span>
      )}
      {item.events_emitted != null && (
        <span className="font-mono text-[var(--color-text-muted)]" title="events_emitted">
          {item.events_emitted.toLocaleString()} evt
        </span>
      )}
    </div>
  );
}

/** machine-type · zone subtitle (Tier-0 placement data), shown muted under the name. */
function TargetSubtitle({ item }: { item: DeploymentItem }) {
  const parts = [item.machine_type, item.zone].filter(Boolean);
  if (parts.length === 0) return null;
  return <div className="text-[10px] text-[var(--color-text-tertiary)]">{parts.join(" · ")}</div>;
}

function TargetCell({ item }: { item: DeploymentItem }) {
  const onDrill = useContext(DrillContext);
  const linkCls = "font-mono text-[var(--color-text-primary)] hover:underline";
  return (
    <td className="py-1.5">
      {onDrill ? (
        <button
          type="button"
          onClick={() => onDrill(item.name)}
          data-testid={`deployment-link-${item.name}`}
          className={linkCls}
        >
          {item.name}
        </button>
      ) : (
        <Link
          to={`/deployments/${encodeURIComponent(item.name)}`}
          data-testid={`deployment-link-${item.name}`}
          className={linkCls}
        >
          {item.name}
        </Link>
      )}
      <TargetSubtitle item={item} />
    </td>
  );
}

function StatusCell({ item }: { item: DeploymentItem }) {
  // Heartbeat rides the status chip (its own column was a duplicate — retired in the merge).
  const hb = heartbeatLabel(item.heartbeat_age_seconds);
  return (
    <td className="py-1.5">
      <Chip tone={statusTone(item.status)} testId={`status-${item.name}`}>
        {item.status}
      </Chip>
      {hb && <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">hb {hb}</span>}
      <OrphanVerdictCell item={item} />
    </td>
  );
}

/** One unified row — every column, "—" where the mode doesn't populate a field. */
function DeploymentRow({ item, dateFiltered }: { item: DeploymentItem; dateFiltered: boolean }) {
  const freshnessByName = useContext(FreshnessContext);
  const onDeleteOrphan = useContext(OrphanDeleteContext);
  const rowCls = "border-b border-[var(--color-border-default)]/40 hover:bg-[var(--color-bg-secondary)]";

  // Health precedence: the server-derived COMPOSITE (WS-D.3) wins when present; else it's
  // kind-aware — a service/function reads its 5xx/error rate, a LIVE VM reads manifest
  // freshness (heartbeat fallback); everything else has no live-health signal.
  const isService = SERVICE_KINDS.has(item.kind) || FUNCTION_KINDS.has(item.kind);
  const isVmLive = item.kind === "VM" && item.umbrella === "LIVE";
  const fresh = freshnessByName[item.name];
  const derived = fresh ? freshnessFeedLabel(fresh) : null;
  const feed =
    compositeHealthLabel(item) ??
    (isService
      ? serviceHealthLabel(item)
      : isVmLive
        ? (derived ?? { ...feedHealthLabel(item.heartbeat_age_seconds), title: "heartbeat proxy" })
        : null);

  return (
    <tr data-testid={`deployment-row-${item.name}`} data-launched-by={item.launched_by ?? "unknown"} className={rowCls}>
      <td className="py-1.5">
        <ModeBadge umbrella={item.umbrella} />
      </td>
      <td className="py-1.5">
        <KindBadge kind={item.kind} />
      </td>
      <TargetCell item={item} />
      <td className="py-1.5">
        <CloudBadge cloud={item.cloud} />
      </td>
      <td className="py-1.5" data-testid={`launched-by-cell-${item.name}`}>
        <LaunchedByBadge value={item.launched_by} />
      </td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.service || "—"}</td>
      <td className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">{item.asset_group || "—"}</td>
      <StatusCell item={item} />
      <td
        className="py-1.5 font-mono text-xs text-[var(--color-text-secondary)]"
        title={
          item.kind === "LAMBDA"
            ? "Lambda shows last-MODIFIED (deploy), not last-invoked — we deliberately avoid the paid CloudWatch metric (Athena/BigQuery instead), so a '—' last-run isn't a bug."
            : undefined
        }
      >
        <LastRunCell item={item} dateFiltered={dateFiltered} />
      </td>
      <td className="py-1.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
        {item.captured_progress != null ? (
          item.captured_progress.toLocaleString()
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="py-1.5 text-right font-mono text-xs text-[var(--color-text-secondary)]">
        <CostCell item={item} />
      </td>
      <td className="py-1.5">
        <ExitCodeCell exitCode={item.exit_code} />
      </td>
      <td className="py-1.5" data-testid={`resources-${item.name}`}>
        <div className="flex flex-col gap-0.5">
          <ResourceCell item={item} />
          <LeakedBadge item={item} />
          <ErrorsThroughput item={item} />
        </div>
      </td>
      <td className="py-1.5" title={feed?.title}>
        {feed ? (
          <Chip tone={feed.tone} testId={`feed-health-${item.name}`}>
            {feed.label}
          </Chip>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="py-1.5">
        {item.kind === "VM" && item.reap_verdict ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDeleteOrphan?.(item)}
            data-testid={`orphan-delete-${item.name}`}
            title="Delete this stopped instance + its boot disk"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : item.kind === "VM" ? (
          <VmControls vmName={item.name} status={item.status} />
        ) : (
          <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
        )}
      </td>
    </tr>
  );
}

/** Table-shaped skeleton — shown in place of the matrix while the FIRST load is in
 * flight (inventory + freshness can historically take 30-90s), so the page shows
 * visible progress instead of a blank/empty-looking table. */
function DeploymentMatrixSkeleton() {
  return (
    <div className="space-y-2 py-2" data-testid="deployment-matrix-skeleton" aria-label="Loading deployments">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function DeploymentMatrix({ items, dateFiltered }: { items: DeploymentItem[]; dateFiltered: boolean }) {
  // null → the default semantic hierarchy; else an explicit column sort. A header click cycles that
  // column asc → desc → back to the default hierarchy (shared `useColumnSort` — ../hooks/useColumnSort).
  const { sort, onHeaderClick } = useColumnSort<SortKey>();
  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort(
      sort
        ? (a, b) => deploymentCompareByColumn(a, b, sort.key, sort.dir, dateFiltered)
        : (a, b) => defaultHierarchyCmp(a, b, dateFiltered),
    );
    return arr;
  }, [items, sort, dateFiltered]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-3" data-testid="deployment-matrix-empty">
        No deployments match the current filters.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="deployment-matrix">
        <thead>
          <tr className="border-b border-[var(--color-border-default)] text-[var(--color-text-muted)] text-left">
            {UNIFIED_COLUMNS.map((c) => {
              const dir = c.sortKey != null && sort?.key === c.sortKey ? sort.dir : undefined;
              return (
                <th
                  key={c.label}
                  scope="col"
                  className={`py-1.5 font-medium${c.align === "right" ? " text-right" : ""}${
                    c.sortKey ? " cursor-pointer select-none hover:text-[var(--color-text-primary)]" : ""
                  }${dir ? " text-[var(--color-text-primary)]" : ""}`}
                  onClick={c.sortKey ? () => onHeaderClick(c.sortKey) : undefined}
                  aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                  data-testid={`col-${c.sortKey ?? "controls"}`}
                >
                  {c.label}
                  {dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <DeploymentRow key={`${item.kind}-${item.name}`} item={item} dateFiltered={dateFiltered} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Kind filter options — 9 inventory-level literals; only 6 are in the canonical UAC
// `DeploymentKind` enum (SCHEDULER/DISK/STATIC_IP are inventory-only), matching the prior
// single-select dropdown's option list.
const KIND_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "VM", label: "VM" },
  { value: "CLOUD_RUN_JOB", label: "run job" },
  { value: "CLOUD_RUN_SERVICE", label: "run service" },
  { value: "ECS_SERVICE", label: "ECS service" },
  { value: "LAMBDA", label: "Lambda" },
  { value: "CLOUD_FUNCTION", label: "cloud function" },
  { value: "SCHEDULER", label: "scheduler" },
  { value: "DISK", label: "disk (orphaned)" },
  { value: "STATIC_IP", label: "static IP (orphaned)" },
];

/**
 * Kind filter — MULTI-select toggle chips (decision 3, 2026-07-20: several kinds visible at once,
 * URL-backed via a comma-separated `?kind=`). Replaces the old single-`<select>`; still purely
 * client-side (kind carries no server param) — only the SHAPE of the filter changed, equality →
 * set-membership. An empty selection means "all", matching the old dropdown's default option.
 */
function KindFilterChips({ selected, onToggle }: { selected: Set<string>; onToggle: (kind: string) => void }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5" data-testid="filter-kind">
      <span className="text-[11px] text-[var(--color-text-muted)]">kind</span>
      {KIND_FILTER_OPTIONS.map((o) => {
        const active = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            data-testid={`filter-kind-${o.value}`}
            onClick={() => onToggle(o.value)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${
              active
                ? TONE_CLASSES.blue
                : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Date-range filter — two native date inputs bounding an inclusive `[date_from, date_to]` window,
 * URL-backed (`?date_from=&date_to=`) and wired straight to the backend's VM/registry overlap
 * query (deployment_ui_date_range_filter_and_search_2026_07_20.md). Both bounds are optional and
 * independently clearable — an empty value simply omits that param, matching every other filter
 * here. Native `<input type="date">` mirrors the CostObservability date-range picker: it's
 * keyboard-/screen-reader-accessible and needs no extra dependency. `max` on both fields blocks a
 * future date from ever reaching the query; `min`/`max` cross-constrain so the pair can't invert.
 */
function DateRangeFilter({
  from,
  to,
  onChange,
  onClear,
}: {
  from: string;
  to: string;
  onChange: (key: "date_from" | "date_to", value: string) => void;
  // A single atomic clear — two sequential `onChange` calls each race against the SAME pre-update
  // `URLSearchParams` snapshot (react-router's `setSearchParams` reads `prev` synchronously before
  // the first call's navigation lands), so the second call silently clobbers the first instead of
  // composing. Clearing both bounds must go through one state update, not two.
  onClear: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const field =
    "bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] rounded px-1.5 py-1 text-xs text-[var(--color-text-primary)]";
  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
      date range
      <input
        type="date"
        aria-label="Date range start"
        data-testid="filter-date-from"
        value={from}
        max={to || today}
        onChange={(e) => onChange("date_from", e.target.value)}
        className={field}
      />
      <span className="text-[var(--color-text-tertiary)]">→</span>
      <input
        type="date"
        aria-label="Date range end"
        data-testid="filter-date-to"
        value={to}
        min={from}
        max={today}
        onChange={(e) => onChange("date_to", e.target.value)}
        className={field}
      />
      {(from || to) && (
        <button
          type="button"
          aria-label="Clear date range"
          data-testid="filter-date-clear"
          onClick={onClear}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Target search box (WS-3) — free-text, case-insensitive substring match on the Target column
 * (`item.name`), URL-backed (`?q=`), clears with an ✕. `value` drives the visible input AND the
 * actual client-side filter (instant — this is a cheap in-memory array filter, not a network
 * round-trip, so there's no correctness reason to lag it); the caller debounces ONLY the write
 * back to the URL param so typing doesn't spam browser history / re-render URL-derived consumers
 * on every keystroke.
 */
function TargetSearchBox({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
      target
      <input
        type="text"
        aria-label="Search target"
        data-testid="filter-target-search"
        placeholder="search…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-1.5 py-1 text-xs text-[var(--color-text-primary)]"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear target search"
          data-testid="filter-target-search-clear"
          onClick={onClear}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          ✕
        </button>
      )}
    </label>
  );
}

// Status-filter chips — quick "isolate all failed / all succeeded / all stuck" toggles, with the
// count beside each so the operator sees the spread at a glance. They drive the SAME `status`
// filter the dropdown does. "Stuck" maps to `stale`. Rendered via the shared `StatusFilterChips`
// primitive (`../components/filters/StatusFilterChips`) — `statusChips()` below computes its
// `chips` prop from the summary's `counts_by_status` (the authoritative tally aggregated across
// every mode in view), the deployment-specific piece that isn't part of the generic component.
const STATUS_CHIP_DEFS: { value: string; label: string; tone: ChipTone; countKey: string | null }[] = [
  { value: "all", label: "All", tone: "gray", countKey: null },
  { value: "running", label: "Running", tone: "blue", countKey: "running" },
  { value: "succeeded", label: "Succeeded", tone: "green", countKey: "succeeded" },
  { value: "failed", label: "Failed", tone: "red", countKey: "failed" },
  { value: "stale", label: "Stuck", tone: "yellow", countKey: "stale" },
];

function statusChips(summary: UmbrellaSummaryResponse | null): StatusChip[] {
  const total = summary?.total ?? 0;
  return STATUS_CHIP_DEFS.map((chip) => ({
    value: chip.value,
    label: chip.label,
    tone: chip.tone,
    count: chip.countKey == null ? total : (summary?.counts_by_status[chip.countKey] ?? 0),
  }));
}

/** Aggregate per-mode summaries into one combined tally (for the all-modes view). */
function aggregateSummaries(sums: UmbrellaSummaryResponse[]): UmbrellaSummaryResponse | null {
  if (sums.length === 0) return null;
  if (sums.length === 1) return sums[0];
  const counts: Record<string, number> = {};
  let total = 0;
  let stale = 0;
  let lastFailure: UmbrellaLastFailure | null = null;
  for (const s of sums) {
    total += s.total;
    stale += s.stale_count;
    for (const [k, v] of Object.entries(s.counts_by_status)) counts[k] = (counts[k] ?? 0) + v;
    if (s.last_failure && (!lastFailure || (s.last_failure.last_run_at ?? "") > (lastFailure.last_run_at ?? ""))) {
      lastFailure = s.last_failure;
    }
  }
  return { umbrella: "LIVE", total, counts_by_status: counts, stale_count: stale, last_failure: lastFailure };
}

/**
 * DeploymentsContent — the chrome-less unified inventory surface (no `<main>`, no page
 * `<h1>`) so its page wrapper (`DeploymentsPage`) supplies the shell. Shows EVERY mode in
 * one flat table; Mode is a FILTER (All / Live / Batch / Paper), not a tab.
 *
 * ALL filters are URL-backed (`?umbrella=&cloud=&status=&asset_group=&kind=&launched_by=&region=`)
 * — the single source of truth, so alert deep-links and shareable filtered views work. The old
 * `embedded` dual-path (local state, no URL writes) was retired 2026-07-17 along with the
 * `?tab=` scheme: there is no cockpit `?tab=` for the URL to collide with anymore, and reading
 * the URL is what makes `/deployments?umbrella=batch&status=failed` actually apply both filters.
 */
export function DeploymentsContent({
  onDrill,
}: {
  onDrill?: (name: string) => void;
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlMode = (searchParams.get("umbrella") ?? "").toUpperCase();
  // Validate the URL value against the SAME option list the dropdown renders, so the two can never
  // drift — the old hardcoded ["LIVE","BATCH","PAPER"] silently dropped EXPERIMENT / NONE selections
  // (the dropdown would snap back to "all"), which is why the Mode filter appeared not to stick.
  const modeFilter: ModeFilter = MODE_OPTIONS.some((o) => o.value !== "" && o.value === urlMode)
    ? (urlMode as ModeFilter)
    : "";
  const cloudFilter = searchParams.get("cloud")?.toUpperCase() ?? "";
  // Status defaults to `running` (live-first) — the operator opens on what's actually running; the
  // "all" option reveals the completed / historical rows. Absent param → running (never "all").
  const statusFilter = searchParams.get("status") ?? "running";
  const assetGroupFilter = searchParams.get("asset_group") ?? "";
  // Kind is client-side (not a server filter param) — the way a user isolates services vs jobs
  // vs VMs (services have Mode="—", so Mode can't find them — Open-Q1). MULTI-select (decision 3,
  // 2026-07-20) — a comma-separated `?kind=` so several kinds show at once (how the operator hides/
  // shows always-on services rather than the date filter silently dropping them); an old
  // single-value deep-link (`?kind=VM`) still works unchanged as a 1-element set. Empty = "all".
  const kindFilterRaw = searchParams.get("kind") ?? "";
  const kindFilters = useMemo(
    () =>
      new Set(
        kindFilterRaw
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
    [kindFilterRaw],
  );
  // Launched-by is client-side (WS-D #14) — how an operator isolates every ad-hoc / unmanaged
  // resource so stranded compute is immediately findable.
  const launchedByFilter = searchParams.get("launched_by") ?? "";
  // Service is client-side (WS-3) — options come from the distinct `service` values already in the
  // loaded inventory (same pattern as asset_group's dropdown), not a fresh server round-trip; the
  // inventory endpoint accepts its own `service` query param for other callers, but this dropdown
  // deliberately filters what's already on the page (decision: "options from distinct service values
  // in the loaded inventory ... client-side", deployment_ui_date_range_filter_and_search_2026_07_20).
  const serviceFilter = searchParams.get("service") ?? "";
  // Region is a server-side filter (WS-D reconciliation) — defaults to asia-northeast1 (the configured
  // default census); "all" sweeps every region, or pick a specific one from the dynamic list.
  const regionFilter = searchParams.get("region") ?? "asia-northeast1";
  // Date-range is a server-side filter (WS-2) — "what was running between date A and B", wired to
  // the backend's VM/registry overlap query. Absent (default) → no date filter, same as every other
  // optional param here.
  const dateFromFilter = searchParams.get("date_from") ?? "";
  const dateToFilter = searchParams.get("date_to") ?? "";

  const [items, setItems] = useState<DeploymentItem[]>([]);
  const [summary, setSummary] = useState<UmbrellaSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Out-of-range archive floor (WS-2 decision 5) — set only alongside a date-range request whose
  // date_from predates the real 30-day GCS retention floor. Drives an explicit banner rather than
  // silently returning a clipped/partial result.
  const [archiveFloor, setArchiveFloor] = useState<string | null>(null);
  const [dateRangeOutOfRange, setDateRangeOutOfRange] = useState(false);
  const [freshness, setFreshness] = useState<Record<string, DeploymentFreshnessResponse>>({});
  const [regionOptions, setRegionOptions] = useState<{ value: string; label: string }[]>([
    { value: "asia-northeast1", label: "asia-northeast1 (default)" },
    { value: "all", label: "all regions" },
  ]);
  // Idle-spend rollup (Fleet-tab consolidation) — same GET /api/fleet/orphans FleetOrphans reads,
  // fetched independently of the main inventory load (its own endpoint, its own refresh cadence).
  const [orphanData, setOrphanData] = useState<OrphanInventoryResponse | null>(null);
  // Reap/delete actions (Fleet-tab consolidation) — ported from FleetOrphans' dry-run-first bulk
  // reap + per-instance delete, same confirm-dialog safety pattern (destructive actions never fire
  // without an explicit confirm click).
  const [reapBusy, setReapBusy] = useState(false);
  const [confirmReap, setConfirmReap] = useState<ReapResponse | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeploymentItem | null>(null);
  const [reapActionMsg, setReapActionMsg] = useState<string | null>(null);
  const [reapError, setReapError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Clears BOTH date-range bounds in one atomic update — two sequential `setParam` calls would each
  // race against the same pre-update `prev` snapshot and clobber each other (see DateRangeFilter).
  const clearDateRange = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("date_from");
        next.delete("date_to");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  // Toggles one kind in/out of the multi-select — writes the WHOLE next set back as a single
  // `setParam` call (a toggle only ever touches one key, so there's no risk of the two-sequential-
  // calls race that `clearDateRange` above exists to avoid).
  const toggleKind = useCallback(
    (kind: string) => {
      const next = new Set(kindFilters);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      setParam("kind", Array.from(next).join(","));
    },
    [kindFilters, setParam],
  );

  // Target search (WS-3) — local state drives the visible input AND the actual client-side
  // filter instantly; only the URL write is debounced (300ms, house `useDebounce`) so typing
  // doesn't spam history/re-render every URL-derived consumer on every keystroke. Lazy-init reads
  // the deep-linked `?q=` once on mount; the box's own `onChange`/`onClear` are the only other
  // writers of `searchInput`, so there's no external-URL-change case to reconcile back into it.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(searchInput, 300);
  useEffect(() => {
    setParam("q", debouncedSearch);
  }, [debouncedSearch, setParam]);
  const clearSearch = useCallback(() => setSearchInput(""), []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const cloud = cloudFilter === "GCP" || cloudFilter === "AWS" ? (cloudFilter as DeploymentCloud) : undefined;
    const mode = modeFilter ? (modeFilter as DeploymentUmbrella) : undefined;
    // Summary: a single mode → its own summary; all modes → aggregate LIVE+BATCH+PAPER.
    const summaryP: Promise<UmbrellaSummaryResponse[]> = mode
      ? getUmbrellaSummary(mode).then((s) => [s])
      : Promise.all([getUmbrellaSummary("LIVE"), getUmbrellaSummary("BATCH"), getUmbrellaSummary("PAPER")]);
    Promise.all([
      getDeploymentInventory({
        umbrella: mode,
        cloud,
        // "all" (or empty) = no status filter; the default `running` narrows to live rows server-side.
        status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        asset_group: assetGroupFilter || undefined,
        region: regionFilter || undefined,
        date_from: dateFromFilter || undefined,
        date_to: dateToFilter || undefined,
      }),
      summaryP,
    ])
      .then(([inv, sums]) => {
        setItems(inv.items);
        setSummary(aggregateSummaries(sums));
        setArchiveFloor(inv.archive_floor ?? null);
        setDateRangeOutOfRange(inv.date_range_out_of_range ?? false);
        // Enrich LIVE rows with manifest-derived per-deployment freshness (feed-health column).
        const liveRows = inv.items.filter((i) => i.umbrella === "LIVE");
        if (liveRows.length > 0) {
          void Promise.allSettled(liveRows.map((i) => getDeploymentFreshness(i.name))).then((results) => {
            const next: Record<string, DeploymentFreshnessResponse> = {};
            results.forEach((r) => {
              if (r.status === "fulfilled") next[r.value.deployment_id] = r.value;
            });
            setFreshness(next);
          });
        } else {
          setFreshness({});
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [modeFilter, cloudFilter, statusFilter, assetGroupFilter, regionFilter, dateFromFilter, dateToFilter]);

  // Fleet-wide "Reconcile Registry" action — relocated from the retired /vm-deployments page
  // (vm_deployments_venue_panels_orphaned_route_2026_07_21.md). This is the only piece of that
  // page without a redundant equivalent here: the raw active+archive VM table it also carried
  // is a strict subset of this page's own unified VM-kind inventory (with its own archive/"all"
  // status toggle), so it was deleted rather than relocated.
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<VmReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const reconcile = useCallback(() => {
    setReconciling(true);
    setReconcileResult(null);
    setReconcileError(null);
    reconcileVmDeployments()
      .then((result) => {
        setReconcileResult(result);
        load();
      })
      .catch((e: unknown) => setReconcileError(e instanceof Error ? e.message : "Reconcile failed"))
      .finally(() => setReconciling(false));
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  // Pauses while the tab is hidden; resumes with an immediate refresh.
  useVisibilityPausedInterval(load, 60_000);

  // Idle-spend rollup — independent fetch/cadence from the main inventory load (its own endpoint).
  const loadOrphans = useCallback(() => {
    void getOrphans(24).then(
      (data) => setOrphanData(data),
      () => setOrphanData(null), // honest absence on fetch failure — cards render "—", never stale data
    );
  }, []);
  useEffect(() => {
    loadOrphans();
  }, [loadOrphans]);
  useVisibilityPausedInterval(loadOrphans, 60_000);

  // Bulk reap: dry-run first to populate the confirm dialog with the real candidate list (never
  // deletes on this click — same two-step pattern as FleetOrphans).
  const previewReap = useCallback(() => {
    setReapBusy(true);
    setReapError(null);
    reapOrphans(true, 24)
      .then((r) => setConfirmReap(r))
      .catch((err: unknown) => setReapError(err instanceof Error ? err.message : "reap dry-run failed"))
      .finally(() => setReapBusy(false));
  }, []);

  const executeReap = useCallback(() => {
    setReapBusy(true);
    reapOrphans(false, 24)
      .then((r) => {
        setReapActionMsg(`Reaped ${r.reaped_total} VM(s) — ~${fmtIdleUsd(r.monthly_reclaimed_usd)}/mo disk reclaimed`);
        setConfirmReap(null);
        load();
        loadOrphans();
      })
      .catch((err: unknown) => setReapError(err instanceof Error ? err.message : "reap failed"))
      .finally(() => setReapBusy(false));
  }, [load, loadOrphans]);

  const executeDelete = useCallback(() => {
    if (!confirmDelete) return;
    setReapBusy(true);
    deleteInstance(confirmDelete.name, confirmDelete.zone ?? "")
      .then((r) => {
        setReapActionMsg(r.deleted ? `Deleted ${r.name}` : `Delete of ${r.name} was refused`);
        setConfirmDelete(null);
        load();
        loadOrphans();
      })
      .catch((err: unknown) => setReapError(err instanceof Error ? err.message : "delete failed"))
      .finally(() => setReapBusy(false));
  }, [confirmDelete, load, loadOrphans]);

  // Region options for the selector — dynamic from the API (default pinned first), so a new region
  // appears the moment infra lands there. Fetched once; on failure the seeded default + "all" remain.
  useEffect(() => {
    let cancelled = false;
    void getDeploymentRegions()
      .then((r) => {
        if (cancelled) return;
        setRegionOptions([
          ...r.regions.map((n) => ({ value: n, label: n === r.default ? `${n} (default)` : n })),
          { value: r.all_value, label: "all regions" },
        ]);
      })
      .catch(() => {
        /* keep the seeded fallback options */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Asset-group options derive from the loaded items (plus any active filter value).
  const assetGroupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.asset_group) set.add(i.asset_group);
    if (assetGroupFilter) set.add(assetGroupFilter);
    return ["", ...Array.from(set).sort()];
  }, [items, assetGroupFilter]);

  // Service options derive from the loaded items (plus any active filter value) — same
  // client-side pattern as asset_group's dropdown (decision WS-3).
  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.service) set.add(i.service);
    if (serviceFilter) set.add(serviceFilter);
    return ["", ...Array.from(set).sort()];
  }, [items, serviceFilter]);

  return (
    <DrillContext.Provider value={onDrill}>
      <FreshnessContext.Provider value={freshness}>
        <OrphanDeleteContext.Provider value={setConfirmDelete}>
          <div className="w-full" data-testid="deployments-page">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                Deployments
                <span className="text-[11px] font-normal text-[var(--color-text-muted)]">
                  live · batch · paper (unified) — every VM + Cloud Run job
                </span>
              </h1>
              <div className="flex items-center gap-3">
                <DeploymentsHelpButton />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reconcile}
                  disabled={reconciling || loading}
                  data-testid="reconcile-registry-btn"
                >
                  {reconciling ? "Reconciling…" : "Reconcile Registry"}
                </Button>
                <button
                  onClick={load}
                  disabled={loading}
                  aria-label="Refresh deployments"
                  data-testid="deployments-refresh"
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {reconcileResult && (
              <div className="text-xs text-[var(--color-text-muted)] mb-2" data-testid="reconcile-result">
                Reconciled: reaped {reconcileResult.reaped_count} stale entries ({reconcileResult.total_active_before}{" "}
                active before, {reconcileResult.running_vm_count} VMs running in GCP)
              </div>
            )}
            {reconcileError && (
              <div className="text-[var(--color-error)] text-xs mb-2" data-testid="reconcile-error">
                Reconcile error: {reconcileError}
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">Deployments</CardTitle>
                <div className="pt-2">
                  <DeploymentsSummaryHeader summary={summary} loading={loading && items.length === 0} />
                </div>
                <StrandedCostBadge items={items} />
                {/* Idle-spend rollup cards (Fleet-tab consolidation) — ported verbatim from
                  FleetOrphans.tsx, same GET /api/fleet/orphans data + same estimator. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3" data-testid="deployments-idle-spend-cards">
                  {/* Every card applies status=stopped on click (idle-spend discoverability) — the
                      default status filter is `running`, which otherwise hides these rows entirely. */}
                  <Card
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => setParam("status", "stopped")}
                    role="button"
                    tabIndex={0}
                    title="Show stopped VMs"
                    data-testid="deployments-orphans-card-stopped"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Stopped VMs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                        {orphanData?.stopped_total ?? "—"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => setParam("status", "stopped")}
                    role="button"
                    tabIndex={0}
                    title="Show stopped VMs"
                    data-testid="deployments-orphans-card-reapable"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Reapable</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-amber-400">{orphanData?.reapable_total ?? "—"}</p>
                    </CardContent>
                  </Card>
                  <Card
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => setParam("status", "stopped")}
                    role="button"
                    tabIndex={0}
                    title="Show stopped VMs"
                    data-testid="deployments-orphans-card-idle-usd"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Idle disk $/mo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-[var(--color-text-primary)]">
                        {orphanData ? fmtIdleUsd(orphanData.monthly_idle_usd) : "—"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-secondary)]"
                    onClick={() => setParam("status", "stopped")}
                    role="button"
                    tabIndex={0}
                    title="Show stopped VMs"
                    data-testid="deployments-orphans-card-reclaimable-usd"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Reclaimable $/mo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold text-emerald-400">
                        {orphanData ? fmtIdleUsd(orphanData.monthly_reapable_usd) : "—"}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* Bulk reap — dry-run first, ported from FleetOrphans. */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={previewReap}
                    disabled={reapBusy || !orphanData || orphanData.reapable_total === 0}
                    data-testid="deployments-reap-btn"
                  >
                    Reap {orphanData?.reapable_total ?? 0} reapable
                  </Button>
                  {orphanData ? (
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      estimate — asia-northeast1 list rates; grace {orphanData.grace_hours}h
                    </span>
                  ) : null}
                </div>
                {reapError ? (
                  <div
                    data-testid="deployments-reap-error"
                    className="mt-2 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{reapError}</span>
                  </div>
                ) : null}
                {reapActionMsg ? (
                  <div
                    data-testid="deployments-reap-action-msg"
                    className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
                  >
                    {reapActionMsg}
                  </div>
                ) : null}
                {/* Status-filter chips — quick All / Running / Succeeded / Failed / Stuck toggles. */}
                <div className="pt-3">
                  <StatusFilterChips
                    chips={statusChips(summary)}
                    active={statusFilter}
                    onSelect={(v) => setParam("status", v)}
                  />
                </div>
                {/* Filters — mode / cloud / status / asset_group, URL-param-backed for alert deep-links. */}
                <div className="flex flex-wrap items-center gap-3 pt-3" data-testid="deployment-filters">
                  <DateRangeFilter
                    from={dateFromFilter}
                    to={dateToFilter}
                    onChange={(key, v) => setParam(key, v)}
                    onClear={clearDateRange}
                  />
                  <FilterSelect
                    testId="filter-mode"
                    label="mode"
                    value={modeFilter}
                    onChange={(v) => setParam("umbrella", v)}
                    options={MODE_OPTIONS}
                  />
                  <FilterSelect
                    testId="filter-cloud"
                    label="cloud"
                    value={cloudFilter}
                    onChange={(v) => setParam("cloud", v)}
                    options={[
                      { value: "", label: "all" },
                      { value: "GCP", label: "GCP" },
                      { value: "AWS", label: "AWS" },
                    ]}
                  />
                  <FilterSelect
                    testId="filter-region"
                    label="region"
                    value={regionFilter}
                    onChange={(v) => setParam("region", v)}
                    options={regionOptions}
                  />
                  <FilterSelect
                    testId="filter-status"
                    label="status"
                    value={statusFilter}
                    onChange={(v) => setParam("status", v)}
                    options={[
                      { value: "all", label: "all" },
                      { value: "running", label: "running" },
                      { value: "pending", label: "pending" },
                      { value: "succeeded", label: "succeeded" },
                      { value: "failed", label: "failed" },
                      { value: "stale", label: "stale" },
                      { value: "stopped", label: "stopped" },
                      { value: "unknown", label: "unknown" },
                    ]}
                  />
                  <FilterSelect
                    testId="filter-asset-group"
                    label="asset group"
                    value={assetGroupFilter}
                    onChange={(v) => setParam("asset_group", v)}
                    options={assetGroupOptions.map((ag) => ({ value: ag, label: ag || "all" }))}
                  />
                  <FilterSelect
                    testId="filter-service"
                    label="service"
                    value={serviceFilter}
                    onChange={(v) => setParam("service", v)}
                    options={serviceOptions.map((s) => ({ value: s, label: s || "all" }))}
                  />
                  <KindFilterChips selected={kindFilters} onToggle={toggleKind} />
                  <FilterSelect
                    testId="filter-launched-by"
                    label="launched by"
                    value={launchedByFilter}
                    onChange={(v) => setParam("launched_by", v)}
                    options={[
                      { value: "", label: "all" },
                      { value: "adhoc", label: "adhoc (unmanaged)" },
                      { value: "deployment-api", label: "deployment-api" },
                      { value: "control-plane", label: "control-plane" },
                      { value: "unknown", label: "unknown" },
                    ]}
                  />
                  <TargetSearchBox value={searchInput} onChange={setSearchInput} onClear={clearSearch} />
                </div>
              </CardHeader>
              <CardContent>
                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-sm text-red-400 py-2"
                    data-testid="deployments-error"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {/* Out-of-range archive floor (decision 5) — the requested date_from predates the real
                  30-day retention window; say so explicitly rather than silently returning a
                  clipped/partial result the operator would otherwise mistake for "nothing ran". */}
                {!error && dateRangeOutOfRange && archiveFloor && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 text-sm text-amber-400 py-2"
                    data-testid="deployments-date-range-out-of-range"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      No data before {archiveFloor} — the archive only retains 30 days; results below are clipped to
                      that floor.
                    </span>
                  </div>
                )}
                {!error && loading && items.length === 0 && <DeploymentMatrixSkeleton />}
                {!error && !(loading && items.length === 0) && (
                  <DeploymentMatrix
                    items={items.filter((i) => {
                      const searchQuery = searchInput.trim().toLowerCase();
                      return (
                        (kindFilters.size === 0 || kindFilters.has(i.kind)) &&
                        (!launchedByFilter || (i.launched_by ?? "unknown") === launchedByFilter) &&
                        (!serviceFilter || i.service === serviceFilter) &&
                        (!searchQuery || i.name.toLowerCase().includes(searchQuery))
                      );
                    })}
                    dateFiltered={Boolean(dateFromFilter || dateToFilter)}
                  />
                )}
              </CardContent>
            </Card>

            {/* Bulk-reap confirm dialog (populated from the dry-run preview) — ported from FleetOrphans. */}
            <Dialog open={confirmReap !== null} onClose={() => setConfirmReap(null)}>
              <DialogContent>
                <div data-testid="deployments-reap-dialog">
                  <DialogHeader>
                    <DialogTitle>Reap {confirmReap?.candidate_total ?? 0} abandoned VM(s)?</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Deletes each instance + its boot disk (~
                    {fmtIdleUsd(confirmReap?.results.reduce((a, r) => a + r.monthly_disk_usd, 0) ?? 0)}
                    /mo). Only ephemeral VMs stopped past the grace window are included; this cannot be undone.
                  </p>
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs font-mono">
                    {(confirmReap?.results ?? []).map((r) => (
                      <li key={r.name}>
                        {r.name}{" "}
                        <span className="text-[var(--color-text-tertiary)]">({fmtIdleUsd(r.monthly_disk_usd)}/mo)</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmReap(null)} disabled={reapBusy}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={executeReap}
                      disabled={reapBusy}
                      data-testid="deployments-reap-confirm"
                    >
                      Reap
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Per-instance delete confirm dialog — ported from FleetOrphans. */}
            <Dialog open={confirmDelete !== null} onClose={() => setConfirmDelete(null)}>
              <DialogContent>
                <div data-testid="deployments-delete-dialog">
                  <DialogHeader>
                    <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
                  </DialogHeader>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Deletes this stopped instance and its boot disk (~
                    {fmtIdleUsd(confirmDelete?.monthly_disk_usd ?? 0)}/mo). This cannot be undone.
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)} disabled={reapBusy}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={executeDelete}
                      disabled={reapBusy}
                      data-testid="deployments-delete-confirm"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </OrphanDeleteContext.Provider>
      </FreshnessContext.Provider>
    </DrillContext.Provider>
  );
}

/**
 * DeploymentsPage — the canonical `/deployments` route (2026-07-17: the sole Deployments
 * surface, replacing the old cockpit `?tab=deployments` pane). A `<main>` shell around the
 * URL-backed {@link DeploymentsContent}, plus:
 *   - the Live-ops fold (running services + event/log stream), formerly the deleted
 *     `/ops/live-deployments` standalone; and
 *   - the in-context drill-down slide-over: a row sets `?detail=<name>` and the per-target
 *     {@link DeploymentDetail} opens over the list (deep-linkable), while `/deployments/:name`
 *     remains the full-page detail (Alerts deep-links to it).
 */
export function DeploymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const detail = searchParams.get("detail");
  const openDetail = useCallback(
    (name: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("detail", name);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );
  const closeDetail = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("detail");
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams]);

  return (
    <main className="w-full app-shell-gutter py-4">
      <div data-testid="cockpit-deployments">
        {/* MERGED live/batch/paper — one flat all-modes inventory (Mode is a filter). */}
        <DeploymentsContent onDrill={openDetail} />
        {/* Live ops — running services + event/log stream (folded in from the deleted
            /ops/live-deployments standalone, 2026-07-17). */}
        <div className="mt-6" data-testid="cockpit-live-ops">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            Live ops — running services + event/log stream
          </h2>
          <ErrorBoundary fallbackTitle="Live ops failed to load">
            <LiveDeploymentsContent />
          </ErrorBoundary>
        </div>
      </div>

      {/* In-context drill-down slide-over — a row's per-target detail opens here (URL-driven
          via ?detail=, so it is deep-linkable) instead of navigating to /deployments/:name. */}
      {detail ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          data-testid="cockpit-detail-overlay"
          onClick={closeDetail}
        >
          <div
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-4 shadow-xl"
            data-testid="cockpit-detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                Deployment detail
              </span>
              <button
                type="button"
                onClick={closeDetail}
                data-testid="cockpit-detail-close"
                className="rounded-md border border-[var(--color-border-default)] px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                Close ✕
              </button>
            </div>
            <DeploymentDetail name={detail} embedded />
          </div>
        </div>
      ) : null}
    </main>
  );
}
