import { useState } from "react";
import { AlertCircle, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import type { RiskRuleConsequence, RiskRuleSeverity } from "./RuleBrowser";

export type AssetGroup = "defi" | "cefi" | "tradfi" | "sports" | "prediction";

const ASSET_GROUPS: readonly AssetGroup[] = ["defi", "cefi", "tradfi", "sports", "prediction"];

export interface RuleEvalContext {
  instruction_size_usd: number;
  archetype_id: string;
  venue_id: string;
  account_id: string;
  client_id: string;
  asset_group: AssetGroup;
  current_drawdown_pct_24h: number;
  current_leverage: number;
  current_concentration_pct: number;
  funding_cost_apr_bps: number;
  gas_estimate_usd: number;
}

export type PreflightDecision = "ALLOW" | "SCALE_DOWN" | "BLOCK" | "MONITOR" | "TEST_ONLY";

export interface FiredRule {
  rule_id: string;
  consequence: RiskRuleConsequence;
  severity?: RiskRuleSeverity;
  reason?: string;
}

export interface PreflightResult {
  decision: PreflightDecision;
  scale_factor: number;
  fired_rules: FiredRule[];
  blocked_by: string[];
  composite_reason: string;
}

export interface PreflightPlaygroundProps {
  /** Override the submit handler — used by tests to mock the API. */
  submitter?: (ctx: RuleEvalContext) => Promise<PreflightResult>;
}

async function defaultSubmitter(ctx: RuleEvalContext): Promise<PreflightResult> {
  const response = await fetch("/api/risk/preflight-test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(ctx),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Preflight failed (HTTP ${response.status})${text ? `: ${text}` : ""}`);
  }
  return (await response.json()) as PreflightResult;
}

const DECISION_BADGE_CLASS: Record<PreflightDecision, string> = {
  ALLOW: "bg-[var(--color-accent-green)]/15 text-[var(--color-accent-green)] border-[var(--color-accent-green)]/30",
  SCALE_DOWN:
    "bg-[var(--color-accent-amber)]/15 text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/30",
  BLOCK: "bg-[var(--color-accent-red)]/15 text-[var(--color-accent-red)] border-[var(--color-accent-red)]/30",
  MONITOR: "bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)] border-[var(--color-accent-blue)]/30",
  TEST_ONLY: "bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)] border-[var(--color-text-muted)]/30",
};

const CONSEQUENCE_BADGE_CLASS: Record<RiskRuleConsequence, string> = {
  BLOCK: "bg-[var(--color-accent-red)]/15 text-[var(--color-accent-red)] border-[var(--color-accent-red)]/30",
  SCALE_DOWN:
    "bg-[var(--color-accent-amber)]/15 text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/30",
  MONITOR: "bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)] border-[var(--color-accent-blue)]/30",
  TEST_ONLY: "bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)] border-[var(--color-text-muted)]/30",
};

const DEFAULT_CTX: RuleEvalContext = {
  instruction_size_usd: 10000,
  archetype_id: "CARRY_STAKED_BASIS",
  venue_id: "bybit",
  account_id: "acct-prod-1",
  client_id: "internal",
  asset_group: "defi",
  current_drawdown_pct_24h: 0,
  current_leverage: 1,
  current_concentration_pct: 0,
  funding_cost_apr_bps: 0,
  gas_estimate_usd: 0,
};

interface NumberFieldProps {
  label: string;
  testId: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}

function NumberField({ label, testId, value, step, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <Input
        type="number"
        step={step ?? "any"}
        data-testid={testId}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className="h-8 text-sm"
      />
    </label>
  );
}

interface TextFieldProps {
  label: string;
  testId: string;
  value: string;
  onChange: (v: string) => void;
}

function TextField({ label, testId, value, onChange }: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <Input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </label>
  );
}

export function PreflightPlayground({ submitter }: PreflightPlaygroundProps) {
  const [ctx, setCtx] = useState<RuleEvalContext>(DEFAULT_CTX);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof RuleEvalContext>(key: K, value: RuleEvalContext[K]) =>
    setCtx((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fn = submitter ?? defaultSubmitter;
      const next = await fn(ctx);
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="preflight-playground">
      <CardHeader>
        <CardTitle className="text-base">Preflight Playground</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberField
            label="instruction_size_usd"
            testId="field-instruction-size"
            value={ctx.instruction_size_usd}
            onChange={(v) => update("instruction_size_usd", v)}
          />
          <TextField
            label="archetype_id"
            testId="field-archetype"
            value={ctx.archetype_id}
            onChange={(v) => update("archetype_id", v)}
          />
          <TextField
            label="venue_id"
            testId="field-venue"
            value={ctx.venue_id}
            onChange={(v) => update("venue_id", v)}
          />
          <TextField
            label="account_id"
            testId="field-account"
            value={ctx.account_id}
            onChange={(v) => update("account_id", v)}
          />
          <TextField
            label="client_id"
            testId="field-client"
            value={ctx.client_id}
            onChange={(v) => update("client_id", v)}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-text-secondary)]">asset_group</span>
            <select
              data-testid="field-asset-group"
              value={ctx.asset_group}
              onChange={(e) => update("asset_group", e.target.value as AssetGroup)}
              className="select-compact h-8 rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-sm"
            >
              {ASSET_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="current_drawdown_pct_24h"
            testId="field-drawdown"
            value={ctx.current_drawdown_pct_24h}
            onChange={(v) => update("current_drawdown_pct_24h", v)}
          />
          <NumberField
            label="current_leverage"
            testId="field-leverage"
            value={ctx.current_leverage}
            onChange={(v) => update("current_leverage", v)}
          />
          <NumberField
            label="current_concentration_pct"
            testId="field-concentration"
            value={ctx.current_concentration_pct}
            onChange={(v) => update("current_concentration_pct", v)}
          />
          <NumberField
            label="funding_cost_apr_bps"
            testId="field-funding"
            value={ctx.funding_cost_apr_bps}
            onChange={(v) => update("funding_cost_apr_bps", v)}
          />
          <NumberField
            label="gas_estimate_usd"
            testId="field-gas"
            value={ctx.gas_estimate_usd}
            onChange={(v) => update("gas_estimate_usd", v)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="preflight-submit"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {loading ? "Running…" : "Run preflight"}
          </Button>
        </div>
        {error && (
          <div
            data-testid="preflight-error"
            className="flex items-start gap-2 rounded-md border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-3 text-sm text-[var(--color-accent-red)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div
            data-testid="preflight-result"
            className="space-y-3 rounded-md border border-[var(--color-border-default)] p-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                data-testid={`preflight-decision-${result.decision}`}
                className={`border ${DECISION_BADGE_CLASS[result.decision]}`}
              >
                {result.decision}
              </Badge>
              <span className="text-xs text-[var(--color-text-secondary)]">
                scale_factor:{" "}
                <span data-testid="preflight-scale-factor" className="font-mono text-[var(--color-text-primary)]">
                  {result.scale_factor}
                </span>
              </span>
            </div>
            <p data-testid="preflight-composite-reason" className="text-sm text-[var(--color-text-primary)]">
              {result.composite_reason}
            </p>
            {result.blocked_by.length > 0 && (
              <div data-testid="preflight-blocked-by" className="text-xs text-[var(--color-accent-red)]">
                <span className="font-medium">blocked_by:</span>{" "}
                <span className="font-mono">{result.blocked_by.join(", ")}</span>
              </div>
            )}
            <div>
              <h4 className="text-xs font-medium text-[var(--color-text-secondary)]">
                fired_rules ({result.fired_rules.length})
              </h4>
              {result.fired_rules.length === 0 ? (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">No rules fired.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {result.fired_rules.map((fr, idx) => (
                    <li
                      key={`${fr.rule_id}-${idx}`}
                      data-testid={`fired-rule-${fr.rule_id}`}
                      className="flex flex-wrap items-center gap-2 text-xs"
                    >
                      <Badge className={`border ${CONSEQUENCE_BADGE_CLASS[fr.consequence]}`}>{fr.consequence}</Badge>
                      <span className="font-mono">{fr.rule_id}</span>
                      {fr.reason && <span className="text-[var(--color-text-secondary)]">— {fr.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
