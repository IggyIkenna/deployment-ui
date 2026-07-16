/**
 * Per-asset-group breakdowns accordion for the Data Status panel.
 *
 * Phase 3 of data_status_multi_axis_shard_propagation_2026_05_06.plan
 * — first deliverable for the multi-axis-shard rollout.
 *
 * Design principle ("deliver-with-empty-data"):
 *
 *   Every axis declared in the UAC SHARD_AXIS_MATRIX SSOT for this
 *   (service, asset_group) pair MUST render, even when the backend
 *   manifest hasn't yet populated the column. An axis with `{}` from the
 *   API surfaces as a header + "no data yet" placeholder rather than
 *   being hidden — that way the operator sees the EXPECTED shape across
 *   all 15 services before the Phase 1 writers catch up. The data fills
 *   in behind the existing UI as writers ship.
 *
 * Empty values collapse under the synthetic `__legacy__` key in the API
 * payload (covers pre-Phase-1B ML/strategy/execution rows that wrote
 * `job_id=""`); the UI labels them "(legacy)" so the operator can
 * distinguish from rows that were genuinely written under a job_id.
 */

import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useState } from "react";

import { canonicalInstrumentTypeLabel } from "../lib/data-status-helpers";

interface BreakdownsAccordionProps {
  /**
   * Axes returned by /api/config/shard-axis-matrix breakdown_axes for
   * (service, asset_group). Drives the rendered axis order; an axis
   * appearing here but missing from `breakdowns` (or with `{}`) renders
   * as a "no data yet" placeholder.
   */
  axes: readonly string[];
  /**
   * Per-axis value -> count map from /api/data-status/coverage-summary
   * `breakdowns`. Empty `{}` for an axis === axis is declared in SSOT
   * but writers haven't populated it yet.
   */
  breakdowns: Record<string, Record<string, number>>;
  /**
   * Optional: short heading shown above the axis list.
   */
  title?: string;
  /**
   * Optional: when set, clicking a value emits a callback so the parent
   * can wire the selection to a `secondary_axis` query against
   * /api/data-status/manifest. Phase 3 surfaces this for DEFI chain +
   * sports league + strategy job_id; other axes stay display-only.
   */
  onSelectValue?: (axis: string, value: string) => void;
}

const HUMAN_AXIS_LABELS: Record<string, string> = {
  chain: "Chain",
  data_type: "Data type",
  instrument_type: "Instrument type",
  instrument_id: "Instrument",
  league_id: "League",
  fixture_id: "Fixture",
  feature_group: "Feature group",
  timeframe: "Timeframe",
  model_family: "Model family",
  training_period: "Training period",
  strategy_id: "Strategy",
  client_id: "Client",
  instruction_type: "Instruction type",
  job_id: "Job (experiment run)",
  protocol_id: "Protocol",
  archetype: "Archetype",
  asset_group: "Asset group",
  source: "Source",
  canonical_question_group: "Question group",
  venue: "Venue",
};

function formatAxisLabel(axis: string): string {
  return HUMAN_AXIS_LABELS[axis] ?? axis.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Human display label for a breakdown value. AXIS-AWARE:
 *
 *   - The synthetic empty-value sentinel `__legacy__` only means "pre-job_id"
 *     on the `job_id` axis (ML/strategy/execution rows that wrote `job_id=""`).
 *     On every other axis (instrument_type / data_type / …) a blank is simply
 *     an unlabeled value → "(unlabeled)".
 *   - `instrument_type` values are canonicalised to their UPPERCASE UAC
 *     `InstrumentType` for display (spot → SPOT_PAIR, …); unmapped values are
 *     returned verbatim.
 *
 * DISPLAY ONLY — the raw `value` remains the manifest secondary-axis query key
 * (shard-atom identity) and is surfaced on hover. Plan P4-A.
 */
function formatValueLabel(axis: string, value: string): string {
  if (value === "__legacy__") {
    return axis === "job_id" ? "(legacy — pre-job_id)" : "(unlabeled)";
  }
  if (axis === "instrument_type") {
    return canonicalInstrumentTypeLabel(value);
  }
  return value;
}

export function BreakdownsAccordion({ axes, breakdowns, title, onSelectValue }: BreakdownsAccordionProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (axes.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]">
      {title ? (
        <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <Layers className="h-4 w-4" />
          {title}
        </div>
      ) : null}
      <ul className="divide-y divide-[var(--color-border-default)]">
        {axes.map((axis) => {
          const values = breakdowns[axis] ?? {};
          const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
          const total = entries.reduce((acc, [, v]) => acc + v, 0);
          const isOpen = open[axis] ?? false;
          const empty = entries.length === 0;
          return (
            <li key={axis} className="px-4 py-2">
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [axis]: !prev[axis] }))}
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2 text-sm">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-[var(--color-text-muted)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                  )}
                  <span className="font-medium text-[var(--color-text-secondary)]">{formatAxisLabel(axis)}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{axis}</span>
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {empty
                    ? "no data yet"
                    : `${entries.length} value${entries.length === 1 ? "" : "s"} · ${total.toLocaleString()} rows`}
                </span>
              </button>
              {isOpen && empty ? (
                <p className="mt-2 ml-6 text-xs italic text-[var(--color-text-muted)]">
                  This axis is declared in the SSOT for this asset group but the manifest hasn&apos;t populated it yet
                  (Phase&nbsp;1 writer work). Data will fill in here automatically once the writer for this service
                  ships.
                </p>
              ) : null}
              {isOpen && !empty ? (
                <ul className="mt-2 ml-6 space-y-1">
                  {entries.map(([value, count]) => {
                    const clickable = !!onSelectValue && value !== "__legacy__";
                    const Tag = clickable ? "button" : "div";
                    const displayLabel = formatValueLabel(axis, value);
                    // Raw manifest value on hover whenever the display label
                    // differs (canonicalised type / relabelled sentinel), so
                    // the operator can always read the underlying shard-atom
                    // query key. Plan P4-A.
                    const rawOnHover = displayLabel !== value ? `raw: ${value}` : undefined;
                    return (
                      <li key={value}>
                        <Tag
                          {...(clickable
                            ? {
                                type: "button" as const,
                                onClick: () => onSelectValue?.(axis, value),
                              }
                            : {})}
                          className={
                            "flex w-full items-center justify-between text-left text-xs " +
                            (clickable ? "rounded px-2 py-1 hover:bg-[var(--color-bg-secondary)]" : "px-2 py-1")
                          }
                        >
                          <span
                            title={rawOnHover}
                            className={
                              value === "__legacy__"
                                ? "italic text-[var(--color-text-muted)]"
                                : "text-[var(--color-text-secondary)]"
                            }
                          >
                            {displayLabel}
                          </span>
                          <span className="font-mono text-[var(--color-text-muted)]">{count.toLocaleString()}</span>
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
