import { AlertTriangle, ListTree, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DistinctValuesResponse } from "../api/client";
import { fetchDistinctValues } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const ASSET_GROUP_OPTIONS = ["defi", "cefi", "tradfi", "sports", "prediction"];

/** The four axes the endpoint enumerates, in display order. */
const AXIS_ORDER = ["venues", "instrument_types", "data_types", "chains"] as const;
type AxisKey = (typeof AXIS_ORDER)[number];

const AXIS_LABELS: Record<AxisKey, string> = {
  venues: "Venues",
  instrument_types: "Instrument types",
  data_types: "Data types",
  chains: "Chains",
};

/** Shared classes so the native `<select>` visually matches the rest of the panel. */
const SELECT_CLASSNAME =
  "select-compact flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

/**
 * "Distinct Values" — the RAW distinct-values enumeration surface
 * (`cefi_consolidated_closeout_2026_07_18` "Re-add the 'data status'
 * enumeration to deployment-ui/api"), consuming
 * `GET /data-status/distinct-values/{asset_group}` (deployment-api
 * `routes/data_status/_distinct_values.py`).
 *
 * For a given asset_group it lists every DISTINCT RAW value present on each of
 * the four axes (venues / instrument_types / data_types / chains), straight off
 * the nightly honest-coverage `coverage.json` rollup — deliberately un-collapsed.
 * Each value carries a server-computed `is_canonical` flag (exact,
 * case-sensitive membership in the UAC SSOT sets); a NON-canonical value gets a
 * clear "non-canonical" badge so an operator can eyeball naming drift /
 * duplication at a glance (e.g. `AAVE` / `AAVE_V3`, `lending` vs `LENDING`,
 * `dex_pools` vs `dex_pool_state`, `HYPERLIQUID` vs `HYPERLIQUID_L1`).
 *
 * This is a distinct surface from the `AxisValueCensus` panel: the census reads
 * the live manifest with row counts and INFERS likely duplicates client-side,
 * whereas this panel takes the backend's authoritative canonical verdict.
 */
export function DistinctValuesPanel() {
  const [assetGroup, setAssetGroup] = useState("defi");
  const [data, setData] = useState<DistinctValuesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDistinctValues({ asset_group: assetGroup });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load distinct values");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [assetGroup]);

  useEffect(() => {
    void load();
  }, [load]);

  const axes = data?.axes;
  const presentAxes = AXIS_ORDER.filter((axis) => (axes?.[axis]?.length ?? 0) > 0);

  return (
    <Card data-testid="distinct-values-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListTree className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Distinct Values</CardTitle>
              <CardDescription className="text-xs">
                Every distinct raw value per axis from the honest-coverage rollup — non-canonical values (naming drift /
                duplication) are badged.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-testid="distinct-values-refresh"
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
            <label htmlFor="dv-asset-group" className="text-[10px] uppercase text-[var(--color-text-muted)] block">
              Asset group
            </label>
            <select
              id="dv-asset-group"
              className={SELECT_CLASSNAME}
              value={assetGroup}
              onChange={(ev) => setAssetGroup(ev.target.value)}
              data-testid="distinct-values-asset-group-select"
            >
              {ASSET_GROUP_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {data && (
            <p className="text-[10px] text-[var(--color-text-muted)]" data-testid="distinct-values-source">
              {data.source} · {data.source_date}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="distinct-values-error">
            {error}
          </div>
        )}
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : presentAxes.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="distinct-values-empty">
            No distinct values available for this asset group.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="distinct-values-grid">
            {presentAxes.map((axis) => {
              const values = axes?.[axis] ?? [];
              const nonCanon = data?.non_canonical_count[axis] ?? 0;
              return (
                <div key={axis} data-testid={`distinct-values-axis-${axis}`}>
                  <div className="flex items-center gap-1.5 pb-1">
                    <span className="text-xs font-medium">{AXIS_LABELS[axis]}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">({values.length})</span>
                    {nonCanon > 0 && (
                      <Badge
                        variant="warning"
                        className="text-[8px]"
                        title={`${nonCanon} non-canonical value${nonCanon === 1 ? "" : "s"} on this axis`}
                        data-testid={`distinct-values-noncanon-count-${axis}`}
                      >
                        {nonCanon} non-canonical
                      </Badge>
                    )}
                  </div>
                  <div className="overflow-y-auto max-h-[16rem] rounded-md border border-[var(--color-border-subtle)]">
                    <table className="w-full text-xs">
                      <tbody>
                        {values.map((row) => (
                          <tr
                            key={row.value}
                            className="border-b border-[var(--color-border-subtle)] last:border-0"
                            data-testid={`distinct-values-row-${axis}-${row.value}`}
                          >
                            <td className="py-1 pl-2 pr-2 font-mono">
                              <span className="inline-flex items-center gap-1.5">
                                {row.value}
                                {!row.is_canonical && (
                                  <Badge
                                    variant="warning"
                                    className="gap-1 px-1 py-0 text-[8px]"
                                    title="Not a member of the UAC canonical set for this axis — likely naming drift / duplication"
                                    data-testid={`distinct-values-noncanon-${axis}-${row.value}`}
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                                    non-canonical
                                  </Badge>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
