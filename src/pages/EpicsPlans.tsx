/**
 * Epics tab v2 — LIVE PM epics + active-plan drilldown (operator add 2026-06-10).
 *
 * Replaces the stale Epics view that read the ARCHIVED `unified-trading-codex` epic yamls
 * (4 dead asset-class epics). Reads deployment-api `GET /api/epics/plans` (live PM
 * `plans/epics/*` + `plans/active/*` frontmatter): epic cards → expand to the epic's active
 * plans (completion % from `- [x]`/`- [ ]` counts + open-P0/P1) → each plan row links its
 * file on GitHub. Orphans (active plans with no `parent_epic`) surface as a review-blocking
 * strip (per the active-plan-inventory rule). Same LIVE/MOCK + severity-first idioms as Repos CI.
 *
 * Plan: ci_dashboard_deployment_ui_2026_06_10.md Phase 2 "Epics tab v2".
 */

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, ExternalLink, RefreshCw, Trophy } from "lucide-react";
import { getEpicsPlans, type EpicCard, type EpicPlanRow, type EpicsPlansResponse } from "../api/client";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

function pctTone(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 50) return "text-cyan-400";
  if (pct > 0) return "text-amber-400";
  return "text-zinc-400";
}

function PlanRow({ plan }: { plan: EpicPlanRow }) {
  return (
    <div className="flex items-center gap-3 text-xs py-1" data-testid={`epic-plan-${plan.slug}`}>
      <span className={`font-mono w-12 text-right ${pctTone(plan.pct)}`}>{plan.pct}%</span>
      <span className="text-[var(--color-text-muted)] w-20">
        {plan.done}/{plan.done + plan.open} done
      </span>
      {plan.open_p0p1 > 0 && <span className="text-amber-400">{plan.open_p0p1} open P0/P1</span>}
      <a
        href={plan.github_url}
        target="_blank"
        rel="noreferrer"
        className="text-cyan-400 hover:underline truncate inline-flex items-center gap-1 flex-1"
      >
        {plan.slug} <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

function EpicCardView({ epic }: { epic: EpicCard }) {
  const [open, setOpen] = useState(false);
  const total = epic.done_total + epic.open_total;
  const pct = total > 0 ? Math.round((1000 * epic.done_total) / total) / 10 : 0;
  return (
    <Card data-testid={`epic-card-${epic.name}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
          <button
            className="inline-flex items-center gap-1 hover:underline"
            onClick={() => setOpen((v) => !v)}
            data-testid={`epic-toggle-${epic.name}`}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {epic.title || epic.name}
          </button>
          <span className="text-[10px] font-mono rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-text-muted)]">
            {epic.tier || "—"}
          </span>
          <span className="text-[10px] font-mono rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-text-muted)]">
            {epic.priority || "—"}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)] font-normal">{epic.assigned_vm}</span>
          <span className={`text-xs font-mono ${pctTone(pct)}`}>{pct}%</span>
          <span className="text-xs text-[var(--color-text-muted)] font-normal">
            {epic.plan_count} plan{epic.plan_count === 1 ? "" : "s"}
          </span>
          <a
            href={epic.github_url}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:underline inline-flex items-center gap-1 text-xs"
          >
            epic <ExternalLink className="h-3 w-3" />
          </a>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {epic.plans.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">No active plans reference this epic.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]/40">
              {epic.plans.map((p) => (
                <PlanRow key={p.slug} plan={p} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function EpicsPlansContent() {
  const [data, setData] = useState<EpicsPlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getEpicsPlans());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4" data-testid="epics-plans-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Epics — live plans</h2>
          {data && (
            <span className="text-[10px] font-mono rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-text-muted)]">
              {data.source}
            </span>
          )}
          {data?.stale && (
            <span
              className="text-[10px] font-mono rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-400"
              data-testid="epics-stale-badge"
              title="GitHub rate-limited/unreachable — showing the last cached snapshot"
            >
              STALE
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} data-testid="epics-refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <Card data-testid="epics-error">
          <CardContent className="py-3 text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Failed to load: {error}
          </CardContent>
        </Card>
      )}

      {data && data.orphan_count > 0 && (
        <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-sm" data-testid="epics-orphans">
          <div className="text-amber-400 font-medium mb-1">
            Orphan plans ({data.orphan_count}) — no `parent_epic` (review-blocking)
          </div>
          <div className="space-y-0.5">
            {data.orphans.map((p) => (
              <PlanRow key={p.slug} plan={p} />
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="space-y-3" data-testid="epics-list">
          {data.epics.map((epic) => (
            <EpicCardView key={epic.name} epic={epic} />
          ))}
        </div>
      )}

      {!data && !error && <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>}
    </div>
  );
}
