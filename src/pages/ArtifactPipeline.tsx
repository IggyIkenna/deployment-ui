/**
 * /ops/artifacts — the build → artifact → deploy estate, end-to-end.
 *
 * All five views (What's running · Deploy timeline · Pipeline · Artifacts · Health) are live,
 * mirroring the frozen design mock at `public/design-mocks/artifact-pipeline.html`. GCP is the
 * active production estate; AWS is intentionally parked (no credits) — its rows, when they arrive,
 * are parked-not-broken. **What's running** is scoped to the Cloud Run (image) lane this pass — the
 * VM tarball lane's git commit isn't stamped yet (see the Health tab's own condition for why).
 *
 * Deliberately self-contained (mirroring CostObservability): plain fetch + useState/useEffect with a
 * request-id guard per view, small inline primitives styled off the app's CSS custom-property tokens,
 * and the same native `<input type="date">` range picker (operator ask 2026-07-23).
 *
 * No page title/banner (operator ask 2026-07-23) — the header row is just the tab bar (left) and the
 * window/date-range/refresh/help controls (right); the page description + GCP-active/AWS-parked
 * framing that used to sit there now lives entirely in the help dialog.
 *
 * Every live table's columns are sortable (click a header) and most are filterable (the funnel icon —
 * a multi-select checklist for enum-shaped columns, a substring box for free-text ones); **Repo**
 * (Pipeline, Artifacts), **Workload/Service** (Deploy timeline, What's running), and **Area** (Health)
 * get the multi-select explicitly (operator ask 2026-07-23) so several values can be isolated at
 * once. Column sort/filter is client-side over the already-loaded data, same as the existing pill
 * filters — no new fetch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, HelpCircle, RefreshCw } from "lucide-react";

import {
  getArtifactBuilds,
  getArtifactDeploys,
  getArtifactHealth,
  getArtifactImages,
  getArtifactRunning,
  type BuildRow,
  type BuildsResponse,
  type DeployRow,
  type DeploysResponse,
  type HealthCondition,
  type HealthResponse,
  type ImageRow,
  type ImagesResponse,
  type RunningGroup,
  type RunningResponse,
  type RunningVersion,
} from "../api/deploymentApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

// ── tabs ────────────────────────────────────────────────────────────────────────────────────────
type TabId = "run" | "deploy" | "pipe" | "art" | "health";

const TABS: readonly { id: TabId; label: string; hint: string }[] = [
  { id: "run", label: "What's running", hint: "join + drift" },
  { id: "deploy", label: "Deploy timeline", hint: "revisions" },
  { id: "pipe", label: "Pipeline", hint: "builds" },
  { id: "art", label: "Artifacts", hint: "registries" },
  { id: "health", label: "Health", hint: "conditions" },
];

// ── window presets + explicit date range (mirrors CostObservability's DateRangePicker) ─────────────
const WINDOWS: readonly { days: number; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 14, label: "14d" },
  { days: 30, label: "30d" },
];

// Longest selectable span — mirrors the API's own 366-day cap (routes/artifacts.py MAX_RANGE_DAYS),
// so the picker can't offer a range the backend will 400 on.
const MAX_RANGE_DAYS = 366;

interface ArtifactDateRange {
  start: string;
  end: string;
}

/** Local-calendar ISO `YYYY-MM-DD` — `toISOString()` would shift the day for anyone behind UTC. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoToday(): string {
  return isoDay(new Date());
}
function isoDaysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

// ── pipeline row filter ─────────────────────────────────────────────────────────────────────────
type PipeFilter = "all" | "fail" | "image" | "tarball" | "gcp" | "aws";

const PIPE_FILTERS: readonly { id: PipeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fail", label: "Failed only" },
  { id: "image", label: "Image lane" },
  { id: "tarball", label: "Tarball lane" },
  { id: "gcp", label: "GCP" },
  { id: "aws", label: "AWS" },
];

function matchesFilter(row: BuildRow, filter: PipeFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "fail":
      return row.status === "FAILURE";
    case "image":
      return row.lane === "image";
    case "tarball":
      return row.lane === "tarball";
    case "gcp":
      return row.cloud === "gcp";
    case "aws":
      return row.cloud === "aws";
  }
}

// ── deploy timeline row filter ──────────────────────────────────────────────────────────────────
type DeployFilter = "all" | "code" | "live" | "fail";

const DEPLOY_FILTERS: readonly { id: DeployFilter; label: string }[] = [
  { id: "all", label: "All deploys" },
  { id: "code", label: "New code only" },
  { id: "live", label: "Live now" },
  { id: "fail", label: "Failed / paused" },
];

function matchesDeployFilter(row: DeployRow, filter: DeployFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "code":
      return row.change_type !== "config";
    case "live":
      return row.live;
    case "fail":
      return row.change_type === "failed";
  }
}

function changeColor(change: string): string {
  if (change === "new") return "var(--color-accent-blue)";
  if (change === "config") return "var(--color-text-tertiary)";
  if (change === "rollback") return "var(--color-accent-amber)";
  if (change === "failed") return "var(--color-accent-red)";
  return "var(--color-text-secondary)";
}

function changeLabel(change: string): string {
  if (change === "config") return "config-only";
  return change;
}

// ── column sort + per-column filter (both tables — client-side over the loaded window) ────────────
type SortDir = "asc" | "desc";
interface ColumnSort {
  key: string;
  dir: SortDir;
}

/** asc → desc → cleared, mirroring the common three-state header-click convention. */
function toggleColumnSort(current: ColumnSort | null, key: string): ColumnSort | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** "2h36m" / "9m02s" / "41s" → seconds; "" (unknown) sorts first. */
function parseDurationToSeconds(text: string): number {
  if (!text) return -1;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text.trim());
  if (!m) return -1;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = m[2] ? Number(m[2]) : 0;
  const seconds = m[3] ? Number(m[3]) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v !== ""))).sort((a, b) => a.localeCompare(b));
}

interface PipeColumnFilters {
  repo: Set<string>;
  lane: Set<string>;
  cloud: Set<string>;
  status: Set<string>;
  branch: Set<string>;
  trigger: string;
  sha: string;
  produced: string;
  failure: string;
}

const EMPTY_PIPE_COLUMN_FILTERS: PipeColumnFilters = {
  repo: new Set(),
  lane: new Set(),
  cloud: new Set(),
  status: new Set(),
  branch: new Set(),
  trigger: "",
  sha: "",
  produced: "",
  failure: "",
};

function matchesPipeColumnFilters(row: BuildRow, f: PipeColumnFilters): boolean {
  if (f.repo.size > 0 && !f.repo.has(row.repo)) return false;
  if (f.lane.size > 0 && !f.lane.has(row.lane)) return false;
  if (f.cloud.size > 0 && !f.cloud.has(row.cloud)) return false;
  if (f.status.size > 0 && !f.status.has(row.status)) return false;
  if (f.branch.size > 0 && !f.branch.has(row.branch)) return false;
  if (f.trigger && !row.trigger.toLowerCase().includes(f.trigger.toLowerCase())) return false;
  if (f.sha && !row.sha.toLowerCase().includes(f.sha.toLowerCase())) return false;
  if (f.produced && !row.produced.toLowerCase().includes(f.produced.toLowerCase())) return false;
  if (f.failure && !row.failure.toLowerCase().includes(f.failure.toLowerCase())) return false;
  return true;
}

function pipeSortValue(row: BuildRow, key: string): string | number {
  switch (key) {
    case "repo":
      return row.repo;
    case "lane":
      return row.lane;
    case "cloud":
      return row.cloud;
    case "status":
      return row.status;
    case "trigger":
      return row.trigger;
    case "sha":
      return row.sha;
    case "branch":
      return row.branch;
    case "started_at":
      return row.started_at ? new Date(row.started_at).getTime() : -1;
    case "duration":
      return parseDurationToSeconds(row.duration);
    case "produced":
      return row.produced;
    default:
      return "";
  }
}

interface DeployColumnFilters {
  workload: Set<string>;
  cloud: Set<string>;
  change: Set<string>;
  deployer: Set<string>;
  revision: string;
  digest: string;
}

const EMPTY_DEPLOY_COLUMN_FILTERS: DeployColumnFilters = {
  workload: new Set(),
  cloud: new Set(),
  change: new Set(),
  deployer: new Set(),
  revision: "",
  digest: "",
};

function matchesDeployColumnFilters(row: DeployRow, f: DeployColumnFilters): boolean {
  if (f.workload.size > 0 && !f.workload.has(row.workload)) return false;
  if (f.cloud.size > 0 && !f.cloud.has(row.cloud)) return false;
  if (f.change.size > 0 && !f.change.has(row.change_type)) return false;
  if (f.deployer.size > 0 && !f.deployer.has(row.deployer)) return false;
  if (f.revision && !row.revision.toLowerCase().includes(f.revision.toLowerCase())) return false;
  if (f.digest && !row.digest.toLowerCase().includes(f.digest.toLowerCase())) return false;
  return true;
}

function deploySortValue(row: DeployRow, key: string): string | number {
  switch (key) {
    case "workload":
      return row.workload;
    case "revision":
      return row.revision;
    case "cloud":
      return row.cloud;
    case "change_type":
      return row.change_type;
    case "digest":
      return row.digest;
    case "at":
      return row.at ? new Date(row.at).getTime() : -1;
    case "deployer":
      return row.deployer;
    default:
      return "";
  }
}

// ── images (Artifacts tab) row filter + column filters + sort ──────────────────────────────────────
type ImagesFilter = "all" | "running" | "legacy" | "parked" | "gcp" | "aws";

const IMAGES_FILTERS: readonly { id: ImagesFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "legacy", label: "Legacy (GC candidate)" },
  { id: "parked", label: "Parked" },
  { id: "gcp", label: "GCP" },
  { id: "aws", label: "AWS" },
];

function matchesImagesFilter(row: ImageRow, filter: ImagesFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return row.state === "running";
    case "legacy":
      return row.state === "legacy";
    case "parked":
      return row.state === "parked" || row.state === "paused" || row.state === "zeroed";
    case "gcp":
      return row.cloud === "gcp";
    case "aws":
      return row.cloud === "aws";
  }
}

interface ImagesColumnFilters {
  repo: Set<string>;
  cloud: Set<string>;
  registry: Set<string>;
  state: Set<string>;
  tags: string;
  runningOn: string;
}

const EMPTY_IMAGES_COLUMN_FILTERS: ImagesColumnFilters = {
  repo: new Set(),
  cloud: new Set(),
  registry: new Set(),
  state: new Set(),
  tags: "",
  runningOn: "",
};

function matchesImagesColumnFilters(row: ImageRow, f: ImagesColumnFilters): boolean {
  if (f.repo.size > 0 && !f.repo.has(row.repo)) return false;
  if (f.cloud.size > 0 && !f.cloud.has(row.cloud)) return false;
  if (f.registry.size > 0 && !f.registry.has(row.registry)) return false;
  if (f.state.size > 0 && !f.state.has(row.state)) return false;
  if (f.tags && !row.tags.some((t) => t.toLowerCase().includes(f.tags.toLowerCase()))) return false;
  if (f.runningOn && !row.running_on.toLowerCase().includes(f.runningOn.toLowerCase())) return false;
  return true;
}

function imageSortValue(row: ImageRow, key: string): string | number {
  switch (key) {
    case "repo":
      return row.repo;
    case "cloud":
      return row.cloud;
    case "registry":
      return row.registry;
    case "image_count":
      return row.image_count;
    case "last_pushed":
      return row.last_pushed ? new Date(row.last_pushed).getTime() : -1;
    case "running_on":
      return row.running_on;
    case "state":
      return row.state;
    case "size_bytes":
      return row.size_bytes ?? -1;
    default:
      return "";
  }
}

function fmtBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function imageStateColor(state: string): string {
  if (state === "running") return "var(--color-accent-green)";
  if (state === "legacy") return "var(--color-accent-red)";
  if (state === "parked" || state === "paused" || state === "zeroed") return "var(--color-accent-blue)";
  if (state === "empty") return "var(--color-text-tertiary)";
  return "var(--color-text-secondary)"; // active
}

// ── running (What's running tab) row filter + column filters + sort ────────────────────────────────
/** One table row = one live version — flattened from `RunningGroup.versions` (today always length 1;
 * the shape supports a future fragmented service showing >1 row under the same service name). */
interface RunningTableRow {
  service: string;
  lane: string;
  cloud: string;
  fragmented: boolean;
  version: RunningVersion;
}

function flattenRunning(groups: RunningGroup[]): RunningTableRow[] {
  return groups.flatMap((g) =>
    g.versions.map((v) => ({ service: g.service, lane: g.lane, cloud: g.cloud, fragmented: g.fragmented, version: v })),
  );
}

type RunningFilter = "all" | "floating" | "hand" | "unknown" | "fragmented";

const RUNNING_FILTERS: readonly { id: RunningFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "floating", label: "Floating :latest" },
  { id: "hand", label: "Hand-deployed" },
  { id: "unknown", label: "Unknown" },
  { id: "fragmented", label: "Fragmented" },
];

function matchesRunningFilter(row: RunningTableRow, filter: RunningFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "floating":
      return row.version.drift.includes("floating");
    case "hand":
      return row.version.drift.includes("hand");
    case "unknown":
      return row.version.drift.includes("unknown");
    case "fragmented":
      return row.fragmented;
  }
}

interface RunningColumnFilters {
  service: Set<string>;
  cloud: Set<string>;
  drift: Set<string>;
  digest: string;
  builtFrom: string;
}

const EMPTY_RUNNING_COLUMN_FILTERS: RunningColumnFilters = {
  service: new Set(),
  cloud: new Set(),
  drift: new Set(),
  digest: "",
  builtFrom: "",
};

function matchesRunningColumnFilters(row: RunningTableRow, f: RunningColumnFilters): boolean {
  if (f.service.size > 0 && !f.service.has(row.service)) return false;
  if (f.cloud.size > 0 && !f.cloud.has(row.cloud)) return false;
  if (f.drift.size > 0 && !row.version.drift.some((d) => f.drift.has(d))) return false;
  if (f.digest && !row.version.digest.toLowerCase().includes(f.digest.toLowerCase())) return false;
  if (f.builtFrom && !row.version.built_from.toLowerCase().includes(f.builtFrom.toLowerCase())) return false;
  return true;
}

function runningSortValue(row: RunningTableRow, key: string): string | number {
  switch (key) {
    case "service":
      return row.service;
    case "cloud":
      return row.cloud;
    case "version":
      return row.version.version;
    case "digest":
      return row.version.digest;
    case "built_from":
      return row.version.built_from;
    default:
      return "";
  }
}

function driftColor(d: string): string {
  if (d === "ok" || d === "pinned") return "var(--color-accent-green)";
  if (d === "stale") return "var(--color-accent-amber)";
  if (d === "floating" || d === "hand" || d === "fake") return "var(--color-accent-red)";
  return "var(--color-text-tertiary)"; // unknown
}

function driftLabel(d: string): string {
  return d === "ok" ? "traceable" : d;
}

// ── health tab row filter + column filters + sort ──────────────────────────────────────────────────
type HealthFilter = "all" | "high" | "med" | "low" | "deferred";

const HEALTH_FILTERS: readonly { id: HealthFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High" },
  { id: "med", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "deferred", label: "Deferred" },
];

function matchesHealthFilter(row: HealthCondition, filter: HealthFilter): boolean {
  if (filter === "all") return true;
  return row.severity === filter;
}

interface HealthColumnFilters {
  area: Set<string>;
  tab: Set<string>;
  severity: Set<string>;
  condition: string;
}

const EMPTY_HEALTH_COLUMN_FILTERS: HealthColumnFilters = {
  area: new Set(),
  tab: new Set(),
  severity: new Set(),
  condition: "",
};

function matchesHealthColumnFilters(row: HealthCondition, f: HealthColumnFilters): boolean {
  if (f.area.size > 0 && !f.area.has(row.area)) return false;
  if (f.tab.size > 0 && !f.tab.has(row.tab)) return false;
  if (f.severity.size > 0 && !f.severity.has(row.severity)) return false;
  if (f.condition && !row.condition.toLowerCase().includes(f.condition.toLowerCase())) return false;
  return true;
}

const SEVERITY_RANK: Record<string, number> = { high: 3, med: 2, low: 1, deferred: 0 };

function healthSortValue(row: HealthCondition, key: string): string | number {
  switch (key) {
    case "condition":
      return row.condition;
    case "severity":
      return SEVERITY_RANK[row.severity] ?? -1;
    case "area":
      return row.area;
    case "tab":
      return row.tab;
    case "count":
      return row.count;
    default:
      return "";
  }
}

function severityColor(s: string): string {
  if (s === "high") return "var(--color-accent-red)";
  if (s === "med") return "var(--color-accent-amber)";
  if (s === "low") return "var(--color-text-secondary)";
  return "var(--color-text-tertiary)"; // deferred
}

// ── formatting helpers ──────────────────────────────────────────────────────────────────────────
function fmtDurationSec(seconds: number | null): string {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

/** ISO → "MM-DD HH:MM" (UTC) for the compact "Started"/"When" cell; "" stays "". */
function fmtStarted(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function statusColor(status: string): string {
  if (status === "SUCCESS") return "var(--color-accent-green)";
  if (status === "FAILURE") return "var(--color-accent-red)";
  return "var(--color-text-tertiary)";
}

// ── inline primitives (tokens, not a shared kit — mirrors CostObservability) ──────────────────────
function StatTile({
  label,
  value,
  sub,
  color,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border p-3"
      style={{
        borderColor: "var(--color-border-default)",
        background: "var(--color-bg-secondary)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums" style={color ? { color } : undefined} data-testid={testId}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        {sub}
      </div>
    </div>
  );
}

type PillTone = "cyan" | "amber" | "green" | "red" | "grey" | "blue";

const PILL_COLOR: Record<PillTone, string> = {
  cyan: "var(--color-accent-blue)",
  blue: "var(--color-accent-blue)",
  amber: "var(--color-accent-amber)",
  green: "var(--color-accent-green)",
  red: "var(--color-accent-red)",
  grey: "var(--color-text-tertiary)",
};

function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  const color = PILL_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium"
      style={{ color, border: `1px solid ${color}`, background: "transparent" }}
    >
      {children}
    </span>
  );
}

/** A header's funnel icon + checklist popover — a multi-select filter for an enum-shaped column
 * (Repo / Workload get this explicitly per operator ask 2026-07-23; other bounded columns reuse it
 * for consistency). Options come from the whole loaded window, not the already-filtered rows, so
 * picking one filter never hides the others' options. */
function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  testId,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Filter by ${label}`}
        className="inline-flex items-center rounded p-0.5"
        style={{ color: selected.size > 0 ? "var(--color-accent-blue)" : "var(--color-text-tertiary)" }}
      >
        <Filter className="h-2.5 w-2.5" />
        {selected.size > 0 && <span className="ml-0.5 text-[9px] tabular-nums">{selected.size}</span>}
      </button>
      {open && (
        <div
          data-testid={`${testId}-menu`}
          className="absolute left-0 top-full z-30 mt-1 max-h-60 w-52 overflow-y-auto rounded-md border p-1.5 shadow-lg"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-secondary)" }}
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--color-text-tertiary)" }}>
              {label}
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                data-testid={`${testId}-clear`}
                onClick={() => onChange(new Set())}
                className="text-[10px] underline"
                style={{ color: "var(--color-accent-blue)" }}
              >
                Clear
              </button>
            )}
          </div>
          {options.length === 0 && (
            <div className="px-1 py-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              No values in window
            </div>
          )}
          {options.map((opt) => {
            const checked = selected.has(opt);
            return (
              <label
                key={opt}
                data-testid={`${testId}-opt-${opt}`}
                className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-normal normal-case hover:bg-[var(--color-bg-tertiary,var(--color-bg-primary))]"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (checked) next.delete(opt);
                    else next.add(opt);
                    onChange(next);
                  }}
                />
                <span className="truncate">{opt}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A compact substring-search box for a free-text column's header. */
function TextFilterInput({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className="h-[16px] w-[64px] rounded border px-1 text-[9.5px] font-normal normal-case outline-none"
      style={{
        borderColor: value ? "var(--color-accent-blue)" : "var(--color-border-default)",
        background: "transparent",
        color: "var(--color-text-primary)",
      }}
    />
  );
}

/** One `<th>`: an optional click-to-sort label (▲/▼/↕) plus an optional filter control underneath —
 * shared by both live tables so every column's sort/filter chrome looks and behaves identically. */
function ColumnHeader({
  label,
  sortKey,
  sort,
  onSort,
  filterNode,
  testId,
}: {
  label: string;
  sortKey?: string;
  sort?: ColumnSort | null;
  onSort?: (key: string) => void;
  filterNode?: React.ReactNode;
  testId: string;
}) {
  const active = sortKey != null && sort?.key === sortKey;
  return (
    <th className="px-2.5 py-2 align-top font-medium" data-testid={testId}>
      <div className="flex items-center gap-1 whitespace-nowrap">
        {sortKey && onSort ? (
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            data-testid={`${testId}-sort`}
            className="inline-flex items-center gap-1"
          >
            {label}
            <span
              className="text-[9px]"
              style={{ color: active ? "var(--color-accent-blue)" : "var(--color-text-tertiary)" }}
            >
              {active ? (sort?.dir === "asc" ? "▲" : "▼") : "↕"}
            </span>
          </button>
        ) : (
          <span>{label}</span>
        )}
        {filterNode}
      </div>
    </th>
  );
}

/** Two native `<input type="date">`s, mirroring CostObservability's DateRangePicker exactly: the
 * `min`/`max` attributes make the ranges the API rejects (inverted, >366d, ending in the future)
 * unreachable from the UI rather than merely error-handled. */
function DateRangePicker({ range, onCommit }: { range: ArtifactDateRange; onCommit: (r: ArtifactDateRange) => void }) {
  const today = isoToday();
  const earliestStart = isoDaysBefore(range.end, MAX_RANGE_DAYS - 1);
  const latestEnd = (() => {
    const cap = isoDaysBefore(today, 0);
    const spanCap = isoDaysBefore(range.start, -(MAX_RANGE_DAYS - 1));
    return spanCap < cap ? spanCap : cap;
  })();

  const field = "h-[26px] rounded-md border px-1.5 font-mono text-[12px] leading-none outline-none transition-colors";
  const fieldStyle = {
    borderColor: "var(--color-border-default)",
    background: "var(--color-bg-tertiary, var(--color-bg-secondary))",
    color: "var(--color-text-primary)",
  };

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="artifact-date-range">
      <input
        type="date"
        aria-label="Range start date"
        data-testid="artifact-range-start"
        value={range.start}
        min={earliestStart}
        max={range.end}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v <= range.end && v >= earliestStart) onCommit({ ...range, start: v });
        }}
        className={field}
        style={fieldStyle}
      />
      <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
        →
      </span>
      <input
        type="date"
        aria-label="Range end date"
        data-testid="artifact-range-end"
        value={range.end}
        min={range.start}
        max={latestEnd}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v >= range.start && v <= latestEnd) onCommit({ ...range, end: v });
        }}
        className={field}
        style={fieldStyle}
      />
    </div>
  );
}

// ── the live Pipeline (builds) view ───────────────────────────────────────────────────────────────
function PipelineView({
  data,
  filter,
  onFilter,
}: {
  data: BuildsResponse;
  filter: PipeFilter;
  onFilter: (f: PipeFilter) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [sort, setSort] = useState<ColumnSort | null>(null);
  const onSort = (key: string) => setSort((s) => toggleColumnSort(s, key));
  const [colFilters, setColFilters] = useState<PipeColumnFilters>(EMPTY_PIPE_COLUMN_FILTERS);

  // Options are drawn from the whole loaded window, never the already-filtered rows, so checking one
  // box never hides the rest of a column's own values.
  const repoOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.repo)), [data.rows]);
  const laneOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.lane)), [data.rows]);
  const cloudOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.cloud)), [data.rows]);
  const statusOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.status)), [data.rows]);
  const branchOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.branch)), [data.rows]);

  const activeColFilterCount =
    colFilters.repo.size +
    colFilters.lane.size +
    colFilters.cloud.size +
    colFilters.status.size +
    colFilters.branch.size +
    (colFilters.trigger ? 1 : 0) +
    (colFilters.sha ? 1 : 0) +
    (colFilters.produced ? 1 : 0) +
    (colFilters.failure ? 1 : 0);

  const rows = useMemo(() => {
    let out = data.rows.filter((r) => matchesFilter(r, filter) && matchesPipeColumnFilters(r, colFilters));
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const cmp = compareSortValues(pipeSortValue(a, key), pipeSortValue(b, key));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [data.rows, filter, colFilters, sort]);
  const s = data.stats;

  return (
    <section data-testid="artifact-pipe-view">
      {/* stat band — computed by the backend over the whole window, never the filtered subset */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Builds in window"
          value={String(s.total)}
          sub="both clouds · both lanes"
          testId="pipe-stat-total"
        />
        <StatTile
          label="Success rate"
          value={`${s.success_rate}%`}
          sub="of completed builds"
          color="var(--color-accent-green)"
          testId="pipe-stat-success"
        />
        <StatTile
          label="Failed"
          value={String(s.failed)}
          sub="click a row for why"
          color="var(--color-accent-red)"
          testId="pipe-stat-failed"
        />
        <StatTile
          label="Median duration"
          value={fmtDurationSec(s.median_duration_sec)}
          sub="build wall-clock"
          testId="pipe-stat-median"
        />
        <StatTile
          label="Wasted (dup SHA)"
          value={String(s.wasted_dup)}
          sub="same commit built 2×"
          color="var(--color-accent-amber)"
          testId="pipe-stat-wasted"
        />
      </div>

      {/* filter bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {PIPE_FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`pipe-filter-${f.id}`}
                onClick={() => onFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                style={{
                  background: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? undefined : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Pill tone="cyan">⇄ both lanes</Pill> = one commit built as image and tarball · <Pill tone="amber">dup</Pill>{" "}
          = same commit built twice · click a row for the step timeline · click a column header to sort, the funnel to
          filter it
        </span>
        {(activeColFilterCount > 0 || sort) && (
          <button
            type="button"
            data-testid="pipe-colfilters-clear"
            onClick={() => {
              setColFilters(EMPTY_PIPE_COLUMN_FILTERS);
              setSort(null);
            }}
            className="text-[11px] underline"
            style={{ color: "var(--color-accent-blue)" }}
          >
            Clear column filters/sort
          </button>
        )}
      </div>

      {/* table */}
      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              <ColumnHeader
                label="Repo"
                sortKey="repo"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-repo"
                filterNode={
                  <MultiSelectFilter
                    label="Repo"
                    options={repoOptions}
                    selected={colFilters.repo}
                    onChange={(v) => setColFilters((f) => ({ ...f, repo: v }))}
                    testId="pipe-filter-repo"
                  />
                }
              />
              <ColumnHeader
                label="Lane"
                sortKey="lane"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-lane"
                filterNode={
                  <MultiSelectFilter
                    label="Lane"
                    options={laneOptions}
                    selected={colFilters.lane}
                    onChange={(v) => setColFilters((f) => ({ ...f, lane: v }))}
                    testId="pipe-filter-lane-col"
                  />
                }
              />
              <ColumnHeader
                label="Cloud"
                sortKey="cloud"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-cloud"
                filterNode={
                  <MultiSelectFilter
                    label="Cloud"
                    options={cloudOptions}
                    selected={colFilters.cloud}
                    onChange={(v) => setColFilters((f) => ({ ...f, cloud: v }))}
                    testId="pipe-filter-cloud-col"
                  />
                }
              />
              <ColumnHeader
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-status"
                filterNode={
                  <MultiSelectFilter
                    label="Status"
                    options={statusOptions}
                    selected={colFilters.status}
                    onChange={(v) => setColFilters((f) => ({ ...f, status: v }))}
                    testId="pipe-filter-status-col"
                  />
                }
              />
              <ColumnHeader
                label="Triggered by"
                sortKey="trigger"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-trigger"
                filterNode={
                  <TextFilterInput
                    value={colFilters.trigger}
                    onChange={(v) => setColFilters((f) => ({ ...f, trigger: v }))}
                    placeholder="search…"
                    testId="pipe-filter-trigger"
                  />
                }
              />
              <ColumnHeader
                label="Commit"
                sortKey="sha"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-sha"
                filterNode={
                  <TextFilterInput
                    value={colFilters.sha}
                    onChange={(v) => setColFilters((f) => ({ ...f, sha: v }))}
                    placeholder="sha…"
                    testId="pipe-filter-sha"
                  />
                }
              />
              <ColumnHeader
                label="Branch"
                sortKey="branch"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-branch"
                filterNode={
                  <MultiSelectFilter
                    label="Branch"
                    options={branchOptions}
                    selected={colFilters.branch}
                    onChange={(v) => setColFilters((f) => ({ ...f, branch: v }))}
                    testId="pipe-filter-branch-col"
                  />
                }
              />
              <ColumnHeader label="Started" sortKey="started_at" sort={sort} onSort={onSort} testId="pipe-th-started" />
              <ColumnHeader label="Took" sortKey="duration" sort={sort} onSort={onSort} testId="pipe-th-duration" />
              <ColumnHeader
                label="Produced"
                sortKey="produced"
                sort={sort}
                onSort={onSort}
                testId="pipe-th-produced"
                filterNode={
                  <TextFilterInput
                    value={colFilters.produced}
                    onChange={(v) => setColFilters((f) => ({ ...f, produced: v }))}
                    placeholder="image…"
                    testId="pipe-filter-produced"
                  />
                }
              />
              <ColumnHeader
                label="Why it failed"
                testId="pipe-th-failure"
                filterNode={
                  <TextFilterInput
                    value={colFilters.failure}
                    onChange={(v) => setColFilters((f) => ({ ...f, failure: v }))}
                    placeholder="search…"
                    testId="pipe-filter-failure"
                  />
                }
              />
              <th className="px-2.5 py-2" data-testid="pipe-th-expand" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-2.5 py-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No builds match this filter in the selected window.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const isOpen = expanded.has(r.build_id);
              return <PipeRow key={r.build_id} row={r} isOpen={isOpen} onToggle={() => toggle(r.build_id)} />;
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
        Live from Cloud Build. Both clouds carry a structured failure reason (GCP{" "}
        <code>failureInfo{"{type,detail}"}</code>, AWS <code>phases[].contexts[]</code>); this page is the queryable
        store that never existed — you can finally ask "show me every failure this week." Window{" "}
        <code>
          {data.start_date} → {data.end_date}
        </code>
        .
      </p>
    </section>
  );
}

function PipeRow({ row, isOpen, onToggle }: { row: BuildRow; isOpen: boolean; onToggle: () => void }) {
  const cellBorder = { borderTop: "1px solid var(--color-border-default)" };
  return (
    <>
      <tr
        className="cursor-pointer align-top hover:bg-[var(--color-bg-secondary)]"
        onClick={onToggle}
        data-testid="pipe-row"
      >
        <td className="px-2.5 py-2 font-medium" style={cellBorder}>
          {row.repo || "—"}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2" style={cellBorder}>
          <span className="flex items-center gap-1">
            {row.lane}
            {row.cross_lane && <Pill tone="cyan">⇄</Pill>}
          </span>
        </td>
        <td className="px-2.5 py-2 uppercase" style={{ ...cellBorder, color: "var(--color-text-secondary)" }}>
          {row.cloud}
        </td>
        <td
          className="whitespace-nowrap px-2.5 py-2 font-medium"
          style={{ ...cellBorder, color: statusColor(row.status) }}
        >
          {row.status}
        </td>
        <td className="max-w-[160px] truncate px-2.5 py-2" style={cellBorder} title={row.trigger}>
          {row.trigger || "—"}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 font-mono" style={cellBorder}>
          <span className="flex items-center gap-1">
            {row.sha || "—"}
            {row.dup && <Pill tone="amber">dup</Pill>}
          </span>
        </td>
        <td className="whitespace-nowrap px-2.5 py-2" style={cellBorder}>
          {row.branch || "—"}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
          {fmtStarted(row.started_at)}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
          {row.duration || "—"}
        </td>
        <td
          className="max-w-[180px] truncate px-2.5 py-2 font-mono text-[11px]"
          style={cellBorder}
          title={row.produced}
        >
          {row.produced ? row.produced.split("/").pop() : "—"}
        </td>
        <td
          className="max-w-[220px] truncate px-2.5 py-2"
          style={{ ...cellBorder, color: "var(--color-accent-red)" }}
          title={row.failure}
        >
          {row.failure || ""}
        </td>
        <td className="px-2.5 py-2" style={cellBorder}>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td
            colSpan={12}
            className="px-4 py-3"
            style={{ borderTop: "1px solid var(--color-border-default)", background: "var(--color-bg-secondary)" }}
          >
            <div className="flex flex-col gap-2 text-[11.5px]">
              {row.steps.length > 0 ? (
                <div>
                  <div className="mb-1 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                    Step timeline
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {row.steps.map((st, i) => (
                      <div key={i} className="flex items-center gap-2 font-mono">
                        <span style={{ color: statusColor(st.status), width: 74 }}>{st.status || "—"}</span>
                        <span className="tabular-nums" style={{ width: 56, color: "var(--color-text-tertiary)" }}>
                          {fmtDurationSec(st.seconds)}
                        </span>
                        <span>{st.name || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--color-text-tertiary)" }}>No build steps recorded.</div>
              )}
              {row.failure_detail && (
                <div>
                  <span className="font-medium" style={{ color: "var(--color-accent-red)" }}>
                    {row.failure_type || "FAILURE"}:
                  </span>{" "}
                  <span className="font-mono">{row.failure_detail}</span>
                </div>
              )}
              {row.log_url && (
                <a
                  href={row.log_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit underline"
                  style={{ color: "var(--color-accent-blue)" }}
                >
                  Open build log ↗
                </a>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── the live Deploy timeline view ─────────────────────────────────────────────────────────────────
function DeployTimelineView({
  data,
  filter,
  onFilter,
}: {
  data: DeploysResponse;
  filter: DeployFilter;
  onFilter: (f: DeployFilter) => void;
}) {
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const onSort = (key: string) => setSort((s) => toggleColumnSort(s, key));
  const [colFilters, setColFilters] = useState<DeployColumnFilters>(EMPTY_DEPLOY_COLUMN_FILTERS);

  const workloadOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.workload)), [data.rows]);
  const cloudOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.cloud)), [data.rows]);
  const changeOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.change_type)), [data.rows]);
  const deployerOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.deployer)), [data.rows]);

  const activeColFilterCount =
    colFilters.workload.size +
    colFilters.cloud.size +
    colFilters.change.size +
    colFilters.deployer.size +
    (colFilters.revision ? 1 : 0) +
    (colFilters.digest ? 1 : 0);

  const rows = useMemo(() => {
    let out = data.rows.filter((r) => matchesDeployFilter(r, filter) && matchesDeployColumnFilters(r, colFilters));
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const cmp = compareSortValues(deploySortValue(a, key), deploySortValue(b, key));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [data.rows, filter, colFilters, sort]);
  const s = data.stats;

  return (
    <section data-testid="artifact-deploy-view">
      {/* stat band — live_now is a point-in-time count, never narrowed by the date window */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile
          label="Deploys in window"
          value={String(s.total)}
          sub="Cloud Run revisions"
          testId="deploy-stat-total"
        />
        <StatTile
          label="Config-only redeploys"
          value={`${s.config_only_pct}%`}
          sub="same digest, nothing shipped"
          color="var(--color-accent-amber)"
          testId="deploy-stat-config"
        />
        <StatTile
          label="Live now (GCP)"
          value={String(s.live_now)}
          sub="workloads serving right now"
          color="var(--color-accent-green)"
          testId="deploy-stat-live"
        />
        <StatTile
          label="Failed"
          value={String(s.failed)}
          sub="never went ready"
          color="var(--color-accent-red)"
          testId="deploy-stat-failed"
        />
      </div>

      {/* filter bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {DEPLOY_FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`deploy-filter-${f.id}`}
                onClick={() => onFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                style={{
                  background: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? undefined : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          <b>New code only</b> hides the config-only churn · <b>Live now</b> = what is serving this instant · click a
          column header to sort, the funnel to filter it
        </span>
        {(activeColFilterCount > 0 || sort) && (
          <button
            type="button"
            data-testid="deploy-colfilters-clear"
            onClick={() => {
              setColFilters(EMPTY_DEPLOY_COLUMN_FILTERS);
              setSort(null);
            }}
            className="text-[11px] underline"
            style={{ color: "var(--color-accent-blue)" }}
          >
            Clear column filters/sort
          </button>
        )}
      </div>

      {/* table */}
      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[860px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              <ColumnHeader
                label="Workload"
                sortKey="workload"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-workload"
                filterNode={
                  <MultiSelectFilter
                    label="Workload"
                    options={workloadOptions}
                    selected={colFilters.workload}
                    onChange={(v) => setColFilters((f) => ({ ...f, workload: v }))}
                    testId="deploy-filter-workload"
                  />
                }
              />
              <ColumnHeader
                label="Revision"
                sortKey="revision"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-revision"
                filterNode={
                  <TextFilterInput
                    value={colFilters.revision}
                    onChange={(v) => setColFilters((f) => ({ ...f, revision: v }))}
                    placeholder="search…"
                    testId="deploy-filter-revision"
                  />
                }
              />
              <ColumnHeader
                label="Cloud"
                sortKey="cloud"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-cloud"
                filterNode={
                  <MultiSelectFilter
                    label="Cloud"
                    options={cloudOptions}
                    selected={colFilters.cloud}
                    onChange={(v) => setColFilters((f) => ({ ...f, cloud: v }))}
                    testId="deploy-filter-cloud-col"
                  />
                }
              />
              <ColumnHeader
                label="Change"
                sortKey="change_type"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-change"
                filterNode={
                  <MultiSelectFilter
                    label="Change"
                    options={changeOptions}
                    selected={colFilters.change}
                    onChange={(v) => setColFilters((f) => ({ ...f, change: v }))}
                    testId="deploy-filter-change-col"
                  />
                }
              />
              <ColumnHeader
                label="Digest"
                sortKey="digest"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-digest"
                filterNode={
                  <TextFilterInput
                    value={colFilters.digest}
                    onChange={(v) => setColFilters((f) => ({ ...f, digest: v }))}
                    placeholder="sha256:…"
                    testId="deploy-filter-digest"
                  />
                }
              />
              <ColumnHeader label="When · held for" sortKey="at" sort={sort} onSort={onSort} testId="deploy-th-at" />
              <ColumnHeader
                label="Deployer"
                sortKey="deployer"
                sort={sort}
                onSort={onSort}
                testId="deploy-th-deployer"
                filterNode={
                  <MultiSelectFilter
                    label="Deployer"
                    options={deployerOptions}
                    selected={colFilters.deployer}
                    onChange={(v) => setColFilters((f) => ({ ...f, deployer: v }))}
                    testId="deploy-filter-deployer-col"
                  />
                }
              />
              <th className="px-2.5 py-2" data-testid="deploy-th-live" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2.5 py-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No deploys match this filter in the selected window.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <DeployRowLine key={`${r.workload}-${r.revision}`} row={r} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
        Live from Cloud Run revisions. "Held for" looks ahead to the revision that replaced it — the current live
        revision has none yet. The digest→commit join ("Built from") lands with the <b>What's running</b> view. Window{" "}
        <code>
          {data.start_date} → {data.end_date}
        </code>
        .
      </p>
    </section>
  );
}

function DeployRowLine({ row }: { row: DeployRow }) {
  const cellBorder = { borderTop: "1px solid var(--color-border-default)" };
  return (
    <tr className="align-top" data-testid="deploy-row">
      <td className="px-2.5 py-2 font-medium" style={cellBorder}>
        {row.workload}
      </td>
      <td className="max-w-[220px] truncate px-2.5 py-2 font-mono text-[11px]" style={cellBorder} title={row.revision}>
        {row.revision}
      </td>
      <td className="px-2.5 py-2 uppercase" style={{ ...cellBorder, color: "var(--color-text-secondary)" }}>
        {row.cloud}
      </td>
      <td
        className="whitespace-nowrap px-2.5 py-2 font-medium"
        style={{ ...cellBorder, color: changeColor(row.change_type) }}
      >
        {changeLabel(row.change_type)}
      </td>
      <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px]" style={cellBorder} title={row.digest}>
        {row.digest ? row.digest.slice(0, 19) : "—"}
      </td>
      <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
        {fmtStarted(row.at)} {row.held_for ? `· held ${row.held_for}` : ""}
      </td>
      <td className="max-w-[160px] truncate px-2.5 py-2" style={cellBorder} title={row.deployer}>
        {row.deployer || "—"}
      </td>
      <td className="px-2.5 py-2" style={cellBorder}>
        {row.live && <Pill tone="green">live now</Pill>}
      </td>
    </tr>
  );
}

// ── the live Artifacts (registry inventory) view ────────────────────────────────────────────────
function ArtifactsView({
  data,
  filter,
  onFilter,
}: {
  data: ImagesResponse;
  filter: ImagesFilter;
  onFilter: (f: ImagesFilter) => void;
}) {
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const onSort = (key: string) => setSort((s) => toggleColumnSort(s, key));
  const [colFilters, setColFilters] = useState<ImagesColumnFilters>(EMPTY_IMAGES_COLUMN_FILTERS);

  const repoOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.repo)), [data.rows]);
  const cloudOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.cloud)), [data.rows]);
  const registryOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.registry)), [data.rows]);
  const stateOptions = useMemo(() => uniqueSorted(data.rows.map((r) => r.state)), [data.rows]);

  const activeColFilterCount =
    colFilters.repo.size +
    colFilters.cloud.size +
    colFilters.registry.size +
    colFilters.state.size +
    (colFilters.tags ? 1 : 0) +
    (colFilters.runningOn ? 1 : 0);

  const rows = useMemo(() => {
    let out = data.rows.filter((r) => matchesImagesFilter(r, filter) && matchesImagesColumnFilters(r, colFilters));
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const cmp = compareSortValues(imageSortValue(a, key), imageSortValue(b, key));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [data.rows, filter, colFilters, sort]);
  const s = data.stats;

  return (
    <section data-testid="artifact-art-view">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Registry repos"
          value={String(s.total_repos)}
          sub="Artifact Registry + ECR"
          testId="art-stat-total"
        />
        <StatTile
          label="Running"
          value={String(s.running)}
          sub="a live workload uses it"
          color="var(--color-accent-green)"
          testId="art-stat-running"
        />
        <StatTile
          label="Legacy"
          value={String(s.legacy)}
          sub="GC candidate — nothing running, stale"
          color="var(--color-accent-red)"
          testId="art-stat-legacy"
        />
        <StatTile
          label="Parked"
          value={String(s.parked)}
          sub="AWS deferred — kept, not GC"
          color="var(--color-accent-blue)"
          testId="art-stat-parked"
        />
        <StatTile label="Empty" value={String(s.empty)} sub="declared repo, 0 images" testId="art-stat-empty" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {IMAGES_FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`art-filter-${f.id}`}
                onClick={() => onFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                style={{
                  background: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? undefined : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          Rolled up per repo from every pushed image · click a column header to sort, the funnel to filter it
        </span>
        {(activeColFilterCount > 0 || sort) && (
          <button
            type="button"
            data-testid="art-colfilters-clear"
            onClick={() => {
              setColFilters(EMPTY_IMAGES_COLUMN_FILTERS);
              setSort(null);
            }}
            className="text-[11px] underline"
            style={{ color: "var(--color-accent-blue)" }}
          >
            Clear column filters/sort
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              <ColumnHeader
                label="Repo"
                sortKey="repo"
                sort={sort}
                onSort={onSort}
                testId="art-th-repo"
                filterNode={
                  <MultiSelectFilter
                    label="Repo"
                    options={repoOptions}
                    selected={colFilters.repo}
                    onChange={(v) => setColFilters((f) => ({ ...f, repo: v }))}
                    testId="art-filter-repo"
                  />
                }
              />
              <ColumnHeader
                label="Cloud"
                sortKey="cloud"
                sort={sort}
                onSort={onSort}
                testId="art-th-cloud"
                filterNode={
                  <MultiSelectFilter
                    label="Cloud"
                    options={cloudOptions}
                    selected={colFilters.cloud}
                    onChange={(v) => setColFilters((f) => ({ ...f, cloud: v }))}
                    testId="art-filter-cloud-col"
                  />
                }
              />
              <ColumnHeader
                label="Registry"
                sortKey="registry"
                sort={sort}
                onSort={onSort}
                testId="art-th-registry"
                filterNode={
                  <MultiSelectFilter
                    label="Registry"
                    options={registryOptions}
                    selected={colFilters.registry}
                    onChange={(v) => setColFilters((f) => ({ ...f, registry: v }))}
                    testId="art-filter-registry-col"
                  />
                }
              />
              <ColumnHeader label="Images" sortKey="image_count" sort={sort} onSort={onSort} testId="art-th-count" />
              <ColumnHeader
                label="Tags"
                testId="art-th-tags"
                filterNode={
                  <TextFilterInput
                    value={colFilters.tags}
                    onChange={(v) => setColFilters((f) => ({ ...f, tags: v }))}
                    placeholder="search…"
                    testId="art-filter-tags"
                  />
                }
              />
              <ColumnHeader
                label="Last pushed"
                sortKey="last_pushed"
                sort={sort}
                onSort={onSort}
                testId="art-th-pushed"
              />
              <ColumnHeader
                label="Running on"
                sortKey="running_on"
                sort={sort}
                onSort={onSort}
                testId="art-th-running-on"
                filterNode={
                  <TextFilterInput
                    value={colFilters.runningOn}
                    onChange={(v) => setColFilters((f) => ({ ...f, runningOn: v }))}
                    placeholder="search…"
                    testId="art-filter-running-on"
                  />
                }
              />
              <ColumnHeader
                label="State"
                sortKey="state"
                sort={sort}
                onSort={onSort}
                testId="art-th-state"
                filterNode={
                  <MultiSelectFilter
                    label="State"
                    options={stateOptions}
                    selected={colFilters.state}
                    onChange={(v) => setColFilters((f) => ({ ...f, state: v }))}
                    testId="art-filter-state-col"
                  />
                }
              />
              <ColumnHeader label="Size" sortKey="size_bytes" sort={sort} onSort={onSort} testId="art-th-size" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2.5 py-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No repos match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cellBorder = { borderTop: "1px solid var(--color-border-default)" };
              return (
                <tr key={`${r.cloud}-${r.registry}-${r.repo}`} className="align-top" data-testid="art-row">
                  <td className="px-2.5 py-2 font-medium" style={cellBorder}>
                    {r.repo}
                  </td>
                  <td className="px-2.5 py-2 uppercase" style={{ ...cellBorder, color: "var(--color-text-secondary)" }}>
                    {r.cloud}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2" style={cellBorder}>
                    {r.registry}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
                    {r.image_count >= 0 ? r.image_count : "—"}
                  </td>
                  <td
                    className="max-w-[160px] truncate px-2.5 py-2 font-mono text-[11px]"
                    style={cellBorder}
                    title={r.tags.join(", ")}
                  >
                    {r.tags.join(", ") || "—"}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
                    {fmtStarted(r.last_pushed)}
                  </td>
                  <td className="max-w-[160px] truncate px-2.5 py-2" style={cellBorder} title={r.running_on}>
                    {r.running_on || "—"}
                  </td>
                  <td
                    className="whitespace-nowrap px-2.5 py-2 font-medium"
                    style={{ ...cellBorder, color: imageStateColor(r.state) }}
                  >
                    {r.state}
                    {r.note && (
                      <span className="ml-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }} title={r.note}>
                        ⓘ
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
                    {fmtBytes(r.size_bytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
        Live from Artifact Registry (one repo, every service&apos;s images) + Cloud Run&apos;s live digests for the
        &quot;Running on&quot; join. AWS ECR is parked, not read yet.
      </p>
    </section>
  );
}

// ── the live What's running view (the headline runtime join + drift classifier) ────────────────────
function RunningView({
  data,
  filter,
  onFilter,
}: {
  data: RunningResponse;
  filter: RunningFilter;
  onFilter: (f: RunningFilter) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [sort, setSort] = useState<ColumnSort | null>(null);
  const onSort = (key: string) => setSort((s) => toggleColumnSort(s, key));
  const [colFilters, setColFilters] = useState<RunningColumnFilters>(EMPTY_RUNNING_COLUMN_FILTERS);

  const flat = useMemo(() => flattenRunning(data.groups), [data.groups]);
  const serviceOptions = useMemo(() => uniqueSorted(flat.map((r) => r.service)), [flat]);
  const cloudOptions = useMemo(() => uniqueSorted(flat.map((r) => r.cloud)), [flat]);
  const driftOptions = useMemo(() => uniqueSorted(flat.flatMap((r) => r.version.drift)), [flat]);

  const activeColFilterCount =
    colFilters.service.size +
    colFilters.cloud.size +
    colFilters.drift.size +
    (colFilters.digest ? 1 : 0) +
    (colFilters.builtFrom ? 1 : 0);

  const rows = useMemo(() => {
    let out = flat.filter((r) => matchesRunningFilter(r, filter) && matchesRunningColumnFilters(r, colFilters));
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const cmp = compareSortValues(runningSortValue(a, key), runningSortValue(b, key));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [flat, filter, colFilters, sort]);
  const s = data.stats;

  return (
    <section data-testid="artifact-run-view">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Live services"
          value={String(s.services)}
          sub="Cloud Run, image lane"
          testId="run-stat-services"
        />
        <StatTile
          label="Versions tracked"
          value={String(s.versions)}
          sub="one per live revision"
          testId="run-stat-versions"
        />
        <StatTile
          label="Fragmented"
          value={String(s.fragmented)}
          sub=">1 version live at once"
          color="var(--color-accent-amber)"
          testId="run-stat-fragmented"
        />
        <StatTile
          label="Floating"
          value={String(s.floating)}
          sub=":latest, no SHA tag"
          color="var(--color-accent-red)"
          testId="run-stat-floating"
        />
        <StatTile
          label="Hand-deployed"
          value={String(s.hand)}
          sub="bypassed CI"
          color="var(--color-accent-red)"
          testId="run-stat-hand"
        />
        <StatTile label="Unknown" value={String(s.unknown)} sub="unresolvable commit" testId="run-stat-unknown" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {RUNNING_FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`run-filter-${f.id}`}
                onClick={() => onFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                style={{
                  background: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? undefined : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          The runtime join: digest → Artifact Registry tag → short SHA → build · click a row for the full why · click a
          column header to sort, the funnel to filter it
        </span>
        {(activeColFilterCount > 0 || sort) && (
          <button
            type="button"
            data-testid="run-colfilters-clear"
            onClick={() => {
              setColFilters(EMPTY_RUNNING_COLUMN_FILTERS);
              setSort(null);
            }}
            className="text-[11px] underline"
            style={{ color: "var(--color-accent-blue)" }}
          >
            Clear column filters/sort
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              <ColumnHeader
                label="Service"
                sortKey="service"
                sort={sort}
                onSort={onSort}
                testId="run-th-service"
                filterNode={
                  <MultiSelectFilter
                    label="Service"
                    options={serviceOptions}
                    selected={colFilters.service}
                    onChange={(v) => setColFilters((f) => ({ ...f, service: v }))}
                    testId="run-filter-service"
                  />
                }
              />
              <ColumnHeader
                label="Cloud"
                sortKey="cloud"
                sort={sort}
                onSort={onSort}
                testId="run-th-cloud"
                filterNode={
                  <MultiSelectFilter
                    label="Cloud"
                    options={cloudOptions}
                    selected={colFilters.cloud}
                    onChange={(v) => setColFilters((f) => ({ ...f, cloud: v }))}
                    testId="run-filter-cloud-col"
                  />
                }
              />
              <ColumnHeader label="Version" sortKey="version" sort={sort} onSort={onSort} testId="run-th-version" />
              <ColumnHeader
                label="Digest"
                sortKey="digest"
                sort={sort}
                onSort={onSort}
                testId="run-th-digest"
                filterNode={
                  <TextFilterInput
                    value={colFilters.digest}
                    onChange={(v) => setColFilters((f) => ({ ...f, digest: v }))}
                    placeholder="sha256:…"
                    testId="run-filter-digest"
                  />
                }
              />
              <ColumnHeader
                label="Built from"
                sortKey="built_from"
                sort={sort}
                onSort={onSort}
                testId="run-th-built-from"
                filterNode={
                  <TextFilterInput
                    value={colFilters.builtFrom}
                    onChange={(v) => setColFilters((f) => ({ ...f, builtFrom: v }))}
                    placeholder="sha…"
                    testId="run-filter-built-from"
                  />
                }
              />
              <ColumnHeader
                label="Drift"
                testId="run-th-drift"
                filterNode={
                  <MultiSelectFilter
                    label="Drift"
                    options={driftOptions}
                    selected={colFilters.drift}
                    onChange={(v) => setColFilters((f) => ({ ...f, drift: v }))}
                    testId="run-filter-drift-col"
                  />
                }
              />
              <th className="px-2.5 py-2" data-testid="run-th-expand" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No live workloads match this filter.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const id = `${r.service}-${r.version.digest || r.version.version}`;
              return <RunningRowLine key={id} row={r} isOpen={expanded.has(id)} onToggle={() => toggle(id)} />;
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
        Live from Cloud Run + Artifact Registry + Cloud Build, joined in-process — nothing here is guessed. Scoped to
        the Cloud Run (image) lane; the VM tarball lane&apos;s git commit isn&apos;t stamped yet (see the Health tab).
      </p>
    </section>
  );
}

function RunningRowLine({ row, isOpen, onToggle }: { row: RunningTableRow; isOpen: boolean; onToggle: () => void }) {
  const cellBorder = { borderTop: "1px solid var(--color-border-default)" };
  const v = row.version;
  return (
    <>
      <tr
        className="cursor-pointer align-top hover:bg-[var(--color-bg-secondary)]"
        onClick={onToggle}
        data-testid="run-row"
      >
        <td className="px-2.5 py-2 font-medium" style={cellBorder}>
          <span className="flex items-center gap-1">
            {row.service}
            {row.fragmented && <Pill tone="amber">fragmented</Pill>}
          </span>
        </td>
        <td className="px-2.5 py-2 uppercase" style={{ ...cellBorder, color: "var(--color-text-secondary)" }}>
          {row.cloud}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 font-mono" style={cellBorder}>
          {v.version}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[11px]" style={cellBorder} title={v.digest}>
          {v.digest ? v.digest.slice(0, 19) : "—"}
        </td>
        <td className="whitespace-nowrap px-2.5 py-2 font-mono" style={cellBorder}>
          {v.built_from || "—"}
        </td>
        <td className="px-2.5 py-2" style={cellBorder}>
          <span className="flex flex-wrap gap-1">
            {v.drift.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{ color: driftColor(d), border: `1px solid ${driftColor(d)}` }}
              >
                {driftLabel(d)}
              </span>
            ))}
          </span>
        </td>
        <td className="px-2.5 py-2" style={cellBorder}>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td
            colSpan={7}
            className="px-4 py-3"
            style={{ borderTop: "1px solid var(--color-border-default)", background: "var(--color-bg-secondary)" }}
          >
            <div className="flex flex-col gap-2 text-[11.5px]">
              <div>{v.why || "No further detail."}</div>
              {v.artifact && (
                <div style={{ color: "var(--color-text-tertiary)" }}>
                  Artifact: <span className="font-mono">{v.artifact}</span>
                </div>
              )}
              <div>
                <div className="mb-1 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                  Hosts
                </div>
                <div className="flex flex-col gap-0.5">
                  {v.hosts.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono">
                      <span style={{ width: 120, color: "var(--color-text-tertiary)" }}>{h.kind}</span>
                      <span>{h.name}</span>
                      {h.launched_at && (
                        <span className="tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                          {fmtStarted(h.launched_at)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── the live Health view (measured conditions, derived from the other four tabs' facts) ────────────
function HealthView({
  data,
  filter,
  onFilter,
}: {
  data: HealthResponse;
  filter: HealthFilter;
  onFilter: (f: HealthFilter) => void;
}) {
  const [sort, setSort] = useState<ColumnSort | null>(null);
  const onSort = (key: string) => setSort((s) => toggleColumnSort(s, key));
  const [colFilters, setColFilters] = useState<HealthColumnFilters>(EMPTY_HEALTH_COLUMN_FILTERS);

  const areaOptions = useMemo(() => uniqueSorted(data.conditions.map((c) => c.area)), [data.conditions]);
  const tabOptions = useMemo(() => uniqueSorted(data.conditions.map((c) => c.tab)), [data.conditions]);
  const severityOptions = useMemo(() => uniqueSorted(data.conditions.map((c) => c.severity)), [data.conditions]);

  const activeColFilterCount =
    colFilters.area.size + colFilters.tab.size + colFilters.severity.size + (colFilters.condition ? 1 : 0);

  const rows = useMemo(() => {
    let out = data.conditions.filter(
      (c) => matchesHealthFilter(c, filter) && matchesHealthColumnFilters(c, colFilters),
    );
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const cmp = compareSortValues(healthSortValue(a, key), healthSortValue(b, key));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [data.conditions, filter, colFilters, sort]);
  const s = data.stats;

  return (
    <section data-testid="artifact-health-view">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Real defects"
          value={String(s.real_defects)}
          sub="high + med + low"
          testId="health-stat-defects"
        />
        <StatTile
          label="High"
          value={String(s.high)}
          sub="fix first"
          color="var(--color-accent-red)"
          testId="health-stat-high"
        />
        <StatTile
          label="Medium"
          value={String(s.med)}
          sub=""
          color="var(--color-accent-amber)"
          testId="health-stat-med"
        />
        <StatTile label="Low" value={String(s.low)} sub="" testId="health-stat-low" />
        <StatTile
          label="Deferred"
          value={String(s.deferred)}
          sub="intentional, not a defect"
          color="var(--color-accent-blue)"
          testId="health-stat-deferred"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          {HEALTH_FILTERS.map((f) => {
            const on = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`health-filter-${f.id}`}
                onClick={() => onFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                style={{
                  background: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? undefined : "var(--color-text-secondary)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--color-text-tertiary)" }}>
          Every condition below is derived from the other four tabs&apos; own data — never hand-written · click a column
          header to sort, the funnel to filter it
        </span>
        {(activeColFilterCount > 0 || sort) && (
          <button
            type="button"
            data-testid="health-colfilters-clear"
            onClick={() => {
              setColFilters(EMPTY_HEALTH_COLUMN_FILTERS);
              setSort(null);
            }}
            className="text-[11px] underline"
            style={{ color: "var(--color-accent-blue)" }}
          >
            Clear column filters/sort
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              <ColumnHeader
                label="Severity"
                sortKey="severity"
                sort={sort}
                onSort={onSort}
                testId="health-th-severity"
                filterNode={
                  <MultiSelectFilter
                    label="Severity"
                    options={severityOptions}
                    selected={colFilters.severity}
                    onChange={(v) => setColFilters((f) => ({ ...f, severity: v }))}
                    testId="health-filter-severity-col"
                  />
                }
              />
              <ColumnHeader
                label="Condition"
                sortKey="condition"
                sort={sort}
                onSort={onSort}
                testId="health-th-condition"
                filterNode={
                  <TextFilterInput
                    value={colFilters.condition}
                    onChange={(v) => setColFilters((f) => ({ ...f, condition: v }))}
                    placeholder="search…"
                    testId="health-filter-condition"
                  />
                }
              />
              <ColumnHeader label="Count" sortKey="count" sort={sort} onSort={onSort} testId="health-th-count" />
              <ColumnHeader
                label="Area"
                sortKey="area"
                sort={sort}
                onSort={onSort}
                testId="health-th-area"
                filterNode={
                  <MultiSelectFilter
                    label="Area"
                    options={areaOptions}
                    selected={colFilters.area}
                    onChange={(v) => setColFilters((f) => ({ ...f, area: v }))}
                    testId="health-filter-area"
                  />
                }
              />
              <ColumnHeader
                label="Tab"
                sortKey="tab"
                sort={sort}
                onSort={onSort}
                testId="health-th-tab"
                filterNode={
                  <MultiSelectFilter
                    label="Tab"
                    options={tabOptions}
                    selected={colFilters.tab}
                    onChange={(v) => setColFilters((f) => ({ ...f, tab: v }))}
                    testId="health-filter-tab-col"
                  />
                }
              />
              <ColumnHeader label="Meaning" testId="health-th-meaning" />
              <ColumnHeader label="Evidence" testId="health-th-evidence" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-6 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No conditions match this filter.
                </td>
              </tr>
            )}
            {rows.map((c, i) => {
              const cellBorder = { borderTop: "1px solid var(--color-border-default)" };
              return (
                <tr key={i} className="align-top" data-testid="health-row">
                  <td
                    className="whitespace-nowrap px-2.5 py-2 font-medium uppercase"
                    style={{ ...cellBorder, color: severityColor(c.severity) }}
                  >
                    {c.severity}
                  </td>
                  <td className="max-w-[260px] px-2.5 py-2" style={cellBorder}>
                    {c.condition}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 tabular-nums" style={cellBorder}>
                    {c.count}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2" style={cellBorder}>
                    {c.area}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2" style={cellBorder}>
                    {c.tab}
                  </td>
                  <td
                    className="max-w-[280px] px-2.5 py-2"
                    style={{ ...cellBorder, color: "var(--color-text-secondary)" }}
                  >
                    {c.meaning}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-2.5 py-2 font-mono text-[11px]"
                    style={cellBorder}
                    title={c.evidence}
                  >
                    {c.evidence}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── loading skeleton (shared by every live view) ────────────────────────────────────────────────
function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[86px] animate-pulse rounded-lg border"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-secondary)" }}
        />
      ))}
    </div>
  );
}

// ── help dialog (mirrors CostObservability's CostHelpDialog exactly — same primitives, own content) ─
function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function HelpTerm({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-[124px] flex-none font-semibold text-[var(--color-text-primary)]">{term}</span>
      <span className="flex-1 text-[var(--color-text-secondary)]">{children}</span>
    </div>
  );
}

function ArtifactHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Artifact Pipeline — quick guide</DialogTitle>
      </DialogHeader>
      <DialogContent className="space-y-4 text-[13px] leading-relaxed">
        <p className="text-[var(--color-text-secondary)]">
          The build → artifact → deploy estate, end-to-end: every{" "}
          <b className="text-[var(--color-text-primary)]">Cloud Build</b> run and every{" "}
          <b className="text-[var(--color-text-primary)]">Cloud Run deploy</b>, read live from GCP — nothing here is
          mocked or hand-written. <b className="text-[var(--color-text-primary)]">GCP</b> is the active production
          estate; <b className="text-[var(--color-text-primary)]">AWS</b> is intentionally parked (no credits) — its
          rows, when they arrive, are parked, not broken.
        </p>

        <HelpSection title="Using this page">
          <HelpTerm term="Window">
            7 / 14 / 30-day presets, or type exact dates with the picker next to them — drives{" "}
            <b className="text-[var(--color-text-primary)]">Pipeline</b> and{" "}
            <b className="text-[var(--color-text-primary)]">Deploy timeline</b>. The other three tabs (What&apos;s
            running, Artifacts, Health) show current state, not a history — they ignore the window.
          </HelpTerm>
          <HelpTerm term="Date range">
            Two date fields; picking one clears the day-preset pills (a hand-picked range takes over). Pick a preset
            again to go back to a rolling window.
          </HelpTerm>
          <HelpTerm term="Refresh">
            Bypasses the ~5-minute server cache and re-reads the cloud APIs live (all five tabs).
          </HelpTerm>
          <HelpTerm term="Tabs">
            All five tabs are live — every one reads the real cloud APIs, nothing is mocked.
          </HelpTerm>
          <HelpTerm term="GCP / AWS">
            All deployments run on <b className="text-[var(--color-text-primary)]">GCP</b> — the active production
            estate. The <b className="text-[var(--color-text-primary)]">AWS</b> estate is{" "}
            <b className="text-[var(--color-text-primary)]">deliberately stopped</b> — deferred while credits are
            unavailable, kept intact, resumes when they return. AWS rows are{" "}
            <b className="text-[var(--color-text-primary)]">parked, not broken</b>.
          </HelpTerm>
          <HelpTerm term="Sort &amp; filter">
            Click any column header to sort by it (click again to reverse, a third click clears it). The{" "}
            <Filter className="mb-0.5 inline h-2.5 w-2.5" /> funnel opens a per-column filter — a checklist for a
            bounded column (multi-select, so you can pick several at once — e.g. a few repos or workloads together) or a
            search box for free text. Both are instant, client-side over the loaded window — no new fetch.
          </HelpTerm>
        </HelpSection>

        <HelpSection title="Pipeline tab — every build">
          <p className="text-[var(--color-text-secondary)]">
            One row per Cloud Build run (both lanes — the Docker-image build and the VM tarball build).
          </p>
          <HelpTerm term="Stat tiles">
            All computed from the rows in the window, not hand-written: total builds, success rate, failed count, median
            duration, and how many commits got built twice (wasted).
          </HelpTerm>
          <HelpTerm term="Filters">
            Failed only · one lane · one cloud — instant, no new fetch (the whole window is already loaded).
          </HelpTerm>
          <HelpTerm term="Repo / Lane / Cloud">
            Which repo, which build lane, and which cloud ran it.{" "}
            <b className="text-[var(--color-text-primary)]">Repo</b>
            's funnel is multi-select — check off several repos at once to isolate them.
          </HelpTerm>
          <HelpTerm term="Status">SUCCESS / FAILURE / WORKING, colour-coded.</HelpTerm>
          <HelpTerm term="Commit">
            The short git SHA. An <Pill tone="amber">dup</Pill> badge means this exact commit was built more than once
            in the window — wasted compute.
          </HelpTerm>
          <HelpTerm term="Started / Took">When the build kicked off, and how long it ran.</HelpTerm>
          <HelpTerm term="Produced">
            The image this build pushed, if it pushed one. A <Pill tone="cyan">⇄</Pill> badge on Commit means the same
            commit was ALSO built as the other lane (image and tarball both).
          </HelpTerm>
          <HelpTerm term="Why it failed">
            A one-line reason for a red build. <b className="text-[var(--color-text-primary)]">Click any row</b> to
            expand its full step-by-step timeline, the detailed failure message, and a link to the Cloud Build log.
          </HelpTerm>
        </HelpSection>

        <HelpSection title="Deploy timeline tab — every deploy">
          <p className="text-[var(--color-text-secondary)]">
            One row per <b className="text-[var(--color-text-primary)]">Cloud Run revision</b> — every time a workload
            got redeployed, Cloud Run creates a new revision, so this is the deploy history of the estate.
          </p>
          <HelpTerm term="Stat tiles">
            Deploys in window, % that were config-only (no code change), how many workloads are live right now (a
            snapshot — not narrowed by the date range), and how many deploys never went healthy.
          </HelpTerm>
          <HelpTerm term="Filters">
            <b className="text-[var(--color-text-primary)]">New code only</b> hides config-only churn ·{" "}
            <b className="text-[var(--color-text-primary)]">Live now</b> = what&apos;s serving this instant ·{" "}
            <b className="text-[var(--color-text-primary)]">Failed</b> = never went healthy.
          </HelpTerm>
          <HelpTerm term="Workload">
            The Cloud Run service name — can differ from the repo name (e.g. the <code>deployment-api</code> repo
            deploys to <code>uts-shared-deployment-api</code>). Its funnel is multi-select — check off several workloads
            at once to isolate them.
          </HelpTerm>
          <HelpTerm term="Revision">Cloud Run&apos;s own deploy counter for that workload.</HelpTerm>
          <HelpTerm term="Change">
            <b className="text-[var(--color-text-primary)]">new</b> = a different image shipped ·{" "}
            <b className="text-[var(--color-text-primary)]">config-only</b> = same image redeployed, nothing shipped ·{" "}
            <b className="text-[var(--color-text-primary)]">rollback</b> = reverted to an earlier image ·{" "}
            <b className="text-[var(--color-text-primary)]">failed</b> = never went healthy.
          </HelpTerm>
          <HelpTerm term="Digest">
            The exact <code>sha256:…</code> image running — resolved and recorded by Cloud Run itself, so it&apos;s
            provable even though the deploy command used a mutable tag.
          </HelpTerm>
          <HelpTerm term="When · held for">
            When this revision deployed, and how long it stayed live before something replaced it. &quot;Held for&quot;
            looks forward — the current live revision always shows blank, since nothing has replaced it yet.
          </HelpTerm>
          <HelpTerm term="Deployer">
            Usually &quot;Cloud Build&quot; (the CI pipeline); a service-account name or human email means someone
            deployed by hand.
          </HelpTerm>
          <HelpTerm term="Live badge">
            Marks the revision actually serving traffic. A row can show both{" "}
            <b className="text-[var(--color-text-primary)]">failed</b> and{" "}
            <span className="inline-flex">
              <Pill tone="green">live now</Pill>
            </span>{" "}
            — that means the workload has never had a successful deploy, so this broken revision is still the newest
            thing Cloud Run has for it.
          </HelpTerm>
          <p className="text-[var(--color-text-tertiary)]">
            &quot;Built from&quot; (the commit this digest resolves to) isn&apos;t shown on this tab — that
            digest→commit join is the <b>What&apos;s running</b> tab&apos;s job, deliberately not duplicated here.
          </p>
        </HelpSection>

        <HelpSection title="What's running tab — the headline runtime join">
          <p className="text-[var(--color-text-secondary)]">
            One row per live workload&apos;s current version — Cloud Run&apos;s resolved digest, joined to an Artifact
            Registry tag, joined to the Cloud Build record that produced it. Scoped to the Cloud Run (image) lane for
            now; the VM tarball lane&apos;s git commit isn&apos;t stamped yet (see the Health tab).
          </p>
          <HelpTerm term="Stat tiles">
            Live services, versions tracked, how many services are running &gt;1 version at once (fragmented), and how
            many resolve to a floating tag, a hand-deploy, or an unresolvable commit.
          </HelpTerm>
          <HelpTerm term="Filters">
            Floating :latest · hand-deployed · unknown · fragmented — instant, no new fetch.
          </HelpTerm>
          <HelpTerm term="Service">
            The Cloud Run service name. <b className="text-[var(--color-text-primary)]">Its funnel is multi-select</b> —
            check off several services at once to isolate them.
          </HelpTerm>
          <HelpTerm term="Version">The tag this digest resolves to — a short SHA, or :latest when unpinned.</HelpTerm>
          <HelpTerm term="Digest">
            The exact resolved <code>sha256:…</code> — provable, not a guess.
          </HelpTerm>
          <HelpTerm term="Built from">
            The git commit the join resolved to (blank = honestly unresolvable — never a fabricated value).
          </HelpTerm>
          <HelpTerm term="Drift">
            <b className="text-[var(--color-text-primary)]">traceable</b> (labelled <code>ok</code>) = resolves to a
            real commit · <b className="text-[var(--color-text-primary)]">floating</b> = tagged only :latest, no SHA to
            trace · <b className="text-[var(--color-text-primary)]">hand</b> = deployed by something other than CI ·{" "}
            <b className="text-[var(--color-text-primary)]">unknown</b> = the digest isn&apos;t in the current registry
            inventory. <b className="text-[var(--color-text-primary)]">Click any row</b> to expand the full explanation
            and the host it&apos;s running on.
          </HelpTerm>
        </HelpSection>

        <HelpSection title="Artifacts tab — the registry inventory">
          <p className="text-[var(--color-text-secondary)]">
            One row per registry repo (all of a service&apos;s pushed images, rolled up) — surfaces sprawl and
            garbage-collection candidates.
          </p>
          <HelpTerm term="Stat tiles">
            Total repos, how many are running right now, how many are legacy (nothing running, stale — a real GC
            candidate), how many are AWS-parked, and how many are declared but empty.
          </HelpTerm>
          <HelpTerm term="Filters">Running · legacy · parked · one cloud — instant, no new fetch.</HelpTerm>
          <HelpTerm term="Repo">
            The service. <b className="text-[var(--color-text-primary)]">Its funnel is multi-select</b> — check off
            several repos at once to isolate them.
          </HelpTerm>
          <HelpTerm term="Images / Tags / Last pushed">
            How many images this repo has pushed, the tags on the newest one, and when it last pushed.
          </HelpTerm>
          <HelpTerm term="Running on">The live workload using one of this repo&apos;s images, if any.</HelpTerm>
          <HelpTerm term="State">
            <b className="text-[var(--color-text-primary)]">running</b> = a live workload uses it ·{" "}
            <b className="text-[var(--color-text-primary)]">legacy</b> = nothing running it and stale — a real GC
            candidate · <b className="text-[var(--color-text-primary)]">parked</b> = AWS deferred, kept intentionally ·{" "}
            <b className="text-[var(--color-text-primary)]">active</b> = still pushing, not obviously running.
          </HelpTerm>
          <HelpTerm term="Size">Total bytes across every image this repo has pushed.</HelpTerm>
        </HelpSection>

        <HelpSection title="Health tab — measured conditions, not a hand-written checklist">
          <p className="text-[var(--color-text-secondary)]">
            Every row here is derived live from the other four tabs&apos; own data (never a fabricated green), and
            severity-ranked so the real defects sort above the intentional (AWS-parked) ones.
          </p>
          <HelpTerm term="Stat tiles">
            Real defects (high + med + low, excluding deferred), and the count at each severity tier.
          </HelpTerm>
          <HelpTerm term="Filters">One severity tier at a time — instant, no new fetch.</HelpTerm>
          <HelpTerm term="Severity">
            <b className="text-[var(--color-text-primary)]">high</b> = fix first ·{" "}
            <b className="text-[var(--color-text-primary)]">med</b> /{" "}
            <b className="text-[var(--color-text-primary)]">low</b> = real but less urgent ·{" "}
            <b className="text-[var(--color-text-primary)]">deferred</b> = intentional (AWS parked), not a defect.
          </HelpTerm>
          <HelpTerm term="Area">
            Which corner of the estate this condition is about.{" "}
            <b className="text-[var(--color-text-primary)]">Its funnel is multi-select</b> — check off several areas at
            once to isolate them.
          </HelpTerm>
          <HelpTerm term="Tab">
            Which tab on this page proves the condition — click over and verify it yourself.
          </HelpTerm>
          <HelpTerm term="Meaning / Evidence">What the condition means, and the specific proof behind it.</HelpTerm>
        </HelpSection>
      </DialogContent>
    </Dialog>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────────
export function ArtifactPipeline() {
  const [tab, setTab] = useState<TabId>("pipe");
  const [days, setDays] = useState(7); // operator ask 2026-07-23: default to a 7-day window
  const [range, setRange] = useState<ArtifactDateRange | null>(null); // an explicit range overrides `days`
  const [pipeFilter, setPipeFilter] = useState<PipeFilter>("all");
  const [deployFilter, setDeployFilter] = useState<DeployFilter>("all");
  const [artFilter, setArtFilter] = useState<ImagesFilter>("all");
  const [runFilter, setRunFilter] = useState<RunningFilter>("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [helpOpen, setHelpOpen] = useState(false);

  const [buildsData, setBuildsData] = useState<BuildsResponse | null>(null);
  const [buildsLoading, setBuildsLoading] = useState(true);
  const [buildsError, setBuildsError] = useState<string | null>(null);
  const buildsReqId = useRef(0);

  const [deploysData, setDeploysData] = useState<DeploysResponse | null>(null);
  const [deploysLoading, setDeploysLoading] = useState(true);
  const [deploysError, setDeploysError] = useState<string | null>(null);
  const deploysReqId = useRef(0);

  // images / running / health aren't windowed by date — one load on mount, `refreshAll` bypasses cache.
  const [imagesData, setImagesData] = useState<ImagesResponse | null>(null);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const imagesReqId = useRef(0);

  const [runningData, setRunningData] = useState<RunningResponse | null>(null);
  const [runningLoading, setRunningLoading] = useState(true);
  const [runningError, setRunningError] = useState<string | null>(null);
  const runningReqId = useRef(0);

  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const healthReqId = useRef(0);

  const windowArg = range ?? undefined;

  const loadBuilds = useCallback(
    async (refresh: boolean) => {
      const id = ++buildsReqId.current;
      setBuildsLoading(true);
      setBuildsError(null);
      try {
        const resp = await getArtifactBuilds({ days, refresh, startDate: windowArg?.start, endDate: windowArg?.end });
        if (id !== buildsReqId.current) return; // a newer window is in flight — drop this one
        setBuildsData(resp);
      } catch (e) {
        if (id !== buildsReqId.current) return;
        setBuildsError(e instanceof Error ? e.message : "Failed to load builds");
      } finally {
        if (id === buildsReqId.current) setBuildsLoading(false);
      }
    },
    [days, windowArg?.start, windowArg?.end],
  );

  const loadDeploys = useCallback(
    async (refresh: boolean) => {
      const id = ++deploysReqId.current;
      setDeploysLoading(true);
      setDeploysError(null);
      try {
        const resp = await getArtifactDeploys({ days, refresh, startDate: windowArg?.start, endDate: windowArg?.end });
        if (id !== deploysReqId.current) return;
        setDeploysData(resp);
      } catch (e) {
        if (id !== deploysReqId.current) return;
        setDeploysError(e instanceof Error ? e.message : "Failed to load deploys");
      } finally {
        if (id === deploysReqId.current) setDeploysLoading(false);
      }
    },
    [days, windowArg?.start, windowArg?.end],
  );

  const loadImages = useCallback(async (refresh: boolean) => {
    const id = ++imagesReqId.current;
    setImagesLoading(true);
    setImagesError(null);
    try {
      const resp = await getArtifactImages({ refresh });
      if (id !== imagesReqId.current) return;
      setImagesData(resp);
    } catch (e) {
      if (id !== imagesReqId.current) return;
      setImagesError(e instanceof Error ? e.message : "Failed to load the registry inventory");
    } finally {
      if (id === imagesReqId.current) setImagesLoading(false);
    }
  }, []);

  const loadRunning = useCallback(async (refresh: boolean) => {
    const id = ++runningReqId.current;
    setRunningLoading(true);
    setRunningError(null);
    try {
      const resp = await getArtifactRunning({ refresh });
      if (id !== runningReqId.current) return;
      setRunningData(resp);
    } catch (e) {
      if (id !== runningReqId.current) return;
      setRunningError(e instanceof Error ? e.message : "Failed to load what's running");
    } finally {
      if (id === runningReqId.current) setRunningLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async (refresh: boolean) => {
    const id = ++healthReqId.current;
    setHealthLoading(true);
    setHealthError(null);
    try {
      const resp = await getArtifactHealth({ refresh });
      if (id !== healthReqId.current) return;
      setHealthData(resp);
    } catch (e) {
      if (id !== healthReqId.current) return;
      setHealthError(e instanceof Error ? e.message : "Failed to load health");
    } finally {
      if (id === healthReqId.current) setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBuilds(false);
    void loadDeploys(false);
    void loadImages(false);
    void loadRunning(false);
    void loadHealth(false);
  }, [loadBuilds, loadDeploys, loadImages, loadRunning, loadHealth]);

  const refreshAll = () => {
    void loadBuilds(true);
    void loadDeploys(true);
    void loadImages(true);
    void loadRunning(true);
    void loadHealth(true);
  };
  const loading = buildsLoading || deploysLoading || imagesLoading || runningLoading || healthLoading;

  // What the date inputs SHOW: the hand-picked range, else the window the API actually resolved
  // (builds and deploys share one window, so either response's echoed dates agree); a local
  // fallback only covers the first paint, before any response has landed.
  const shownRange: ArtifactDateRange = range ?? {
    start: buildsData?.start_date ?? deploysData?.start_date ?? isoDaysBefore(isoToday(), days - 1),
    end: buildsData?.end_date ?? deploysData?.end_date ?? isoToday(),
  };

  return (
    <main data-testid="artifact-pipeline-page" className="w-full space-y-4 px-4 py-6 lg:px-6">
      {/* header: tab bar (left) + window/date/refresh/help (right) */}
      <div
        className="flex flex-col gap-3 border-b pb-3 lg:flex-row lg:items-center lg:justify-between"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`artifact-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium"
                style={{
                  borderColor: on ? "var(--color-accent-blue)" : "transparent",
                  color: on ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                }}
              >
                {t.label}
                <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex overflow-hidden rounded-md border"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            {WINDOWS.map((w) => {
              const on = w.days === days && !range;
              return (
                <button
                  key={w.days}
                  type="button"
                  data-testid={`artifact-window-${w.days}`}
                  onClick={() => {
                    setRange(null); // an explicit range no longer applies once a preset is chosen
                    setDays(w.days);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium ${on ? "text-white" : ""}`}
                  style={{
                    background: on ? "var(--color-accent-blue)" : "transparent",
                    color: on ? undefined : "var(--color-text-secondary)",
                  }}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
          <DateRangePicker range={shownRange} onCommit={setRange} />
          <button
            type="button"
            data-testid="artifact-refresh"
            onClick={refreshAll}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="What is this page? Quick guide & column definitions"
            data-testid="artifact-help-button"
            className="grid h-[26px] w-[26px] place-items-center rounded-md border text-xs font-medium"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ArtifactHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* body */}
      {tab === "pipe" && (
        <>
          {buildsError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {buildsError}
            </div>
          )}
          {buildsLoading && !buildsData && <StatSkeleton />}
          {buildsData && <PipelineView data={buildsData} filter={pipeFilter} onFilter={setPipeFilter} />}
        </>
      )}
      {tab === "deploy" && (
        <>
          {deploysError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {deploysError}
            </div>
          )}
          {deploysLoading && !deploysData && <StatSkeleton />}
          {deploysData && <DeployTimelineView data={deploysData} filter={deployFilter} onFilter={setDeployFilter} />}
        </>
      )}
      {tab === "art" && (
        <>
          {imagesError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {imagesError}
            </div>
          )}
          {imagesLoading && !imagesData && <StatSkeleton />}
          {imagesData && <ArtifactsView data={imagesData} filter={artFilter} onFilter={setArtFilter} />}
        </>
      )}
      {tab === "run" && (
        <>
          {runningError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {runningError}
            </div>
          )}
          {runningLoading && !runningData && <StatSkeleton />}
          {runningData && <RunningView data={runningData} filter={runFilter} onFilter={setRunFilter} />}
        </>
      )}
      {tab === "health" && (
        <>
          {healthError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {healthError}
            </div>
          )}
          {healthLoading && !healthData && <StatSkeleton />}
          {healthData && <HealthView data={healthData} filter={healthFilter} onFilter={setHealthFilter} />}
        </>
      )}
    </main>
  );
}
