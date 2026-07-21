import { useCallback, useState } from "react";

/** The active explicit column sort, or `null` for the table's own default ordering. */
export interface ColumnSort<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

/**
 * Generic click-to-sort state machine for a sortable table header — a header click cycles its
 * column asc → desc → back to the table's default ordering (`sort === null`). Column-key-type-
 * generic so any sortable table can reuse it (lifted out of `Deployments.tsx` where it was local
 * to `DeploymentMatrix`, per deployment_ui_date_range_filter_and_search_2026_07_20's shared-
 * primitives extraction — WS-5's alerts-page rebuild consumes this instead of re-implementing it).
 */
export function useColumnSort<K extends string>() {
  const [sort, setSort] = useState<ColumnSort<K> | null>(null);
  const onHeaderClick = useCallback((key: K | undefined) => {
    if (!key) return;
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);
  return { sort, onHeaderClick };
}
