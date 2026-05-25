/**
 * Data Status redesign — Phase-1 spike.
 *
 * Miller-columns / pivot navigation over the live hierarchical drilldown
 * (`/data-status/drilldown`). One column per shard axis; click a value to pin
 * it (re-fetches the deeper level), click again to unpin. Coverage bars are
 * real `capture_status` rollups from the local backend. Wired at
 * `/data-status-redesign`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  assetGroupsFor,
  fetchAxisMatrix,
  fetchDrilldownLevel,
  type AxisValueCell,
  type CellStats,
} from "./dataStatusModel";
import type { ShardAxisMatrixResponse } from "../../api/client";

const SERVICES = [
  "instruments-service",
  "market-tick-data-service",
  "market-data-processing-service",
  "features-service",
  "strategy-service",
  "execution-service",
];

const DEFAULT_START = "2026-04-25";
const DEFAULT_END = "2026-05-24";

function coverageTone(coverage: number): string {
  const pct = coverage * 100;
  if (pct >= 95) return "var(--color-accent-green)";
  if (pct >= 80) return "var(--color-accent-amber)";
  return "var(--color-accent-red)";
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** True for fetch aborts (StrictMode double-invoke / rapid re-select) — not real errors. */
function isAbort(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name: string }).name === "AbortError"
  );
}

/** One Miller column: the list of values for `axis` given pinned ancestors. */
function AxisColumn(props: {
  axis: string;
  cells: AxisValueCell[];
  pinnedValue: string | undefined;
  loading: boolean;
  onPick: (axis: string, value: string) => void;
}) {
  const { axis, cells, pinnedValue, loading, onPick } = props;
  const [filter, setFilter] = useState("");
  const shown = filter
    ? cells.filter((c) => c.value.toLowerCase().includes(filter.toLowerCase()))
    : cells;
  return (
    <div
      style={{
        minWidth: 220,
        maxWidth: 280,
        borderRight: "1px solid var(--color-border-subtle)",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-secondary)",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: "0.05em",
        }}
      >
        <span>{axis}</span>
        {pinnedValue ? (
          <span
            style={{
              fontSize: 9.5,
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--color-accent-dim)",
              color: "var(--color-accent-cyan)",
            }}
          >
            PINNED
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--color-text-muted)" }}>{cells.length}</span>
      </div>
      {cells.length > 12 ? (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          style={{
            margin: "6px 10px",
            padding: "4px 8px",
            fontSize: 12,
            background: "var(--color-bg-tertiary)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 4,
            color: "var(--color-text-primary)",
          }}
        />
      ) : null}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <div
            style={{
              padding: 14,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            Loading…
          </div>
        ) : null}
        {!loading && shown.length === 0 ? (
          <div
            style={{
              padding: 14,
              fontSize: 12,
              color: "var(--color-text-muted)",
            }}
          >
            No values
          </div>
        ) : null}
        {shown.map((c) => {
          const active = pinnedValue === c.value;
          const pct = c.stats.coverage * 100;
          return (
            <button
              key={c.value}
              onClick={() => onPick(axis, c.value)}
              title={`${c.value}: ${pct.toFixed(1)}% · ${fmt(c.stats.total)} shards`}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "7px 12px",
                border: "none",
                borderBottom: "1px solid var(--color-border-subtle)",
                background: active ? "var(--color-accent-dim)" : "transparent",
                color: "var(--color-text-primary)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                  }}
                >
                  {c.value}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: coverageTone(c.stats.coverage),
                  }}
                >
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div
                style={{
                  height: 3,
                  background: "var(--color-bg-tertiary)",
                  borderRadius: 2,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: coverageTone(c.stats.coverage),
                    borderRadius: 2,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DataStatusRedesignPage() {
  const [service, setService] = useState("market-tick-data-service");
  const [matrix, setMatrix] = useState<ShardAxisMatrixResponse | null>(null);
  const [assetGroup, setAssetGroup] = useState("cefi");
  const [axes, setAxes] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [cells, setCells] = useState<AxisValueCell[]>([]);
  const [totals, setTotals] = useState<CellStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the axis matrix when the service changes.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchAxisMatrix(service, ctrl.signal)
      .then((m) => {
        setMatrix(m);
        const ags = assetGroupsFor(m, service);
        setAssetGroup((prev) =>
          ags.includes(prev) ? prev : (ags[0] ?? "cefi"),
        );
      })
      .catch((e: unknown) => {
        if (!isAbort(e)) setError(String(e));
      });
    return () => ctrl.abort();
  }, [service]);

  // Re-fetch the drilldown level whenever service/ag/selections change.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchDrilldownLevel({
      service,
      assetGroup,
      start: DEFAULT_START,
      end: DEFAULT_END,
      filters: selections,
      expandToDepth: 1,
      signal: ctrl.signal,
    })
      .then((res) => {
        setAxes(res.axes);
        setCells(res.cells);
        setTotals(res.totals);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e)) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [service, assetGroup, selections]);

  const pinnedAxes = useMemo(
    () => axes.filter((a) => selections[a] != null),
    [axes, selections],
  );
  const firstUnpinned = useMemo(
    () => axes.find((a) => selections[a] == null),
    [axes, selections],
  );

  const onPick = useCallback(
    (axis: string, value: string) => {
      setSelections((prev) => {
        const next = { ...prev };
        if (next[axis] === value) {
          // Unpin this axis and everything below it.
          const idx = axes.indexOf(axis);
          for (const a of axes) {
            if (axes.indexOf(a) >= idx) delete next[a];
          }
        } else {
          next[axis] = value;
        }
        return next;
      });
    },
    [axes],
  );

  const tone = totals
    ? coverageTone(totals.coverage)
    : "var(--color-text-muted)";

  return (
    <main style={{ padding: "16px 24px", maxWidth: 1920, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Data Status{" "}
          <span style={{ color: "var(--color-accent-cyan)" }}>· redesign</span>
        </h1>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Miller-columns spike · live drilldown · {DEFAULT_START} →{" "}
          {DEFAULT_END}
        </span>
      </div>

      {/* Service + asset-group pickers */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
      >
        <select
          value={service}
          onChange={(e) => {
            setService(e.target.value);
            setSelections({});
          }}
          style={{
            padding: "6px 10px",
            background: "var(--color-bg-tertiary)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {(matrix ? assetGroupsFor(matrix, service) : []).map((ag) => (
            <button
              key={ag}
              onClick={() => {
                setAssetGroup(ag);
                setSelections({});
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 4,
                border: "1px solid",
                borderColor:
                  ag === assetGroup
                    ? "var(--color-accent-cyan)"
                    : "var(--color-border-default)",
                background:
                  ag === assetGroup ? "var(--color-accent-dim)" : "transparent",
                color:
                  ag === assetGroup
                    ? "var(--color-accent-cyan)"
                    : "var(--color-text-secondary)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
            >
              {ag}
            </button>
          ))}
        </div>
      </div>

      {/* Totals summary */}
      {totals ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "10px 14px",
            marginBottom: 12,
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 6,
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color: tone,
            }}
          >
            {(totals.coverage * 100).toFixed(1)}%
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {fmt(totals.captured)} captured · {fmt(totals.empty_confirmed)}{" "}
            empty · {fmt(totals.attempted_failed)} failed · {fmt(totals.total)}{" "}
            shards
          </span>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: 12,
            color: "var(--color-accent-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Miller columns */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: 6,
          minHeight: 420,
          background: "var(--color-bg-primary)",
        }}
      >
        {pinnedAxes.map((axis) => (
          <AxisColumn
            key={axis}
            axis={axis}
            cells={
              selections[axis] != null
                ? [
                    {
                      axis,
                      value: selections[axis] as string,
                      stats: {
                        captured: 0,
                        empty_confirmed: 0,
                        attempted_failed: 0,
                        total: 0,
                        coverage: 1,
                        status: "captured",
                      },
                      isLeaf: false,
                      rowKey: {},
                    },
                  ]
                : []
            }
            pinnedValue={selections[axis]}
            loading={false}
            onPick={onPick}
          />
        ))}
        {firstUnpinned ? (
          <AxisColumn
            axis={firstUnpinned}
            cells={cells}
            pinnedValue={undefined}
            loading={loading}
            onPick={onPick}
          />
        ) : (
          <div
            style={{
              padding: 20,
              color: "var(--color-text-muted)",
              fontSize: 13,
            }}
          >
            All axes pinned — leaf shard selected.
          </div>
        )}
      </div>
    </main>
  );
}
