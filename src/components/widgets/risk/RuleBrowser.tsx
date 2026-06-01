import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, AlertCircle, RefreshCw, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Dialog } from "../../ui/dialog";

// Closed enum aligned with codex/04-architecture/risk-rule-taxonomy.md.
export const RISK_RULE_SCOPES = [
  "ALL",
  "PER_ARCHETYPE",
  "PER_VENUE",
  "PER_ACCOUNT",
  "PER_CLIENT",
  "PER_ASSET_GROUP",
  "GLOBAL",
  "PER_STRATEGY_FAMILY",
] as const;
export type RiskRuleScope = (typeof RISK_RULE_SCOPES)[number];

export type RiskRuleConsequence =
  | "BLOCK"
  | "SCALE_DOWN"
  | "MONITOR"
  | "TEST_ONLY";

export type RiskRuleSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface RiskRule {
  rule_id: string;
  scope: Exclude<RiskRuleScope, "ALL">;
  applies_to: string;
  consequence: RiskRuleConsequence;
  alerting_severity: RiskRuleSeverity;
  description: string;
}

export interface RuleBrowserProps {
  /** Override the data source — used by tests to mock the API. */
  fetcher?: (params: {
    scope: RiskRuleScope;
    applies_to: string;
  }) => Promise<RiskRule[]>;
}

/** Default fetcher hits the live deployment-api `/api/risk/rules` endpoint. */
async function defaultFetcher(params: {
  scope: RiskRuleScope;
  applies_to: string;
}): Promise<RiskRule[]> {
  const qs = new URLSearchParams();
  if (params.scope !== "ALL") qs.set("scope", params.scope);
  if (params.applies_to.trim()) qs.set("applies_to", params.applies_to.trim());
  const url = `/api/risk/rules${qs.toString() ? `?${qs.toString()}` : ""}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to load risk rules (HTTP ${response.status})${text ? `: ${text}` : ""}`,
    );
  }
  const body: unknown = await response.json();
  if (Array.isArray(body)) return body as RiskRule[];
  if (
    body !== null &&
    typeof body === "object" &&
    "rules" in body &&
    Array.isArray((body as { rules: unknown }).rules)
  ) {
    return (body as { rules: RiskRule[] }).rules;
  }
  return [];
}

const CONSEQUENCE_BADGE_CLASS: Record<RiskRuleConsequence, string> = {
  BLOCK:
    "bg-[var(--color-accent-red)]/15 text-[var(--color-accent-red)] border-[var(--color-accent-red)]/30",
  SCALE_DOWN:
    "bg-[var(--color-accent-amber)]/15 text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/30",
  MONITOR:
    "bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)] border-[var(--color-accent-blue)]/30",
  TEST_ONLY:
    "bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)] border-[var(--color-text-muted)]/30",
};

const SEVERITY_BADGE_CLASS: Record<RiskRuleSeverity, string> = {
  CRITICAL:
    "bg-[var(--color-accent-red)]/15 text-[var(--color-accent-red)] border-[var(--color-accent-red)]/30",
  WARNING:
    "bg-[var(--color-accent-amber)]/15 text-[var(--color-accent-amber)] border-[var(--color-accent-amber)]/30",
  INFO: "bg-[var(--color-accent-blue)]/15 text-[var(--color-accent-blue)] border-[var(--color-accent-blue)]/30",
};

const DESCRIPTION_TRUNCATE = 80;

export function RuleBrowser({ fetcher }: RuleBrowserProps) {
  const [scope, setScope] = useState<RiskRuleScope>("ALL");
  const [appliesTo, setAppliesTo] = useState<string>("");
  const [rules, setRules] = useState<RiskRule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<RiskRule | null>(null);

  const effectiveFetcher = useMemo(() => fetcher ?? defaultFetcher, [fetcher]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await effectiveFetcher({ scope, applies_to: appliesTo });
      setRules(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveFetcher, scope, appliesTo]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  return (
    <Card data-testid="rule-browser">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Risk Rules</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadRules()}
            disabled={loading}
            aria-label="Reload risk rules"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-[var(--color-text-secondary)]">Scope</span>
            <select
              data-testid="rule-browser-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as RiskRuleScope)}
              className="h-8 rounded-md border border-[var(--color-border-default)] bg-transparent px-2 text-sm"
            >
              {RISK_RULE_SCOPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 min-w-[160px] items-center gap-2 text-xs">
            <span className="text-[var(--color-text-secondary)]">
              applies_to
            </span>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                data-testid="rule-browser-applies-to"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value)}
                placeholder="e.g. bybit, CARRY_STAKED_BASIS"
                className="h-8 pl-7 text-sm"
              />
            </div>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div
            data-testid="rule-browser-error"
            className="flex items-start gap-2 rounded-md border border-[var(--color-accent-red)]/30 bg-[var(--color-accent-red)]/10 p-3 text-sm text-[var(--color-accent-red)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div
            data-testid="rule-browser-loading"
            className="py-8 text-center text-sm text-[var(--color-text-muted)]"
          >
            Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <div
            data-testid="rule-browser-empty"
            className="py-8 text-center text-sm text-[var(--color-text-muted)]"
          >
            No rules match the current filters.
          </div>
        ) : (
          <div data-testid="rule-browser-table" className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-xs uppercase text-[var(--color-text-secondary)]">
                  <th className="py-2 pr-3 font-medium">rule_id</th>
                  <th className="py-2 pr-3 font-medium">scope</th>
                  <th className="py-2 pr-3 font-medium">applies_to</th>
                  <th className="py-2 pr-3 font-medium">consequence</th>
                  <th className="py-2 pr-3 font-medium">severity</th>
                  <th className="py-2 pr-3 font-medium">description</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const truncated =
                    rule.description.length > DESCRIPTION_TRUNCATE
                      ? `${rule.description.slice(0, DESCRIPTION_TRUNCATE)}…`
                      : rule.description;
                  return (
                    <tr
                      key={rule.rule_id}
                      data-testid={`rule-row-${rule.rule_id}`}
                      className="border-b border-[var(--color-border-default)]/40 align-top"
                    >
                      <td className="py-2 pr-3 font-mono text-xs">
                        {rule.rule_id}
                      </td>
                      <td className="py-2 pr-3 text-xs">{rule.scope}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {rule.applies_to}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          data-testid={`consequence-badge-${rule.consequence}`}
                          className={`border ${CONSEQUENCE_BADGE_CLASS[rule.consequence]}`}
                        >
                          {rule.consequence}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          data-testid={`severity-badge-${rule.alerting_severity}`}
                          className={`border ${SEVERITY_BADGE_CLASS[rule.alerting_severity]}`}
                        >
                          {rule.alerting_severity}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <button
                          type="button"
                          data-testid={`description-expand-${rule.rule_id}`}
                          onClick={() => setExpanded(rule)}
                          className="text-left text-[var(--color-text-primary)] hover:text-[var(--color-accent-blue)] hover:underline"
                        >
                          {truncated}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <Dialog open={!!expanded} onClose={() => setExpanded(null)}>
        {expanded && (
          <div
            data-testid="rule-description-modal"
            className="relative max-w-2xl rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-6 shadow-xl"
          >
            <button
              type="button"
              onClick={() => setExpanded(null)}
              className="absolute right-3 top-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              aria-label="Close description"
            >
              <X className="h-4 w-4" />
            </button>
            <h3 className="font-mono text-sm text-[var(--color-text-primary)]">
              {expanded.rule_id}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge
                className={`border ${CONSEQUENCE_BADGE_CLASS[expanded.consequence]}`}
              >
                {expanded.consequence}
              </Badge>
              <Badge
                className={`border ${SEVERITY_BADGE_CLASS[expanded.alerting_severity]}`}
              >
                {expanded.alerting_severity}
              </Badge>
              <span className="text-[var(--color-text-secondary)]">
                {expanded.scope} · {expanded.applies_to}
              </span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--color-text-primary)]">
              {expanded.description}
            </p>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
