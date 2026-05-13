/**
 * TreasuryTab — per-client treasury attribution view.
 *
 * Plan: wallet_treasury_client_flow_2026_05_10.md Phase 6.C.
 *
 * Reads from deployment-api:
 *   GET /api/clients/{client_id}/treasury   (Phase 6.A)
 *   GET /api/clients/{client_id}/subscriptions  (Phase 6.B)
 *
 * Layout:
 *   - Header: client_id + onboarding_state badge + NAV
 *   - Subscriptions table: archetype | share class | allocation_pct | active/suspended
 *   - Allocations table: archetype | amount_usd | decision_event_id
 *   - Custody pings: per-source status (green/red) + last ping timestamp + balance_usd
 *   - Post-trade history: recent TradeSettledSummary row
 *   - Withdrawal request button → dialog → POST WithdrawalRequestedEvent
 *   - HWM summary section: crystallization cadence placeholder (Phase 9 seed)
 *
 * Default client: "demo" (overridable via client ID input).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchClientSubscriptions,
  fetchClientTreasury,
  postWithdrawalRequest,
} from "../api/treasury";
import type {
  AllocationDecision,
  ClientSubscriptions,
  ClientTreasury,
  CustodyPingResult,
  ShareClassSubscription,
  TreasurySourceAttribution,
} from "../api/treasury";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtPct(val: string): string {
  const n = parseFloat(val);
  if (isNaN(n)) return val + "%";
  return n.toFixed(1) + "%";
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Onboarding state badge variant
// ---------------------------------------------------------------------------

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "pending"
  | "running"
  | "info"
  | "outline";

function onboardingBadgeVariant(state: string): BadgeVariant {
  switch (state) {
    case "LIVE":
      return "success";
    case "SUBSCRIBED":
    case "DEPOSITED":
      return "info";
    case "KYC_SUBMITTED":
    case "KYC_APPROVED":
      return "pending";
    case "SUSPENDED":
      return "error";
    default:
      return "default";
  }
}

// ---------------------------------------------------------------------------
// Withdrawal dialog
// ---------------------------------------------------------------------------

interface WithdrawalDialogProps {
  clientId: string;
  open: boolean;
  onClose: () => void;
}

function WithdrawalDialog({ clientId, open, onClose }: WithdrawalDialogProps) {
  const [source, setSource] = useState("DEFI_HOT_WALLET");
  const [amountUsd, setAmountUsd] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [requestId, setRequestId] = useState("");

  const handleSubmit = useCallback(async () => {
    setStatus("submitting");
    setErrorMsg("");
    try {
      const resp = await postWithdrawalRequest(clientId, {
        treasury_source: source,
        amount_usd: amountUsd,
        destination_address: destination,
        operator_note: note,
      });
      setRequestId(resp.request_id);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [clientId, source, amountUsd, destination, note]);

  const handleClose = () => {
    setStatus("idle");
    setErrorMsg("");
    setRequestId("");
    setAmountUsd("");
    setDestination("");
    setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <div data-testid="withdrawal-dialog">
        <DialogHeader onClose={handleClose}>
          <DialogTitle>Request Withdrawal</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="text-xs text-[var(--color-text-secondary)] mb-3">
            Submit a withdrawal request for client{" "}
            <strong>{clientId}</strong>. Amounts above threshold require 2-of-N
            operator approval.
          </p>

          {status === "success" ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-[var(--color-accent-green)]">
                Withdrawal request submitted.
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Request ID: <code>{requestId}</code>
              </p>
              <Button onClick={handleClose} className="w-full mt-2">
                Close
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="wd-source">Treasury Source</Label>
                <select
                  id="wd-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border-primary)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                >
                  <option value="DEFI_HOT_WALLET">DEFI_HOT_WALLET</option>
                  <option value="SUB_ACCOUNT_HYPERLIQUID">
                    SUB_ACCOUNT_HYPERLIQUID
                  </option>
                  <option value="SUB_ACCOUNT_DRIFT">SUB_ACCOUNT_DRIFT</option>
                  <option value="COPPER" disabled>
                    COPPER (June-1)
                  </option>
                  <option value="CEFFU" disabled>
                    CEFFU (June-1)
                  </option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="wd-amount">Amount (USD)</Label>
                <Input
                  id="wd-amount"
                  placeholder="e.g. 10000.00"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wd-dest">Destination Address</Label>
                <Input
                  id="wd-dest"
                  placeholder="0x… or on-chain address"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wd-note">Operator Note (optional)</Label>
                <Input
                  id="wd-note"
                  placeholder="Reason or context"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {status === "error" && (
                <p className="text-xs text-[var(--color-accent-red)]">
                  {errorMsg}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={
                    status === "submitting" || !amountUsd || !destination
                  }
                  className="flex-1"
                  data-testid="withdrawal-submit-btn"
                >
                  {status === "submitting" ? "Submitting…" : "Submit Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Subscriptions table
// ---------------------------------------------------------------------------

function SubscriptionsTable({
  subscriptions,
}: {
  subscriptions: ShareClassSubscription[];
}) {
  if (subscriptions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No subscriptions.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
            <th className="text-left py-2 pr-4">Archetype</th>
            <th className="text-left py-2 pr-4">Share Class</th>
            <th className="text-right py-2 pr-4">Allocation</th>
            <th className="text-right py-2 pr-4">Max DD Gate</th>
            <th className="text-center py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => (
            <tr
              key={`${sub.archetype_id}-${sub.share_class_id}`}
              className="border-b border-[var(--color-border-primary)]/30 text-[var(--color-text-primary)]"
            >
              <td className="py-2 pr-4 font-mono text-xs">
                {sub.archetype_id}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                {sub.share_class_id}
              </td>
              <td className="py-2 pr-4 text-right">
                {fmtPct(sub.allocation_pct)}
              </td>
              <td className="py-2 pr-4 text-right">
                {fmtPct(sub.max_drawdown_for_suspension_pct)}
              </td>
              <td className="py-2 text-center">
                {sub.is_active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="warning">Suspended</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocations table
// ---------------------------------------------------------------------------

function AllocationsTable({
  allocations,
}: {
  allocations: AllocationDecision[];
}) {
  if (allocations.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        No allocations.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
            <th className="text-left py-2 pr-4">Archetype</th>
            <th className="text-left py-2 pr-4">Share Class</th>
            <th className="text-right py-2 pr-4">Allocated (USD)</th>
            <th className="text-right py-2">Decided At</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((a) => (
            <tr
              key={a.archetype_id}
              className="border-b border-[var(--color-border-primary)]/30 text-[var(--color-text-primary)]"
            >
              <td className="py-2 pr-4 font-mono text-xs">{a.archetype_id}</td>
              <td className="py-2 pr-4 font-mono text-xs">
                {a.share_class_id}
              </td>
              <td className="py-2 pr-4 text-right font-semibold">
                {fmtUsd(a.allocation_amount_usd)}
              </td>
              <td className="py-2 text-right text-xs text-[var(--color-text-secondary)]">
                {fmtTime(a.decided_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custody pings grid
// ---------------------------------------------------------------------------

function CustodyPingsGrid({ pings }: { pings: CustodyPingResult[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {pings.map((ping) => (
        <div
          key={ping.source}
          className={`rounded-lg border p-3 ${
            ping.is_reachable
              ? "border-[var(--color-accent-green)]/40 bg-[var(--color-status-success-bg)]"
              : "border-[var(--color-accent-red)]/40 bg-[var(--color-status-error-bg)]"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">
              {ping.source}
            </span>
            <Badge variant={ping.is_reachable ? "success" : "error"}>
              {ping.is_reachable ? "OK" : "UNREACHABLE"}
            </Badge>
          </div>
          {ping.is_reachable ? (
            <>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                {fmtUsd(ping.balance_usd)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                {fmtTime(ping.as_of_timestamp)} · {ping.latency_ms}ms
              </p>
            </>
          ) : (
            <p className="text-xs text-[var(--color-accent-red)] mt-1">
              {ping.error_message || "Unreachable"}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attribution table
// ---------------------------------------------------------------------------

function AttributionTable({
  attribution,
}: {
  attribution: TreasurySourceAttribution[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-border-primary)] text-[var(--color-text-secondary)]">
            <th className="text-left py-2 pr-4">Source</th>
            <th className="text-right py-2 pr-4">Source NAV</th>
            <th className="text-right py-2 pr-4">Client Share %</th>
            <th className="text-right py-2">Client Share USD</th>
          </tr>
        </thead>
        <tbody>
          {attribution.map((row) => (
            <tr
              key={row.source}
              className="border-b border-[var(--color-border-primary)]/30 text-[var(--color-text-primary)]"
            >
              <td className="py-2 pr-4 font-mono text-xs">{row.source}</td>
              <td className="py-2 pr-4 text-right">
                {fmtUsd(row.source_nav_usd)}
              </td>
              <td className="py-2 pr-4 text-right">
                {fmtPct(row.client_share_pct)}
              </td>
              <td className="py-2 text-right font-semibold">
                {fmtUsd(row.client_share_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main TreasuryTab component
// ---------------------------------------------------------------------------

export function TreasuryTab() {
  const [clientId, setClientId] = useState("demo");
  const [inputId, setInputId] = useState("demo");
  const [treasury, setTreasury] = useState<ClientTreasury | null>(null);
  const [_subscriptions, setSubscriptions] =
    useState<ClientSubscriptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const [t, s] = await Promise.all([
        fetchClientTreasury(id),
        fetchClientSubscriptions(id),
      ]);
      setTreasury(t);
      setSubscriptions(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(clientId);
  }, [clientId, loadData]);

  const handleLookup = () => {
    const trimmed = inputId.trim();
    if (trimmed) setClientId(trimmed);
  };

  const onboardingState =
    _subscriptions?.onboarding_state ?? "—";

  return (
    <div className="space-y-6 p-4" data-testid="treasury-tab">
      {/* Client ID input */}
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor="treasury-client-id">Client ID</Label>
          <Input
            id="treasury-client-id"
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="e.g. demo"
            className="max-w-xs"
          />
        </div>
        <Button onClick={handleLookup} disabled={loading}>
          {loading ? "Loading…" : "Load"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-accent-red)]/40 bg-[var(--color-status-error-bg)] px-4 py-3 text-sm text-[var(--color-accent-red)]">
          {error}
        </div>
      )}

      {treasury && (
        <>
          {/* Header: client + NAV + onboarding state */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {treasury.client_id}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    As of {fmtTime(treasury.as_of)}
                  </CardDescription>
                </div>
                <div className="text-right space-y-1">
                  <p
                    className="text-2xl font-bold text-[var(--color-text-primary)]"
                    data-testid="treasury-nav-usd"
                  >
                    {fmtUsd(treasury.nav_usd)}
                  </p>
                  <Badge variant={onboardingBadgeVariant(onboardingState)}>
                    {onboardingState}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Subscriptions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Share-Class Subscriptions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SubscriptionsTable subscriptions={treasury.subscriptions} />
            </CardContent>
          </Card>

          {/* Allocations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Archetype Allocations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AllocationsTable allocations={treasury.allocations} />
            </CardContent>
          </Card>

          {/* Custody pings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Custody Pings</CardTitle>
            </CardHeader>
            <CardContent>
              <CustodyPingsGrid pings={treasury.custody_ping_results} />
            </CardContent>
          </Card>

          {/* Treasury source attribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Treasury Source Attribution
              </CardTitle>
              <CardDescription className="text-xs">
                Client share per custody source. Sum of Client Share USD should
                equal NAV ({fmtUsd(treasury.nav_usd)}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AttributionTable attribution={treasury.treasury_attribution} />
            </CardContent>
          </Card>

          {/* Post-trade history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Recent Post-Trade Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {treasury.last_settled ? (
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                      {treasury.last_settled.trade_id}
                    </span>
                    <Badge
                      variant={
                        treasury.last_settled.side === "buy" ? "info" : "warning"
                      }
                    >
                      {treasury.last_settled.side.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {treasury.last_settled.archetype_id} @{" "}
                      {treasury.last_settled.venue}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
                    <span>
                      Qty:{" "}
                      <strong>{treasury.last_settled.quantity}</strong>
                    </span>
                    <span>
                      Fill:{" "}
                      <strong>
                        {fmtUsd(treasury.last_settled.fill_price)}
                      </strong>
                    </span>
                    <span
                      className={
                        parseFloat(treasury.last_settled.pnl_usd) >= 0
                          ? "text-[var(--color-accent-green)]"
                          : "text-[var(--color-accent-red)]"
                      }
                    >
                      PnL:{" "}
                      <strong>{fmtUsd(treasury.last_settled.pnl_usd)}</strong>
                    </span>
                    <span>
                      Settled:{" "}
                      <strong>
                        {fmtTime(treasury.last_settled.settled_at)}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No recent trades.
                </p>
              )}
            </CardContent>
          </Card>

          {/* HWM ledger placeholder */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                HWM Ledger &amp; Crystallization
              </CardTitle>
              <CardDescription className="text-xs">
                Per-share-class HWM snapshots + crystallization timeline. Demo
                seed wired in Phase 9.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-secondary)] italic">
                HWM ledger rendering deferred to Phase 9 demo seed. UTL
                HWMCrystallizer ships Phase 5.G (utl@3815477d).
              </p>
            </CardContent>
          </Card>

          {/* Withdrawal request */}
          <div className="flex justify-end">
            <Button
              onClick={() => setWithdrawalOpen(true)}
              data-testid="withdrawal-request-btn"
            >
              Request Withdrawal
            </Button>
          </div>
        </>
      )}

      <WithdrawalDialog
        clientId={clientId}
        open={withdrawalOpen}
        onClose={() => setWithdrawalOpen(false)}
      />
    </div>
  );
}
