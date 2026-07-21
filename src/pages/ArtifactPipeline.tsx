/**
 * /ops/artifacts — the build → artifact → deploy estate, end-to-end.
 *
 * Five views (What's running · Deploy timeline · Pipeline · Artifacts · Health) mirroring the frozen
 * design mock at `public/design-mocks/artifact-pipeline.html`. The **Pipeline** view is live against
 * `GET /api/artifacts/builds` (real Cloud Build history); the other four are placeholders until their
 * backends land, per-view. GCP is the active production estate; AWS is intentionally parked (no
 * credits) — its rows, when they arrive, are parked-not-broken.
 *
 * Deliberately self-contained (mirroring CostObservability): plain fetch + useState/useEffect with a
 * request-id guard, and small inline primitives styled off the app's CSS custom-property tokens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Package, RefreshCw } from "lucide-react";

import { getArtifactBuilds, type BuildRow, type BuildsResponse } from "../api/deploymentApi";

// ── tabs ────────────────────────────────────────────────────────────────────────────────────────
type TabId = "run" | "deploy" | "pipe" | "art" | "health";

const TABS: readonly { id: TabId; label: string; hint: string }[] = [
  { id: "run", label: "What's running", hint: "join + drift" },
  { id: "deploy", label: "Deploy timeline", hint: "estate" },
  { id: "pipe", label: "Pipeline", hint: "builds" },
  { id: "art", label: "Artifacts", hint: "registries" },
  { id: "health", label: "Health", hint: "conditions" },
];

// What each not-yet-wired view will show — honest placeholder copy, straight from the design intent.
const PLACEHOLDERS: Record<Exclude<TabId, "pipe">, string> = {
  run: "The headline join — each live workload's running image resolved back to its Artifact Registry tag → short SHA → Cloud Build record → git commit, with an honest drift verdict (pinned / floating / stale / hand-deployed / unknown). Backend in progress.",
  deploy:
    "Every Cloud Run revision + App Runner / ECS op + VM launch as a deploy timeline — new-code vs config-only churn, how long each revision was held live, and who deployed it. Backend in progress.",
  art: "The Artifact Registry + ECR inventory — image tags, digests, sizes, per-repo storage, and garbage-collection candidates, cross-referenced against what is actually running. Backend in progress.",
  health:
    "Measured pipeline-health conditions derived from the other views (floating pointers, unresolvable tarball VMs, stale builds, parked-AWS state) — each a real check, never a fabricated green. Backend in progress.",
};

// ── window presets ──────────────────────────────────────────────────────────────────────────────
const WINDOWS: readonly { days: number; label: string }[] = [
  { days: 7, label: "7d" },
  { days: 14, label: "14d" },
  { days: 30, label: "30d" },
];

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

// ── formatting helpers ──────────────────────────────────────────────────────────────────────────
function fmtDurationSec(seconds: number | null): string {
  if (seconds == null) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

/** ISO → "MM-DD HH:MM" (UTC) for the compact "Started" cell; "" stays "". */
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

  const rows = useMemo(() => data.rows.filter((r) => matchesFilter(r, filter)), [data.rows, filter]);
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
          = same commit built twice · click a row for the step timeline
        </span>
      </div>

      {/* table */}
      <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border-default)" }}>
        <table className="w-full min-w-[980px] border-collapse text-xs">
          <thead>
            <tr style={{ color: "var(--color-text-tertiary)" }} className="text-left">
              {[
                "Repo",
                "Lane",
                "Cloud",
                "Status",
                "Triggered by",
                "Commit",
                "Branch",
                "Started",
                "Took",
                "Produced",
                "Why it failed",
                "",
              ].map((h, i) => (
                <th key={i} className="whitespace-nowrap px-2.5 py-2 font-medium">
                  {h}
                </th>
              ))}
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

// ── not-yet-wired view placeholder ────────────────────────────────────────────────────────────────
function ComingSoon({ tab }: { tab: Exclude<TabId, "pipe"> }) {
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
        The <b>Pipeline</b> tab is live now — the rest ship per-view.
      </div>
    </section>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────────────────────────
export function ArtifactPipeline() {
  const [tab, setTab] = useState<TabId>("pipe");
  const [days, setDays] = useState(14);
  const [filter, setFilter] = useState<PipeFilter>("all");
  const [data, setData] = useState<BuildsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (refresh: boolean) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const resp = await getArtifactBuilds({ days, refresh });
        if (id !== reqId.current) return; // a newer window is in flight — drop this one
        setData(resp);
      } catch (e) {
        if (id !== reqId.current) return;
        setError(e instanceof Error ? e.message : "Failed to load builds");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [days],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <main data-testid="artifact-pipeline-page" className="w-full space-y-4 px-4 py-6 lg:px-6">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex items-center gap-2">
          <div
            className="inline-flex overflow-hidden rounded-md border"
            style={{ borderColor: "var(--color-border-default)" }}
          >
            {WINDOWS.map((w) => {
              const on = w.days === days;
              return (
                <button
                  key={w.days}
                  type="button"
                  data-testid={`artifact-window-${w.days}`}
                  onClick={() => setDays(w.days)}
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
          <button
            type="button"
            data-testid="artifact-refresh"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

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
      {tab === "pipe" ? (
        <>
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-accent-red)", color: "var(--color-accent-red)" }}
            >
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}
          {loading && !data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[86px] animate-pulse rounded-lg border"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-secondary)" }}
                />
              ))}
            </div>
          )}
          {data && <PipelineView data={data} filter={filter} onFilter={setFilter} />}
        </>
      ) : (
        <ComingSoon tab={tab} />
      )}
    </main>
  );
}
