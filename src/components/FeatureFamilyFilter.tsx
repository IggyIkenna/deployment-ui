// FeatureFamilyFilter — Phase 8B of features_repo_consolidation_2026_05_08.plan
//
// Multi-select filter dropdown for the 8 UAC-declared feature families.
// Renders inline with the existing data-status filter row so operators
// can scope a manifest fetch to one or more families before drilling.
// The selected set is passed up via `onChange`; parent typically wires
// it to `getDataStatusManifest({feature_family: ...})` (one fetch per
// family OR a comma-joined param if the API supports it server-side).
//
// Shape mirrors the existing single-line filter pills used in
// DataStatusTab so the component drops in without bespoke layout.

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { type FeatureFamily, FEATURE_FAMILIES } from "../api/client";

export interface FeatureFamilyFilterProps {
  selected: ReadonlySet<FeatureFamily>;
  onChange: (next: ReadonlySet<FeatureFamily>) => void;
  /**
   * Optional label override; defaults to "Feature family".
   */
  label?: string;
  /**
   * When true, renders the filter as disabled (e.g. while a parent
   * fetch is in flight). The dropdown still renders but doesn't open.
   */
  disabled?: boolean;
}

export function FeatureFamilyFilter({
  selected,
  onChange,
  label = "Feature family",
  disabled = false,
}: FeatureFamilyFilterProps) {
  const [open, setOpen] = useState(false);

  const summary =
    selected.size === 0
      ? "All families"
      : selected.size === FEATURE_FAMILIES.length
        ? "All families"
        : selected.size === 1
          ? Array.from(selected)[0]
          : `${selected.size} families`;

  return (
    <div
      className="relative inline-block"
      data-testid="feature-family-filter-root"
    >
      <button
        type="button"
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-bg-primary)] border border-[var(--color-border-subtle)] rounded text-xs font-mono hover:bg-[var(--color-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        data-testid="feature-family-filter-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-[var(--color-text-muted)] uppercase tracking-wide text-[10px]">
          {label}:
        </span>
        <span data-testid="feature-family-filter-summary">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
      </button>

      {open && !disabled && (
        <div
          className="absolute z-10 mt-1 w-56 rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] shadow-lg"
          data-testid="feature-family-filter-menu"
          role="listbox"
        >
          <div className="px-2 py-1 border-b border-[var(--color-border-subtle)] flex items-center justify-between text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            <button
              type="button"
              className="hover:underline"
              onClick={() => onChange(new Set(FEATURE_FAMILIES))}
              data-testid="feature-family-filter-select-all"
            >
              Select all
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() => onChange(new Set())}
              data-testid="feature-family-filter-clear"
            >
              Clear
            </button>
          </div>
          <ul className="py-1 max-h-64 overflow-y-auto">
            {FEATURE_FAMILIES.map((family) => {
              const isOn = selected.has(family);
              return (
                <li key={family}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    className="w-full flex items-center gap-2 px-2 py-1 text-xs font-mono hover:bg-[var(--color-bg-hover)] text-left"
                    onClick={() => {
                      const next = new Set(selected);
                      if (isOn) {
                        next.delete(family);
                      } else {
                        next.add(family);
                      }
                      onChange(next);
                    }}
                    data-testid={`feature-family-filter-option-${family}`}
                  >
                    <span className="w-3.5 h-3.5 flex items-center justify-center">
                      {isOn ? (
                        <Check className="h-3.5 w-3.5 text-[var(--color-accent-green)]" />
                      ) : null}
                    </span>
                    <span>{family}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default FeatureFamilyFilter;
