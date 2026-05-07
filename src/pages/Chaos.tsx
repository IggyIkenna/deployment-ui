/**
 * /chaos — list active chaos injections and create new ones (Phase 4b).
 *
 * Chaos is FORBIDDEN in the ``prod`` runtime profile (per
 * runtime-topology.yaml `runtime_profiles.prod.chaos_allowed=false`). The UI
 * form hard-excludes prod from the profile dropdown; the backend re-validates
 * in deployment-api.
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
  createChaosInjection,
  deleteChaosInjection,
  listActiveChaosInjections,
} from "../api/client";
import type {
  ChaosInjectionPoint,
  ChaosInjectionSpec,
  RuntimeProfile,
} from "../types";

const CHAOS_POINTS: ChaosInjectionPoint[] = [
  "venue_latency",
  "rpc_timeout",
  "recon_mismatch",
  "price_shock",
  "instrument_delist",
  "config_flip",
  "kill_switch_fire",
  "component_failure",
];

// prod is deliberately excluded — chaos forbidden in prod.
const ALLOWED_PROFILES: Exclude<RuntimeProfile, "prod">[] = [
  "backtest",
  "paper",
  "mock-live",
  "staging",
];

export function Chaos() {
  const [injections, setInjections] = useState<ChaosInjectionSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInjections(await listActiveChaosInjections());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = async (spec: ChaosInjectionSpec) => {
    try {
      await createChaosInjection(spec);
      setShowCreate(false);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (injectionId: string) => {
    try {
      await deleteChaosInjection(injectionId);
      void reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="mx-auto px-4 lg:px-6 py-6 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Chaos Injections</h1>
        <Button onClick={() => setShowCreate(true)}>New injection</Button>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Chaos is <strong>forbidden</strong> in the <code>prod</code> runtime
        profile. Create injections only against <code>backtest</code>,{" "}
        <code>paper</code>, <code>mock-live</code>, or <code>staging</code>.
      </p>
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
      ) : injections.length === 0 ? (
        <p className="text-muted-foreground">No active injections.</p>
      ) : (
        <div className="grid gap-3">
          {injections.map((inj) => (
            <Card key={inj.injection_id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-3">
                  <span className="font-mono">{inj.point}</span>
                  <Badge variant="warning">{inj.runtime_profile}</Badge>
                  <span className="text-sm text-muted-foreground">
                    → {inj.target_service}
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  onClick={() => onDelete(inj.injection_id)}
                >
                  Remove
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground font-mono">
                  {inj.injection_id} · by {inj.created_by}
                </p>
                <p className="text-sm">
                  Active {inj.active_from}
                  {inj.active_until ? ` → ${inj.active_until}` : ""}
                </p>
                {Object.keys(inj.parameters).length > 0 && (
                  <ul className="text-sm mt-2">
                    {Object.entries(inj.parameters).map(([k, v]) => (
                      <li key={k}>
                        <span className="font-mono">{k}</span>: {String(v)}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <ChaosForm onCreate={onCreate} onCancel={() => setShowCreate(false)} />
      )}
    </main>
  );
}

interface ChaosFormProps {
  onCreate: (spec: ChaosInjectionSpec) => void;
  onCancel: () => void;
}

function ChaosForm({ onCreate, onCancel }: ChaosFormProps) {
  const [point, setPoint] = useState<ChaosInjectionPoint>("venue_latency");
  const [targetService, setTargetService] = useState("execution-service");
  const [runtimeProfile, setRuntimeProfile] =
    useState<Exclude<RuntimeProfile, "prod">>("staging");
  const [injectionId, setInjectionId] = useState("");
  const [parametersText, setParametersText] = useState<string>(
    '{"delay_ms": "5000"}',
  );

  const handleSave = () => {
    let parameters: Record<string, string> = {};
    try {
      const parsed = JSON.parse(parametersText) as Record<string, unknown>;
      parameters = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)]),
      );
    } catch {
      alert("parameters must be valid JSON");
      return;
    }
    const now = new Date();
    const activeUntil = new Date(now.getTime() + 15 * 60 * 1000);
    onCreate({
      injection_id: injectionId.trim() || `chaos-${Date.now()}`,
      point,
      target_service: targetService.trim(),
      parameters,
      active_from: now.toISOString(),
      active_until: activeUntil.toISOString(),
      created_by: "deployment-ui",
      runtime_profile: runtimeProfile,
    });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
      <Card className="w-[560px] max-w-full">
        <CardHeader>
          <CardTitle>New chaos injection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="point">Injection point</Label>
            <Select
              value={point}
              onValueChange={(v) => setPoint(v as ChaosInjectionPoint)}
            >
              <SelectTrigger id="point">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAOS_POINTS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="target-service">Target service</Label>
            <Input
              id="target-service"
              value={targetService}
              onChange={(e) => setTargetService(e.target.value)}
              placeholder="execution-service"
            />
          </div>
          <div>
            <Label htmlFor="runtime-profile">Runtime profile</Label>
            <Select
              value={runtimeProfile}
              onValueChange={(v) =>
                setRuntimeProfile(v as Exclude<RuntimeProfile, "prod">)
              }
            >
              <SelectTrigger id="runtime-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLOWED_PROFILES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="injection-id">Injection ID (optional)</Label>
            <Input
              id="injection-id"
              value={injectionId}
              onChange={(e) => setInjectionId(e.target.value)}
              placeholder="auto-generated if empty"
            />
          </div>
          <div>
            <Label htmlFor="parameters">Parameters (JSON)</Label>
            <textarea
              id="parameters"
              className="w-full rounded border bg-background px-3 py-2 font-mono text-sm"
              rows={4}
              value={parametersText}
              onChange={(e) => setParametersText(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Create</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
