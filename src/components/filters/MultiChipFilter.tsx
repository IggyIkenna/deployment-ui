import { TONE_CLASSES, type ChipTone } from "./chipTone";

/** One chip's rendered state — the caller computes `tone` from its own domain vocabulary,
 *  keeping this component vocabulary-agnostic (mirrors StatusFilterChips' `StatusChip`). */
export interface MultiChipOption {
  value: string;
  label: string;
  tone: ChipTone;
}

/**
 * Generic multi-select filter chip row — Deployments.tsx's `KindFilterChips` pattern
 * (Set-backed toggle, comma-joined URL param) generalized for reuse (deployment_ui_alerts_page_rebuild_2026_07_20.md
 * "Filter bar" todo). Unlike `StatusFilterChips` (single-select, `active` is one value),
 * ANY number of chips can be active at once — an empty `selected` set means "no filter" (all
 * rows pass), matching Deployments.tsx's own `kindFilters.size === 0` semantics.
 */
export function MultiChipFilter({
  testId,
  label,
  options,
  selected,
  onToggle,
}: {
  testId: string;
  label: string;
  options: MultiChipOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5" data-testid={testId}>
      <span className="text-[11px] text-[var(--color-text-muted)]">{label}</span>
      {options.map((o) => {
        const active = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            data-testid={`${testId}-${o.value}`}
            onClick={() => onToggle(o.value)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium border transition-colors ${
              active
                ? TONE_CLASSES[o.tone]
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
