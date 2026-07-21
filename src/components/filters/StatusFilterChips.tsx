import { TONE_CLASSES, type ChipTone } from "./chipTone";

/** One chip's rendered state — the caller (Deployments today; WS-5's alerts page tomorrow)
 *  computes `count` from its own summary shape, keeping this component summary-agnostic. */
export interface StatusChip {
  value: string;
  label: string;
  tone: ChipTone;
  count: number;
}

/**
 * Generic status-filter chip row — quick single-select toggles with a count beside each so the
 * operator sees the spread at a glance. Lifted out of `Deployments.tsx` and generalized (per
 * deployment_ui_date_range_filter_and_search_2026_07_20's shared-primitives extraction): the
 * original took a deployment-specific `UmbrellaSummaryResponse` and a hardcoded chip list; this
 * takes pre-computed `chips` so any page's own status vocabulary/summary shape can drive it (WS-5's
 * alerts-page rebuild consumes this instead of duplicating it). Same markup, same classes, same
 * `data-testid` contract as the original — no visual/behavioural change for Deployments.
 */
export function StatusFilterChips({
  chips,
  active,
  onSelect,
}: {
  chips: StatusChip[];
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="status-filter-chips">
      {chips.map((chip) => {
        const isActive = active === chip.value;
        return (
          <button
            key={chip.value || "all"}
            type="button"
            aria-pressed={isActive}
            data-testid={`status-chip-${chip.value || "all"}`}
            onClick={() => onSelect(chip.value)}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border transition-colors ${
              isActive
                ? TONE_CLASSES[chip.tone]
                : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            {chip.label}
            <span data-testid={`status-chip-count-${chip.value || "all"}`} className="font-mono opacity-80">
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
