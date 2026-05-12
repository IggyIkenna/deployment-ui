/**
 * ClientReportingTab — NAV / PnL / Positions / Attribution charts.
 *
 * Phase 5 of client_reporting_pnl_attribution_mvp_2026_05_10.md.
 *
 * Reads from the 4 Phase-4 client-reporting-api endpoints:
 *   GET /api/v1/clients/{client_id}/nav
 *   GET /api/v1/clients/{client_id}/pnl
 *   GET /api/v1/clients/{client_id}/positions
 *   GET /api/v1/clients/{client_id}/attribution
 *
 * Default client: "demo" (overridable via the client ID input).
 * 5.C2 (HWM crystallization) is deferred — depends on
 * wallet_treasury_client_flow_2026_05_10 Phase 4.C.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAttribution,
  fetchNav,
  fetchPnL,
  fetchPositions,
} from "../api/clientReporting";
import type {
  AttributionRow,
  NavSnapshot,
  PnLEntry,
  Position,
} from "../api/clientReporting";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// ---------------------------------------------------------------------------
// Chart data transforms
// ---------------------------------------------------------------------------

interface NavDatum {
  date: string;
  nav_usd: number;
}

interface PnLDatum {
  period: string;
  strategy: number;
  execution: number;
  total: number;
}

interface AttributionDatum {
  factor: string;
  STRATEGY: number;
  EXECUTION: number;
}

function toNavData(snapshots: NavSnapshot[]): NavDatum[] {
  return snapshots
    .map((s) => ({ date: s.date, nav_usd: parseFloat(s.nav_usd) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toPnLData(entries: PnLEntry[]): PnLDatum[] {
  return entries
    .map((e) => ({
      period: e.period_tag,
      strategy: parseFloat(e.strategy_alpha_total) || 0,
      execution: parseFloat(e.execution_alpha_total) || 0,
      total: parseFloat(e.total_pnl) || 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function toAttributionData(rows: AttributionRow[]): AttributionDatum[] {
  const acc: Record<string, { STRATEGY: number; EXECUTION: number }> = {};
  for (const row of rows) {
    const factor = row.factor ?? "UNKNOWN";
    const layer = row.layer ?? "STRATEGY";
    const amount = parseFloat(String(row.amount ?? 0)) || 0;
    if (!acc[factor]) acc[factor] = { STRATEGY: 0, EXECUTION: 0 };
    if (layer === "STRATEGY") acc[factor].STRATEGY += amount;
    else if (layer === "EXECUTION") acc[factor].EXECUTION += amount;
  }
  return Object.entries(acc).map(([factor, vals]) => ({ factor, ...vals }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionError({ msg }: { msg: string }) {
  return (
    <p className="text-sm text-[var(--color-accent-red)] px-4 py-3">{msg}</p>
  );
}

function SectionLoading() {
  return (
    <p className="text-sm text-[var(--color-text-secondary)] px-4 py-3 animate-pulse">
      Loading…
    </p>
  );
}

// NAV time-series chart
function NavChart({ snapshots }: { snapshots: NavSnapshot[] }) {
  const data = toNavData(snapshots);
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] px-4 py-2">
        No NAV data available.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(v) => [`$${Number(v ?? 0).toLocaleString()}`, "NAV"]}
        />
        <Line
          type="monotone"
          dataKey="nav_usd"
          stroke="var(--color-accent-blue)"
          strokeWidth={2}
          dot={false}
          name="NAV (USD)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// PnL stacked bar chart
function PnLChart({ entries }: { entries: PnLEntry[] }) {
  const data = toPnLData(entries);
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] px-4 py-2">
        No PnL data available.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip formatter={(v) => [`$${Number(v ?? 0).toLocaleString()}`]} />
        <Legend />
        <Bar
          dataKey="strategy"
          stackId="pnl"
          fill="var(--color-accent-green)"
          name="Strategy α"
        />
        <Bar
          dataKey="execution"
          stackId="pnl"
          fill="var(--color-accent-blue)"
          name="Execution α"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Attribution waterfall stacked bar
function AttributionChart({
  rows,
  selectedFactor,
  onSelectFactor,
}: {
  rows: AttributionRow[];
  selectedFactor: string | null;
  onSelectFactor: (f: string | null) => void;
}) {
  const data = toAttributionData(rows);
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] px-4 py-2">
        No attribution data available.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
        onClick={(payload) => {
          if (payload?.activeLabel) {
            const clicked = payload.activeLabel as string;
            onSelectFactor(clicked === selectedFactor ? null : clicked);
          }
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="factor" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip formatter={(v) => [`$${Number(v ?? 0).toLocaleString()}`]} />
        <Legend />
        <Bar
          dataKey="STRATEGY"
          stackId="a"
          fill="var(--color-accent-green)"
          name="Strategy layer"
        />
        <Bar
          dataKey="EXECUTION"
          stackId="a"
          fill="var(--color-accent-amber)"
          name="Execution layer"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Per-leg drilldown table
function DrilldownTable({
  rows,
  filterFactor,
}: {
  rows: AttributionRow[];
  filterFactor: string | null;
}) {
  const filtered = filterFactor
    ? rows.filter((r) => r.factor === filterFactor)
    : rows;
  if (filtered.length === 0)
    return (
      <p className="text-sm text-[var(--color-text-secondary)] px-4 py-2">
        {filterFactor
          ? `No rows for factor "${filterFactor}".`
          : "No attribution rows."}
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {[
              "date",
              "strategy_id",
              "instrument_id",
              "factor",
              "layer",
              "amount",
              "venue",
            ].map((h) => (
              <th
                key={h}
                className="text-left px-2 py-1.5 font-medium text-[var(--color-text-secondary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.slice(0, 50).map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--color-border)]/40 hover:bg-[var(--color-bg-secondary)]"
            >
              <td className="px-2 py-1">{row.date ?? "—"}</td>
              <td className="px-2 py-1">{row.strategy_id ?? "—"}</td>
              <td className="px-2 py-1">{row.instrument_id ?? "—"}</td>
              <td className="px-2 py-1">
                <Badge variant="outline" className="text-xs">
                  {row.factor ?? "—"}
                </Badge>
              </td>
              <td className="px-2 py-1">{row.layer ?? "—"}</td>
              <td className="px-2 py-1 tabular-nums">
                ${Number(row.amount ?? 0).toLocaleString()}
              </td>
              <td className="px-2 py-1">{row.venue ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length > 50 && (
        <p className="text-xs text-[var(--color-text-secondary)] px-4 py-1">
          Showing first 50 of {filtered.length} rows.
        </p>
      )}
    </div>
  );
}

// Positions table
function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)] px-4 py-2">
        No open positions.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {[
              "venue",
              "instrument",
              "qty",
              "mark_price",
              "cost_basis",
              "unrealized_pnl",
              "archetype",
            ].map((h) => (
              <th
                key={h}
                className="text-left px-2 py-1.5 font-medium text-[var(--color-text-secondary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const upnl = parseFloat(p.unrealized_pnl) || 0;
            return (
              <tr
                key={i}
                className="border-b border-[var(--color-border)]/40 hover:bg-[var(--color-bg-secondary)]"
              >
                <td className="px-2 py-1">{p.venue}</td>
                <td className="px-2 py-1 font-mono">{p.instrument}</td>
                <td className="px-2 py-1 tabular-nums">{p.qty}</td>
                <td className="px-2 py-1 tabular-nums">
                  ${parseFloat(p.mark_price).toLocaleString()}
                </td>
                <td className="px-2 py-1 tabular-nums">
                  ${parseFloat(p.cost_basis).toLocaleString()}
                </td>
                <td
                  className={`px-2 py-1 tabular-nums ${upnl >= 0 ? "text-[var(--color-accent-green)]" : "text-[var(--color-accent-red)]"}`}
                >
                  ${upnl.toLocaleString()}
                </td>
                <td className="px-2 py-1">{p.archetype_id ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main tab
// ---------------------------------------------------------------------------

export function ClientReportingTab() {
  const [clientId, setClientId] = useState("demo");
  const [inputValue, setInputValue] = useState("demo");

  const [navData, setNavData] = useState<NavSnapshot[] | null>(null);
  const [pnlData, setPnlData] = useState<PnLEntry[] | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [attributionRows, setAttributionRows] = useState<
    AttributionRow[] | null
  >(null);

  const [navError, setNavError] = useState<string | null>(null);
  const [pnlError, setPnlError] = useState<string | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [attrError, setAttrError] = useState<string | null>(null);

  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);

  const reload = useCallback((cid: string) => {
    setNavData(null);
    setPnlData(null);
    setPositions(null);
    setAttributionRows(null);
    setNavError(null);
    setPnlError(null);
    setPosError(null);
    setAttrError(null);
    setSelectedFactor(null);

    fetchNav(cid)
      .then((r) => setNavData(r.snapshots))
      .catch((e: unknown) =>
        setNavError(e instanceof Error ? e.message : String(e)),
      );

    fetchPnL(cid)
      .then((r) => setPnlData(r.entries))
      .catch((e: unknown) =>
        setPnlError(e instanceof Error ? e.message : String(e)),
      );

    fetchPositions(cid)
      .then((r) => setPositions(r.positions))
      .catch((e: unknown) =>
        setPosError(e instanceof Error ? e.message : String(e)),
      );

    fetchAttribution(cid)
      .then((r) => setAttributionRows(r.rows))
      .catch((e: unknown) =>
        setAttrError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  useEffect(() => {
    reload(clientId);
  }, [clientId, reload]);

  return (
    <div className="space-y-6" data-testid="client-reporting-tab">
      {/* Client selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Reporting</CardTitle>
          <CardDescription>
            NAV, PnL, positions, and attribution for a client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <Label htmlFor="cr-client-id" className="text-xs mb-1 block">
                Client ID
              </Label>
              <Input
                id="cr-client-id"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setClientId(inputValue.trim());
                }}
                placeholder="demo"
                className="h-8 text-sm font-mono"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setClientId(inputValue.trim())}
              className="h-8"
            >
              Load
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NAV time-series — 5.A */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">NAV Time-Series</CardTitle>
          <CardDescription className="text-xs">
            Client: {clientId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {navError ? (
            <SectionError msg={navError} />
          ) : navData === null ? (
            <SectionLoading />
          ) : (
            <NavChart snapshots={navData} />
          )}
        </CardContent>
      </Card>

      {/* PnL waterfall — 5.B */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Daily PnL (Strategy α + Execution α)
          </CardTitle>
          <CardDescription className="text-xs">
            Stacked by alpha component
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {pnlError ? (
            <SectionError msg={pnlError} />
          ) : pnlData === null ? (
            <SectionLoading />
          ) : (
            <PnLChart entries={pnlData} />
          )}
        </CardContent>
      </Card>

      {/* Attribution waterfall + drilldown — 5.B / 5.C */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">PnL Attribution Waterfall</CardTitle>
          <CardDescription className="text-xs">
            By factor × layer — click a bar to filter the drilldown table
            {selectedFactor && (
              <span className="ml-2">
                <Badge variant="outline" className="text-xs">
                  {selectedFactor}
                </Badge>
                <button
                  className="ml-1 text-[var(--color-accent-blue)] hover:underline"
                  onClick={() => setSelectedFactor(null)}
                >
                  clear
                </button>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {attrError ? (
            <SectionError msg={attrError} />
          ) : attributionRows === null ? (
            <SectionLoading />
          ) : (
            <>
              <AttributionChart
                rows={attributionRows}
                selectedFactor={selectedFactor}
                onSelectFactor={setSelectedFactor}
              />
              <div className="mt-4 border-t border-[var(--color-border)]">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] px-4 pt-3 pb-1">
                  Per-leg detail{" "}
                  {selectedFactor ? `— ${selectedFactor}` : "(all factors)"}
                </p>
                <DrilldownTable
                  rows={attributionRows}
                  filterFactor={selectedFactor}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Positions — 5.C */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Open Positions</CardTitle>
          <CardDescription className="text-xs">
            Current snapshot (MVP: mock data — real feed in Phase 8)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {posError ? (
            <SectionError msg={posError} />
          ) : positions === null ? (
            <SectionLoading />
          ) : (
            <PositionsTable positions={positions} />
          )}
        </CardContent>
      </Card>

      {/* HWM crystallization placeholder — 5.C2 */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            HWM Crystallization Timeline
            <Badge variant="outline" className="text-xs">
              Deferred — Phase 5.C2
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Depends on wallet_treasury_client_flow_2026_05_10 Phase 4.C
            (FeeRecognitionRow emit). Will show HWM-vs-NAV chart with
            crystallization-event markers once that plan lands.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
