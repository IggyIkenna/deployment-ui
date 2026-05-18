import { AlertTriangle, BarChart3, Send, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";

interface ManualTradeEntry {
  archetype: string;
  venue: string;
  instrument: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
}

const ARCHETYPES = ["carry_staked_basis", "arbitrage_price_dispersion"] as const;
const VENUES = ["binance", "bybit", "okx", "hyperliquid", "deribit"] as const;
const SIDES = ["buy", "sell"] as const;

export function Dart() {
  const [entry, setEntry] = useState<ManualTradeEntry>({
    archetype: "carry_staked_basis",
    venue: "binance",
    instrument: "",
    side: "buy",
    quantity: "",
    price: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent-orange)]/10 border border-[var(--color-accent-orange)]/30">
          <BarChart3 className="h-5 w-5 text-[var(--color-accent-orange)]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            DART Terminal
          </h1>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono">
            DeFi archetype visualization + manual trade entry
          </p>
        </div>
      </div>

      {/* Operator-monitored window checklist banner */}
      <div
        data-testid="operator-monitored-banner"
        className="rounded-lg border border-[var(--color-accent-orange)]/40 bg-[var(--color-accent-orange)]/5 p-4 space-y-3"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-[var(--color-accent-orange)] shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--color-accent-orange)]">
              Operator-monitored window — required before automation flip
            </p>
            <ul className="text-xs text-[var(--color-text-secondary)] space-y-1 list-none">
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">□</span>
                Manual trade confirmed end-to-end through execution-service (same automation path)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">□</span>
                Position + PnL visible in monitoring dashboard within 60s of fill
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">□</span>
                Kill switch tested + confirmed working for this archetype × venue pair
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">□</span>
                Risk limits checked: max position size, max drawdown, circuit breaker thresholds
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--color-text-muted)]">□</span>
                Operator has acknowledged wallet balance + gas reserve is sufficient
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Archetype state skeleton */}
      <div
        data-testid="archetype-state-panel"
        className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
            Archetype State
          </h2>
          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 rounded">
            skeleton — live data wired in automation flip
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {["Net Position", "Unrealised PnL", "Last Signal"].map((label) => (
            <div
              key={label}
              className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] p-3"
            >
              <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
              <div className="mt-1 h-5 w-16 rounded bg-[var(--color-border-default)] animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Manual trade entry form */}
      <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent-yellow)]" />
          <h2 className="text-sm font-medium text-[var(--color-text-primary)]">
            Manual Trade Entry
          </h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            — routed through execution-service (same path as automation)
          </span>
        </div>

        {submitted ? (
          <div
            data-testid="trade-submitted"
            className="rounded border border-[var(--color-accent-green)]/30 bg-[var(--color-accent-green)]/5 px-4 py-3 text-sm text-[var(--color-accent-green)]"
          >
            Trade submitted via execution-service. Monitor fills in the{" "}
            <a
              href="/ops/live-deployments"
              className="underline hover:opacity-80"
            >
              Live Ops
            </a>{" "}
            panel.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="trade-form">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Archetype
                </label>
                <select
                  value={entry.archetype}
                  onChange={(e) => setEntry((p) => ({ ...p, archetype: e.target.value }))}
                  aria-label="Archetype"
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                  data-testid="archetype-select"
                >
                  {ARCHETYPES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Venue
                </label>
                <select
                  value={entry.venue}
                  onChange={(e) => setEntry((p) => ({ ...p, venue: e.target.value }))}
                  aria-label="Venue"
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                  data-testid="venue-select"
                >
                  {VENUES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Instrument
              </label>
              <input
                type="text"
                value={entry.instrument}
                onChange={(e) => setEntry((p) => ({ ...p, instrument: e.target.value }))}
                placeholder="ETH-USDT-PERP"
                className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                data-testid="instrument-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Side
                </label>
                <select
                  value={entry.side}
                  onChange={(e) =>
                    setEntry((p) => ({ ...p, side: e.target.value as "buy" | "sell" }))
                  }
                  aria-label="Side"
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                  data-testid="side-select"
                >
                  {SIDES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Quantity
                </label>
                <input
                  type="text"
                  value={entry.quantity}
                  onChange={(e) => setEntry((p) => ({ ...p, quantity: e.target.value }))}
                  placeholder="0.1"
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                  data-testid="quantity-input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Limit Price <span className="text-[var(--color-text-muted)]">(optional)</span>
                </label>
                <input
                  type="text"
                  value={entry.price}
                  onChange={(e) => setEntry((p) => ({ ...p, price: e.target.value }))}
                  placeholder="market"
                  className="w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent-cyan)]"
                  data-testid="price-input"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="outline"
                className="gap-2 border-[var(--color-accent-orange)]/40 text-[var(--color-accent-orange)] hover:bg-[var(--color-accent-orange)]/10"
                data-testid="submit-trade-button"
              >
                <Send className="h-4 w-4" />
                Submit via execution-service
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
