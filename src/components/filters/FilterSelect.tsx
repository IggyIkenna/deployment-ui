/**
 * Segmented filter control — a labelled `<select>` for any single-value, URL-param-backed filter
 * (mode / cloud / status / asset_group / service / ...). Lifted out of `Deployments.tsx` (per
 * deployment_ui_date_range_filter_and_search_2026_07_20's shared-primitives extraction — WS-5's
 * alerts-page rebuild consumes this instead of duplicating it). No behaviour change from the
 * original: same markup, same classes, same `data-testid` contract.
 */
export function FilterSelect({
  testId,
  label,
  value,
  options,
  onChange,
}: {
  testId: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
      {label}
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-default)] rounded px-1.5 py-1 text-xs text-[var(--color-text-primary)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
