import { Loader2, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PredictionCatalogueRow } from "../api/client";
import { fetchPredictionCatalogue } from "../api/client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const PAGE_SIZE = 25;

/** Shared classes so the native `<select>`s visually match `Input`/Radix `Select`. */
const SELECT_CLASSNAME =
  "select-compact flex h-8 w-full rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50";

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/**
 * Prediction-market "Catalogue" browser — category `<select>` (crypto/
 * politics/sports/weather/entertainment/financial/other, driven by
 * `category_counts`) narrows a `canonical_question_group` sub-filter (driven
 * by `cqg_counts`), plus free-text search over label/instrument_id, into a
 * paginated table of human-readable markets. Mirrors `LifecycleCards.tsx`'s
 * `useX(...)` + loading/error/empty pattern. Plan
 * data_status_page_ux_and_canonicalisation_2026_07_16 P3.
 */
export function PredictionCatalogueCard() {
  const [category, setCategory] = useState("");
  const [cqg, setCqg] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<PredictionCatalogueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [cqgCounts, setCqgCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Accumulates `canonical_question_group -> category` across every response
  // seen this session, from the rows themselves. `cqg_counts` is computed
  // server-side over the venue+search-filtered set only (NOT category-scoped
  // — see deployment-api services/prediction_catalogue.py), so this is how
  // the cqg sub-filter narrows to cqgs that actually belong to the selected
  // category instead of showing every cqg regardless of category.
  const cqgCategoryMapRef = useRef<Record<string, string>>({});

  // Debounce the free-text search box so each keystroke doesn't fire a
  // request; category/cqg select changes are discrete and fetch immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPredictionCatalogue({
        category: category || undefined,
        canonical_question_group: cqg || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setRows(data.rows);
      setTotal(data.total);
      setCategoryCounts(data.category_counts);
      setCqgCounts(data.cqg_counts);
      for (const row of data.rows) {
        cqgCategoryMapRef.current[row.canonical_question_group] = row.category;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prediction catalogue");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, cqg, search, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryOptions = useMemo(
    () => Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b)),
    [categoryCounts],
  );

  // Not memoized (cheap — bounded by the number of distinct cqgs): must
  // re-derive on every render since `rows` mutating `cqgCategoryMapRef` is
  // not itself a dependency `useMemo` can track.
  const cqgCategoryMap = cqgCategoryMapRef.current;
  const cqgOptions = Object.entries(cqgCounts)
    .filter(([group]) => !category || cqgCategoryMap[group] === category || !(group in cqgCategoryMap))
    .sort(([a], [b]) => a.localeCompare(b));

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setCqg("");
    setOffset(0);
  };

  const handleCqgChange = (value: string) => {
    setCqg(value);
    setOffset(0);
  };

  const rangeLabel = total === 0 ? "0 of 0" : `${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}`;

  return (
    <Card data-testid="prediction-catalogue-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--color-accent-cyan)]" />
            <div>
              <CardTitle className="text-base">Prediction catalogue</CardTitle>
              <CardDescription className="text-xs">
                Browse the live prediction-market catalogue by category / canonical question group.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            data-testid="prediction-catalogue-refresh"
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
          <div className="space-y-1 min-w-[10rem]">
            <Label htmlFor="pc-category" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Category
            </Label>
            <select
              id="pc-category"
              className={SELECT_CLASSNAME}
              value={category}
              onChange={(ev) => handleCategoryChange(ev.target.value)}
              data-testid="prediction-catalogue-category-select"
            >
              <option value="">All categories ({sumCounts(categoryCounts)})</option>
              {categoryOptions.map(([cat, count]) => (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 min-w-[12rem]">
            <Label htmlFor="pc-cqg" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Question group
            </Label>
            <select
              id="pc-cqg"
              className={SELECT_CLASSNAME}
              value={cqg}
              onChange={(ev) => handleCqgChange(ev.target.value)}
              data-testid="prediction-catalogue-cqg-select"
            >
              <option value="">All question groups</option>
              {cqgOptions.map(([group, count]) => (
                <option key={group} value={group}>
                  {group} ({count})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 min-w-[12rem] flex-1">
            <Label htmlFor="pc-search" className="text-[10px] uppercase text-[var(--color-text-muted)]">
              Search
            </Label>
            <Input
              id="pc-search"
              className="h-8 text-xs"
              placeholder="Search label or instrument id…"
              value={searchInput}
              onChange={(ev) => setSearchInput(ev.target.value)}
              data-testid="prediction-catalogue-search"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="text-sm text-[var(--color-accent-red)] mb-2" data-testid="prediction-catalogue-error">
            {error}
          </div>
        )}
        {loading && rows.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]" data-testid="prediction-catalogue-empty">
            No prediction markets match the current filters.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[24rem] overflow-y-auto pr-1">
              <table className="w-full text-xs" data-testid="prediction-catalogue-table">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)]">
                    <th className="py-1.5 pr-2 font-medium">Label</th>
                    <th className="py-1.5 pr-2 font-medium">Venue</th>
                    <th className="py-1.5 pr-2 font-medium">Category</th>
                    <th className="py-1.5 pr-2 font-medium">Resolves</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.instrument_id}
                      className="border-b border-[var(--color-border-subtle)] last:border-0"
                      data-testid={`prediction-catalogue-row-${row.instrument_id}`}
                    >
                      <td className="py-1.5 pr-2 max-w-[24rem]">
                        <div className="font-medium truncate" title={row.label}>
                          {row.label}
                        </div>
                        <div
                          className="text-[10px] text-[var(--color-text-muted)] font-mono truncate"
                          title={row.instrument_id}
                        >
                          {row.instrument_id}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {row.venue}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {row.category}
                          </Badge>
                          {row.mvp && (
                            <Badge variant="outline" className="text-[8px] font-mono">
                              MVP
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-[10px]">{row.available_to || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2 text-[10px] text-[var(--color-text-muted)]">
              <span data-testid="prediction-catalogue-page-info">{rangeLabel}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  data-testid="prediction-catalogue-prev"
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset + rows.length >= total || loading}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  data-testid="prediction-catalogue-next"
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
