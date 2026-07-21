/**
 * Shared chip colour palette — the 5-tone vocabulary every status/kind/health badge across the
 * Deployments surface renders with. Lifted out of `Deployments.tsx` (per
 * deployment_ui_date_range_filter_and_search_2026_07_20's shared-primitives extraction) so
 * `StatusFilterChips` (and any future consumer, e.g. WS-5's alerts-page rebuild) can import the
 * same tone→class mapping without duplicating it.
 */
export type ChipTone = "green" | "yellow" | "red" | "gray" | "blue";

export const TONE_CLASSES: Record<ChipTone, string> = {
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  yellow: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  red: "bg-red-500/15 text-red-400 border-red-500/40",
  gray: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
  blue: "bg-cyan-500/15 text-cyan-400 border-cyan-500/40",
};
