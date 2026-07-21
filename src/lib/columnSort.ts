/**
 * Generic sortable-table column comparator — item-type- and column-key-type-generic so any table
 * with a "click a header to sort, nulls-last, tie-break by the table's own default ordering"
 * contract can reuse it, rather than re-implementing the same null-handling per page. Lifted out
 * of `Deployments.tsx` (per deployment_ui_date_range_filter_and_search_2026_07_20's shared-
 * primitives extraction — WS-5's alerts-page rebuild consumes this instead of duplicating it).
 *
 * - `columnValue` maps an item + column key to its comparable value (number/string), or `null`
 *   when that column doesn't apply to this row — nulls ALWAYS sort last, regardless of `dir`.
 * - `defaultCmp` breaks ties (both values equal, or both null) using the table's own semantic
 *   default ordering.
 * - `forceLast`, when supplied, overrides everything else: any item where it returns `true` sorts
 *   after every item where it returns `false`, before the column/default comparison even runs —
 *   for rows that are exempt from an active sort criterion entirely (e.g. Deployments' always-on
 *   kinds while a date-range filter is active).
 */
export function compareByColumn<T, K extends string>(
  a: T,
  b: T,
  key: K,
  dir: "asc" | "desc",
  columnValue: (item: T, key: K) => string | number | null,
  defaultCmp: (a: T, b: T) => number,
  forceLast?: (item: T) => boolean,
): number {
  if (forceLast) {
    const aLast = forceLast(a);
    const bLast = forceLast(b);
    if (aLast !== bLast) return aLast ? 1 : -1;
  }
  const av = columnValue(a, key);
  const bv = columnValue(b, key);
  if (av === null || bv === null) {
    if (av === null && bv === null) return defaultCmp(a, b);
    return av === null ? 1 : -1; // nulls always last, regardless of direction
  }
  const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
  if (c === 0) return defaultCmp(a, b);
  return dir === "asc" ? c : -c;
}
