/**
 * /ops/artifacts — the build → artifact → deploy estate, end-to-end.
 *
 * Five views (What's running · Deploy timeline · Pipeline · Artifacts · Health) mirroring the frozen
 * design mock at `public/design-mocks/artifact-pipeline.html`. **Pipeline** (`GET /api/artifacts/builds`)
 * and **Deploy timeline** (`GET /api/artifacts/deploys`) are live; the other three are placeholders
 * until their backends land, per-view. GCP is the active production estate; AWS is intentionally
 * parked (no credits) — its rows, when they arrive, are parked-not-broken.
 *
 * Deliberately self-contained (mirroring CostObservability): plain fetch + useState/useEffect with a
 * request-id guard per view, small inline primitives styled off the app's CSS custom-property tokens,
 * and the same native `<input type="date">` range picker (operator ask 2026-07-23).
 *
 * Both live tables' columns are sortable (click a header) and most are filterable (the funnel icon —
 * a multi-select checklist for enum-shaped columns, a substring box for free-text ones); **Repo**
 * (Pipeline) and **Workload** (Deploy timeline) get the multi-select explicitly (operator ask
 * 2026-07-23) so several repos/workloads can be isolated at once. Column sort/filter is client-side
 * over the already-loaded window, same as the existing pill filters — no new fetch.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, HelpCircle, Package, RefreshCw } from "lucide-react";

import {
  getArtifactBuilds,
  getArtifactDeploys,
  type BuildRow,
  type BuildsResponse,
  type DeployRow,
  type DeploysResponse,
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

// What each not-yet-wired view will show — honest placeholder copy, straight from the design intent.
const PLACEHOLDERS: Record<Exclude<TabId, "pipe" | "deploy">, string> = {
  run: "The headline join — each live workload's running image resolved back to its Artifact Registry tag → short SHA → Cloud Build record → git commit, with an honest drift verdict (pinned / floating / stale / hand-deployed / unknown). Backend in progress.",
  art: "The Artifact Registry + ECR inventory — image tags, digests, sizes, per-repo storage, and garbage-collection candidates, cross-referenced against what is actually running. Backend in progress.",
  health:
    "Measured pipeline-health conditions derived from the other views (floating pointers, unresolvable tarball VMs, stale builds, parked-AWS state) — each a real check, never a fabricated green. Backend in progress.",
};

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

// ── not-yet-wired view placeholder ────────────────────────────────────────────────────────────────
function ComingSoon({ tab }: { tab: Exclude<TabId, "pipe" | "deploy"> }) {
  return (
    <section
      data-testid="artifact-placeholder"
      className="flex flex-col items-center gap-3 rounded-lg border px-6 py-14 text-center"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-secondary)" }}
    >
      <Package className="h-8 w-8" style={{ color: "var(--color-text-tertiary)" }} />
      <div className="max-w-xl text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {PLACEHOLDERS[tab]}
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
        <b>Pipeline</b> and <b>Deploy timeline</b> are live now — the rest ship per-view.
      </div>
    </section>
  );
}

// ── loading skeleton (shared by both live views) ────────────────────────────────────────────────
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
            7 / 14 / 30-day presets, or type exact dates with the picker next to them — either drives both live tabs at
            once.
          </HelpTerm>
          <HelpTerm term="Date range">
            Two date fields; picking one clears the day-preset pills (a hand-picked range takes over). Pick a preset
            again to go back to a rolling window.
          </HelpTerm>
          <HelpTerm term="Refresh">Bypasses the ~5-minute server cache and re-reads the cloud APIs live.</HelpTerm>
          <HelpTerm term="Tabs">
            <b className="text-[var(--color-text-primary)]">Pipeline</b> and{" "}
            <b className="text-[var(--color-text-primary)]">Deploy timeline</b> are live now. The other three
            (What&apos;s running, Artifacts, Health) show what they&apos;ll do once their backend lands — not built yet.
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
            &quot;Built from&quot; (the commit this digest resolves to) isn&apos;t shown yet — that digest→commit join
            is the job of the upcoming <b>What&apos;s running</b> tab, deliberately not duplicated here.
          </p>
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
  const [helpOpen, setHelpOpen] = useState(false);

  const [buildsData, setBuildsData] = useState<BuildsResponse | null>(null);
  const [buildsLoading, setBuildsLoading] = useState(true);
  const [buildsError, setBuildsError] = useState<string | null>(null);
  const buildsReqId = useRef(0);

  const [deploysData, setDeploysData] = useState<DeploysResponse | null>(null);
  const [deploysLoading, setDeploysLoading] = useState(true);
  const [deploysError, setDeploysError] = useState<string | null>(null);
  const deploysReqId = useRef(0);

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

  useEffect(() => {
    void loadBuilds(false);
    void loadDeploys(false);
  }, [loadBuilds, loadDeploys]);

  const refreshAll = () => {
    void loadBuilds(true);
    void loadDeploys(true);
  };
  const loading = buildsLoading || deploysLoading;

  // What the date inputs SHOW: the hand-picked range, else the window the API actually resolved
  // (builds and deploys share one window, so either response's echoed dates agree); a local
  // fallback only covers the first paint, before any response has landed.
  const shownRange: ArtifactDateRange = range ?? {
    start: buildsData?.start_date ?? deploysData?.start_date ?? isoDaysBefore(isoToday(), days - 1),
    end: buildsData?.end_date ?? deploysData?.end_date ?? isoToday(),
  };

  return (
    <main data-testid="artifact-pipeline-page" className="w-full space-y-4 px-4 py-6 lg:px-6">
      {/* header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="grid h-10 w-10 flex-none place-items-center rounded-lg text-white"
            style={{ background: "linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-purple))" }}
          >
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Artifact Pipeline</h1>
            <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
              Build → artifact → deploy, end-to-end across GCP (active) and AWS (parked)
            </p>
          </div>
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

      {/* GCP active / AWS parked context banner */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs"
        style={{
          borderColor: "var(--color-border-default)",
          borderLeft: "3px solid var(--color-accent-blue)",
          background: "var(--color-bg-secondary)",
          color: "var(--color-text-secondary)",
        }}
      >
        <Pill tone="cyan">GCP = active production</Pill>
        <Pill tone="blue">AWS = intentionally parked</Pill>
        <span>
          All deployments run on <b>GCP</b>. The <b>AWS</b> estate is <b>deliberately stopped</b> — deferred while
          credits are unavailable, kept intact, resumes when they return. AWS rows are <b>parked, not broken</b>.
        </span>
      </div>

      {/* tab bar */}
      <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--color-border-default)" }}>
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
      {tab !== "pipe" && tab !== "deploy" && <ComingSoon tab={tab} />}
    </main>
  );
}
