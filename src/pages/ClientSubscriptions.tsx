/**
 * /client-subscriptions — list, create, edit client subscriptions (Phase 4b).
 *
 * Each subscription binds a `client_id` to an `SLATier` plus optional per-service
 * isolation overrides. Deployment-service consumes these to materialise
 * isolated vs. shared services per client. Paired SSOT:
 * unified-trading-pm/codex/04-architecture/client-isolation-sla-and-runtime-profiles.md
 */

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  createClientSubscription,
  listClientSubscriptions,
  updateClientSubscription,
} from "../api/client";
import type {
  ClientServiceOverride,
  ClientSubscription,
  IsolationPolicy,
  SLATier,
} from "../types";

// Services that admit an isolation override on a client subscription.
// Mirrors runtime-topology.yaml `isolation_policies` entries with allowed=[shared, isolated].
const OVERRIDABLE_SERVICES: string[] = [
  "strategy-service",
  "position-balance-monitor-service",
  "risk-and-exposure-service",
  "pnl-attribution-service",
  "alerting-service",
];

const SLA_TIERS: SLATier[] = ["basic", "standard", "premium"];

const TIER_COLOR: Record<SLATier, "default" | "warning" | "success"> = {
  basic: "default",
  standard: "warning",
  premium: "success",
};

export function ClientSubscriptions() {
  const [subs, setSubs] = useState<ClientSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClientSubscription | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubs(await listClientSubscriptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSaveEdit = async (patch: Partial<ClientSubscription>) => {
    if (!editing) return;
    try {
      await updateClientSubscription(editing.client_id, patch);
      setEditing(null);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onCreate = async (sub: ClientSubscription) => {
    try {
      await createClientSubscription(sub);
      setShowCreate(false);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Client Subscriptions</h1>
        <Button onClick={() => setShowCreate(true)}>New subscription</Button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-500 bg-red-500/10 px-3 py-2 text-red-300"
        >
          {error}
        </div>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : subs.length === 0 ? (
        <p className="text-muted-foreground">No subscriptions yet.</p>
      ) : (
        <div className="grid gap-3">
          {subs.map((sub) => (
            <Card key={sub.client_id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <span className="font-mono text-lg">{sub.client_id}</span>
                  <Badge variant={TIER_COLOR[sub.sla_tier]}>
                    {sub.sla_tier}
                  </Badge>
                </CardTitle>
                <Button variant="ghost" onClick={() => setEditing(sub)}>
                  Edit
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Active from {sub.active_from}
                  {sub.active_until ? ` until ${sub.active_until}` : ""}
                </p>
                {sub.service_overrides.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-semibold">
                      Per-service overrides
                    </p>
                    <ul className="text-sm">
                      {sub.service_overrides.map((o) => (
                        <li key={o.service_name}>
                          <span className="font-mono">{o.service_name}</span>:{" "}
                          <Badge
                            variant={
                              o.isolation === "isolated" ? "success" : "default"
                            }
                          >
                            {o.isolation}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {sub.note && (
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    {sub.note}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <SubscriptionForm
          mode="create"
          initial={{
            client_id: "",
            sla_tier: "basic",
            service_overrides: [],
            active_from: new Date().toISOString(),
          }}
          onSave={onCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {editing && (
        <SubscriptionForm
          mode="edit"
          initial={editing}
          onSave={(patch) => onSaveEdit(patch)}
          onCancel={() => setEditing(null)}
        />
      )}
    </main>
  );
}

interface SubscriptionFormProps {
  mode: "create" | "edit";
  initial: ClientSubscription;
  onSave: (sub: ClientSubscription) => void;
  onCancel: () => void;
}

function SubscriptionForm({
  mode,
  initial,
  onSave,
  onCancel,
}: SubscriptionFormProps) {
  const [clientId, setClientId] = useState(initial.client_id);
  const [slaTier, setSlaTier] = useState<SLATier>(initial.sla_tier);
  const [overrides, setOverrides] = useState<ClientServiceOverride[]>(
    initial.service_overrides,
  );
  const [note, setNote] = useState(initial.note ?? "");

  const setOverride = (service: string, isolation: IsolationPolicy | "none") => {
    setOverrides((prev) => {
      const filtered = prev.filter((o) => o.service_name !== service);
      if (isolation === "none") return filtered;
      return [...filtered, { service_name: service, isolation }];
    });
  };

  const handleSave = () => {
    onSave({
      client_id: clientId,
      sla_tier: slaTier,
      service_overrides: overrides,
      active_from: initial.active_from,
      active_until: initial.active_until,
      note,
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
      <Card className="w-[560px] max-w-full">
        <CardHeader>
          <CardTitle>
            {mode === "create" ? "New subscription" : `Edit ${clientId}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="client-id">Client ID</Label>
            <Input
              id="client-id"
              value={clientId}
              disabled={mode === "edit"}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="alpha"
            />
          </div>
          <div>
            <Label htmlFor="sla-tier">SLA tier</Label>
            <Select
              value={slaTier}
              onValueChange={(v) => setSlaTier(v as SLATier)}
            >
              <SelectTrigger id="sla-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLA_TIERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Per-service isolation overrides</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose SHARED or ISOLATED for each service. Only services that
              allow both policies in runtime-topology.yaml appear here.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {OVERRIDABLE_SERVICES.map((svc) => {
                const current =
                  overrides.find((o) => o.service_name === svc)?.isolation ??
                  "none";
                return (
                  <div key={svc} className="flex items-center gap-2">
                    <span className="font-mono text-sm flex-1">{svc}</span>
                    <Select
                      value={current}
                      onValueChange={(v) =>
                        setOverride(svc, v as IsolationPolicy | "none")
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">default</SelectItem>
                        <SelectItem value="shared">shared</SelectItem>
                        <SelectItem value="isolated">isolated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional operator note"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!clientId.trim()}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
