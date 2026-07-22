import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AxisValueCount, AxisValueCensus as AxisValueCensusResponse } from "../api/client";
import { fetchAxisValueCensus } from "../api/client";
import { canonicalInstrumentTypeLabel } from "../lib/data-status-helpers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const ASSET_GROUP_OPTIONS = ["cefi", "tradfi", "defi", "sports", "prediction"];

const AXIS_LABELS: Record<string, string> = {
  venue: "Venue",
  chain: "Chain",
  instrument_type: "Instrument type",
  data_type: "Data type",
};

const AXIS_ORDER = ["venue", "chain", "instrument_type", "data_type"];

/** Shared classes so the native `<select>` visually matches the rest of the panel. */
const SELECT_CLASSNAME =
  "select-compact flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Groups an axis's raw values by a "same real thing?" key so the panel can
 * flag likely non-canonical duplicates. Only ``instrument_type`` has a known
 * canonicalisation map (``canonicalInstrumentTypeLabel`` — display-only alias
 * table already used by ``BreakdownsAccordion``); every other axis groups by
 * identity (no flagging), since folding e.g. venue/chain strings without a
 * real registry would risk FALSE positives (two genuinely different venues
 * that happen to share a prefix).
 */
function groupKeyFor(axis: string, rawValue: string): string {
  if (axis === "instrument_type") {
    // Uppercase the result too: an unmapped value falls through
    // ``canonicalInstrumentTypeLabel`` verbatim in its already-lowercased
    // form (e.g. "spot_pair"), while a MAPPED value returns the alias
    // table's uppercase canonical spelling (e.g. "spot" -> "SPOT_PAIR") —
    // without this both would land in different-cased, non-matching
    // groups even though they're the same real value.
    return canonicalInstrumentTypeLabel(rawValue.toLowerCase()).toUpperCase();
  }
  return rawValue;
}

function likelyDuplicateValues(axis: string, values: AxisValueCount[]): Set<string> {
  const byGroup = new Map<string, string[]>();
  for (const { value } of values) {
    const key = groupKeyFor(axis, value);
    const bucket = byGroup.get(key);
    if (bucket) {
      bucket.push(value);
    } else {
      byGroup.set(key, [value]);
    }
  }
  const flagged = new Set<string>();
  for (const bucket of byGroup.values()) {
    if (bucket.length > 1) {
      for (const value of bucket) flagged.add(value);
    }
  }
  return flagged;
}

/**
 * "Axis Value Census" — the non-canonical-naming / duplication detector
 * (Track-6 restoration, 2026-07-18: ``cefi_consolidated_closeout_2026_07_18.md``
 * "Re-add the 'data status' enumeration to deployment-ui/api").
 *
 * Lists every DISTINCT RAW value + row count present in the manifest per
 * axis (venue / chain / instrument_type / data_type) for a (service,
 * asset_group), straight off ``GET /data-status/axis-value-census`` — which
 * reads ``read_availability_index`` directly (NOT the identity catalogue
 * behind the Catalogue Explorer's filter dropdowns, and NOT canonicalised
 * like the hierarchical drilldown or the Instrument Coverage Summary). Two
 * raw spellings of one real value (``spot`` / ``SPOT_PAIR``) show up as two
 * separate rows — that is the point: this is the durable surface for
 * spotting exactly that kind of drift.
 */
export function AxisValueCensus({ service = "instruments-service" }: { service?: string }) {
  const [assetGroup, setAssetGroup] = useState("cefi");
  const [census, setCensus] = useState<AxisValueCensusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAxisValueCensus({ service, asset_group: assetGroup });
      setCensus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load axis value census");
      setCensus(null);
    } finally {
      setLoading(false);
    }
  }, [service, assetGroup]);

  useEffect(() => {
    void load();
  }, [load]);

  const axes = census?.axes ?? {};
  const presentAxes = AXIS_ORDER.filter((axis) => axis in axes);

  return (
    <Card data-testid="axis-value-census-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Axis Value Census</CardTitle>
              <CardDescription className="text-xs">
                Distinct raw values per axis, straight off the manifest — the non-canonical-naming / duplication
                detector.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-testid="axis-value-census-refresh"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1 min-w-[8rem]">
            <label htmlFor="avc-asset-group" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Asset group
            </label>
            <select
              id="avc-asset-group"
              className={SELECT_CLASSNAME}
              value={assetGroup}
              onChange={(ev) => setAssetGroup(ev.target.value)}
              data-testid="axis-value-census-asset-group-select"
            >
              {ASSET_GROUP_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="axis-value-census-error">
            {error}
          </div>
        )}
        {loading && !census ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : presentAxes.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="axis-value-census-empty">
            No axis data available for this (service, asset_group).
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="axis-value-census-grid">
            {presentAxes.map((axis) => {
              const values = axes[axis] ?? [];
              const flagged = likelyDuplicateValues(axis, values);
              const truncated = census?.truncated_axes.includes(axis) ?? false;
              return (
                <div key={axis} data-testid={`axis-value-census-axis-${axis}`}>
                  <div className="flex items-center gap-1.5 pb-1">
                    <span className="text-xs font-medium">{AXIS_LABELS[axis] ?? axis}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">({values.length})</span>
                    {truncated && (
                      <Badge variant="outline" className="text-[8px]" title="Only the top 200 values are shown">
                        truncated
                      </Badge>
                    )}
                  </div>
                  {values.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)]">No non-blank values captured yet.</p>
                  ) : (
                    <div className="overflow-y-auto max-h-[16rem] rounded-md border border-[var(--color-border-subtle)]">
                      <table className="w-full text-xs">
                        <tbody>
                          {values.map((row) => (
                            <tr
                              key={row.value}
                              className="border-b border-[var(--color-border-subtle)] last:border-0"
                              data-testid={`axis-value-census-row-${axis}-${row.value}`}
                            >
                              <td className="py-1 pl-2 pr-2 font-mono">
                                <span className="inline-flex items-center gap-1">
                                  {row.value}
                                  {flagged.has(row.value) && (
                                    <span
                                      data-testid={`axis-value-census-dup-flag-${axis}-${row.value}`}
                                      title="Possible non-canonical duplicate — other raw values on this axis map to the same canonical form"
                                    >
                                      <AlertTriangle
                                        className="h-3 w-3 text-[var(--color-accent-amber)]"
                                        aria-label="Possible non-canonical duplicate"
                                      />
                                    </span>
                                  )}
                                </span>
                              </td>
                              <td className="py-1 pr-2 text-right text-[var(--color-text-muted)]">{row.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
