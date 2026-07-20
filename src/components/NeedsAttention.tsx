/**
 * "Needs Attention" triage panel — Data Status surface.
 *
 * A ranked, collapsible, cross-cutting summary of the worst problems across
 * every asset_group/venue in the currently-loaded turbo/manifest response:
 * recent capture FAILURES, missing-date GAPS, and STALE captures. This is
 * genuinely absent from prod today — prod only surfaces failures deep inside
 * the per-venue drilldown, so an operator has to know where to look. This
 * panel sits at the top of the Data Status surface so the worst problems are
 * visible on load.
 *
 * Pure presentation — the ranking/derivation logic lives in
 * `lib/needs-attention.ts` (`deriveNeedsAttention`) so it's unit-testable
 * without mounting this component. This component only renders the already-
 * ranked list and forwards row clicks to the caller (which owns "jump to the
 * relevant drill path" — see DataStatusTab's `onSelect` wiring: it filters
 * the category selector and scrolls the Data Coverage card into view).
 */
import { AlertTriangle, ChevronDown, ChevronRight, Clock, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { NeedsAttentionItem, NeedsAttentionKind } from "../lib/needs-attention";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export interface NeedsAttentionProps {
  items: NeedsAttentionItem[];
  onSelect?: (item: NeedsAttentionItem) => void;
  /** Ref forwarded to the outer Card — lets a caller scroll this panel into view. */
  className?: string;
}

const KIND_META: Record<
  NeedsAttentionKind,
  { label: string; badgeVariant: "error" | "warning" | "info"; icon: typeof AlertTriangle }
> = {
  failure: { label: "Failure", badgeVariant: "error", icon: AlertTriangle },
  gap: { label: "Gap", badgeVariant: "warning", icon: ShieldAlert },
  stale: { label: "Stale", badgeVariant: "info", icon: Clock },
};

function countsByKind(items: NeedsAttentionItem[]): Record<NeedsAttentionKind, number> {
  const counts: Record<NeedsAttentionKind, number> = { failure: 0, gap: 0, stale: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

export function NeedsAttention({ items, onSelect, className }: NeedsAttentionProps) {
  const [expanded, setExpanded] = useState(true);

  if (items.length === 0) {
    return (
      <Card className={className} data-testid="needs-attention-panel" data-needs-attention-empty="true">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm text-[var(--color-accent-green)]">
            <ShieldAlert className="h-4 w-4" />
            <span>Needs Attention — no failures, gaps, or stale captures in the current range.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const kindCounts = countsByKind(items);

  return (
    <Card className={className} data-testid="needs-attention-panel">
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          data-testid="needs-attention-toggle"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
            )}
            <CardTitle className="text-lg font-mono flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--color-accent-red)]" />
              Needs Attention
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {kindCounts.failure > 0 && (
              <Badge variant="error" data-testid="needs-attention-count-failure">
                {kindCounts.failure} failure{kindCounts.failure === 1 ? "" : "s"}
              </Badge>
            )}
            {kindCounts.gap > 0 && (
              <Badge variant="warning" data-testid="needs-attention-count-gap">
                {kindCounts.gap} gap{kindCounts.gap === 1 ? "" : "s"}
              </Badge>
            )}
            {kindCounts.stale > 0 && (
              <Badge variant="info" data-testid="needs-attention-count-stale">
                {kindCounts.stale} stale
              </Badge>
            )}
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <ul className="space-y-1.5" data-testid="needs-attention-list">
            {items.map((item) => {
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
                    data-testid={`needs-attention-item-${item.id}`}
                    title={`Jump to ${item.assetGroup} / ${item.name}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon
                        className={
                          item.kind === "failure"
                            ? "h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent-red)]"
                            : item.kind === "gap"
                              ? "h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent-amber)]"
                              : "h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent-blue)]"
                        }
                      />
                      <span className="truncate text-sm">
                        <span className="font-medium">{item.assetGroup}</span>
                        <span className="text-[var(--color-text-muted)]"> / {item.name}</span>
                      </span>
                      <span className="hidden truncate text-xs text-[var(--color-text-muted)] sm:inline">
                        {item.detail}
                      </span>
                    </div>
                    <Badge variant={meta.badgeVariant} className="flex-shrink-0">
                      {meta.label} · {item.count.toLocaleString()}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

export default NeedsAttention;
