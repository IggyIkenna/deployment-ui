/**
 * ServiceEmissionStateBadge — 4-state colour-coded badge for the v8 manifest
 * column ``service_emission_state`` (writegate slice (b) / Phase 4.UI).
 *
 * Closed-set values mirror UAC ``ServiceEmissionStateEnum`` (SSOT lives in
 * Python at ``unified_api_contracts.canonical.crosscutting.service_emission_state``):
 *
 *   * ``PUBLISHED_OK``               — green, healthy publish.
 *   * ``PUBLISHED_DEGRADED``         — yellow/amber, gap admitted by permissive policy.
 *   * ``STALE_DATA_HEARTBEAT_ONLY``  — orange, no metric row published, consumer-skip.
 *   * ``BLOCKED``                    — red, publish-time policy withheld.
 *   * ``null`` / ``undefined``       — muted ``—`` placeholder (forward-compat
 *                                     for pre-Phase-4 manifest rows that
 *                                     haven't been migrated yet).
 *
 * Distinct from ``captureStatusBadgeVariant`` / ``captureStatusBadgeColor``
 * (which surface the 4-state ``capture_status`` column — separate axis).
 *
 * The two badges render side-by-side in the data-status drilldown; both are
 * row-level manifest signals but they answer different questions:
 *
 *   * ``capture_status`` — "did the writer succeed at writing real data here?"
 *   * ``service_emission_state`` — "did the publish-side emission policy accept
 *     this row as healthy, degraded, stale, or blocked?"
 */
import { type ReactElement } from "react";

import type { ServiceEmissionState } from "../api/client";

interface ServiceEmissionStateBadgeProps {
  state: ServiceEmissionState | null | undefined;
  /**
   * ``compact`` (default ``false``) renders an even-smaller inline pill
   * suitable for table rows; the default renders a slightly larger pill
   * suitable for drilldown headers.
   */
  compact?: boolean;
}

interface BadgePalette {
  bg: string;
  fg: string;
  border: string;
  label: string;
}

/**
 * Returns the colour palette + display label for a closed-set state value
 * (or the muted placeholder palette when state is null/undefined).
 *
 * Exported for unit testing — the renderer below consumes the result via
 * the standard call site.
 */
export function serviceEmissionStatePalette(
  state: ServiceEmissionState | null | undefined,
): BadgePalette {
  switch (state) {
    case "PUBLISHED_OK":
      return {
        bg: "#10b98122",
        fg: "#10b981",
        border: "#10b981",
        label: "PUBLISHED_OK",
      };
    case "PUBLISHED_DEGRADED":
      return {
        bg: "#f59e0b22",
        fg: "#f59e0b",
        border: "#f59e0b",
        label: "PUBLISHED_DEGRADED",
      };
    case "STALE_DATA_HEARTBEAT_ONLY":
      return {
        bg: "#f9731622",
        fg: "#f97316",
        border: "#f97316",
        label: "STALE_DATA",
      };
    case "BLOCKED":
      return {
        bg: "#ef444422",
        fg: "#ef4444",
        border: "#ef4444",
        label: "BLOCKED",
      };
    default:
      // null / undefined / unexpected — render muted "—".
      return {
        bg: "transparent",
        fg: "var(--color-text-muted)",
        border: "var(--color-border-subtle)",
        label: "—",
      };
  }
}

export function ServiceEmissionStateBadge({
  state,
  compact = false,
}: ServiceEmissionStateBadgeProps): ReactElement {
  const palette = serviceEmissionStatePalette(state);
  const sizeClass = compact
    ? "px-1 py-0 text-[9px]"
    : "px-1.5 py-0.5 text-[10px]";
  // Tooltip mirrors the closed-set semantics from the UAC enum docstring so
  // operators hovering the pill see the manifest-read protocol without
  // hunting through codex.
  const tooltip = state
    ? `service_emission_state=${state}`
    : "service_emission_state not set (pre-v8 manifest row)";
  return (
    <span
      role="status"
      aria-label={`service emission state: ${palette.label}`}
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded border font-mono ${sizeClass}`}
      style={{
        backgroundColor: palette.bg,
        color: palette.fg,
        borderColor: palette.border,
      }}
      data-testid="service-emission-state-badge"
      data-state={state ?? "null"}
    >
      {palette.label}
    </span>
  );
}
