import { CalendarClock, CalendarPlus, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CatalogueLifecycleRow } from "../api/client";
import { fetchNewListings, fetchUpcomingExpiries } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type LifecycleKind = "new-listings" | "upcoming-expiries";

// Mirrors CatalogueExplorer's PAGE_SIZE — both endpoints now paginate (F10,
// 2026-07-18): the previous unbounded response (e.g. list_new_listings(30) ==
// 644,380 rows) read all 5 per-AG catalogues serially and exceeded the Cloud
// Run / browser fetch timeout -> 500 "Unknown error".
const PAGE_SIZE = 25;

/**
 * Loads new-listings/upcoming-expiries rows for a given threshold + page. The
 * `kind` discriminator (a stable literal, not a function prop) avoids
 * re-fetch loops from unstable callback identities across parent re-renders.
 */
function useLifecycleRows(kind: LifecycleKind, threshold: number) {
  const [rows, setRows] = useState<CatalogueLifecycleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A threshold change invalidates the current page (a narrower/wider window
  // shifts which rows exist at all) — reset to the first page.
  useEffect(() => {
    setOffset(0);
  }, [kind, threshold]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page =
        kind === "new-listings"
          ? await fetchNewListings({ max_age_days: threshold, limit: PAGE_SIZE, offset })
          : await fetchUpcomingExpiries({ within_days: threshold, limit: PAGE_SIZE, offset });
      setRows(page.rows);
      setTotal(page.total_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [kind, threshold, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, total, offset, setOffset, loading, error, reload: load };
}

interface LifecycleCardProps {
  kind: LifecycleKind;
  testIdPrefix: string;
  icon: typeof CalendarPlus;
  title: string;
  description: string;
  thresholdLabel: string;
  defaultThreshold: number;
  minThreshold: number;
  maxThreshold: number;
  dateField: "available_from" | "available_to";
  emptyMessage: string;
}

function LifecycleCard({
  kind,
  testIdPrefix,
  icon: Icon,
  title,
  description,
  thresholdLabel,
  defaultThreshold,
  minThreshold,
  maxThreshold,
  dateField,
  emptyMessage,
}: LifecycleCardProps) {
  const [threshold, setThreshold] = useState(defaultThreshold);
  const { rows, total, offset, setOffset, loading, error, reload } = useLifecycleRows(kind, threshold);
  const rangeLabel = total === 0 ? "0 of 0" : `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`;

  return (
    <Card data-testid={`${testIdPrefix}-card`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            disabled={loading}
            data-testid={`${testIdPrefix}-refresh`}
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
          <div className="space-y-1">
            <Label
              htmlFor={`${testIdPrefix}-threshold`}
              className="text-[10px] uppercase text-[var(--color-text-muted)]"
            >
              {thresholdLabel}
            </Label>
            <Input
              id={`${testIdPrefix}-threshold`}
              type="number"
              min={minThreshold}
              max={maxThreshold}
              className="h-8 w-24 text-xs font-mono"
              value={threshold}
              onChange={(ev) =>
                setThreshold(Math.max(minThreshold, Math.min(maxThreshold, Number(ev.target.value) || minThreshold)))
              }
              data-testid={`${testIdPrefix}-threshold-input`}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid={`${testIdPrefix}-error`}>
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid={`${testIdPrefix}-empty`}>
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[20rem] overflow-y-auto pr-1">
            {rows.map((row) => (
              <div
                key={row.instrument_id}
                className="rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2 text-xs"
                data-testid={`${testIdPrefix}-row-${row.instrument_id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] truncate min-w-0" title={row.instrument_id}>
                    {row.instrument_id}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.mvp && (
                      <Badge variant="outline" className="text-[8px] font-mono">
                        MVP
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] font-mono">
                      {row[dateField] || "—"}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-[var(--color-text-muted)]">
                  <span>{row.venue || "—"}</span>
                  {row.chain && (
                    <>
                      <span>·</span>
                      <span>{row.chain}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{row.instrument_type || "—"}</span>
                  {row.available_from_is_venue_first_day && (
                    <>
                      <span>·</span>
                      <span
                        className="text-amber-600"
                        data-testid={`${testIdPrefix}-venue-first-day-${row.instrument_id}`}
                        title={
                          "This date is the earliest the catalogue holds for this venue, so it may reflect when the " +
                          "pipeline first captured the venue rather than a real listing date. The venue declared no " +
                          "listing date, so the catalogue fell back to first-observed."
                        }
                      >
                        ⚠ listing date unconfirmed
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <div className="flex items-center justify-between pt-2 text-[10px] text-[var(--color-text-muted)]">
            <span data-testid={`${testIdPrefix}-page-info`}>{rangeLabel}</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0 || loading}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                data-testid={`${testIdPrefix}-prev`}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + rows.length >= total || loading}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                data-testid={`${testIdPrefix}-next`}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** New listings — instruments whose catalogue `available_from` falls within the threshold window. */
export function NewListingsCard() {
  return (
    <LifecycleCard
      kind="new-listings"
      testIdPrefix="new-listings"
      icon={CalendarPlus}
      title="New listings"
      description="Instruments newly available (catalogue available_from within the threshold)."
      thresholdLabel="New if listed within (days)"
      defaultThreshold={30}
      minThreshold={1}
      maxThreshold={365}
      dateField="available_from"
      emptyMessage="No new listings in range."
    />
  );
}

/** Upcoming expiries — FUTURE/OPTION/COMBO instruments whose catalogue `available_to` falls within the threshold window. */
export function UpcomingExpiriesCard() {
  return (
    <LifecycleCard
      kind="upcoming-expiries"
      testIdPrefix="upcoming-expiries"
      icon={CalendarClock}
      title="Upcoming expiries"
      description="FUTURE/OPTION/COMBO instruments expiring within the threshold (catalogue available_to)."
      thresholdLabel="Expiring within (days)"
      defaultThreshold={7}
      minThreshold={1}
      maxThreshold={365}
      dateField="available_to"
      emptyMessage="No upcoming expiries in range."
    />
  );
}
