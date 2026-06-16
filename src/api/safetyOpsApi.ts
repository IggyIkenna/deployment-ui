export interface SignoffRow {
  event_id: string;
  parent_incident_key: string;
  timestamp: string;
  verdict: string;
  narrative: string;
  llm_model: string;
  confidence: number | null;
}

export interface AuditAckRow {
  incident_key: string;
  audit_ack_due_at: string;
  severity: string;
  problem_type: string;
  service: string;
  llm_verdict: string | null;
}

export interface AckResponse {
  ok: boolean;
  incident_key: string;
  ack_type: string;
  acked_at: string;
}

const BASE = "/api/safety-ops";

async function safetyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`safety-ops ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function getSignoffs(limit = 50): Promise<SignoffRow[]> {
  return safetyFetch<SignoffRow[]>(`/recovery-audit-signoffs?limit=${limit}`);
}

export function getAuditAckQueue(limit = 50): Promise<AuditAckRow[]> {
  return safetyFetch<AuditAckRow[]>(`/audit-ack-queue?limit=${limit}`);
}

export function postOperationalAck(incidentKey: string): Promise<AckResponse> {
  return safetyFetch<AckResponse>(`/incidents/${encodeURIComponent(incidentKey)}/operational-ack`, { method: "POST" });
}

export function postAuditAck(incidentKey: string): Promise<AckResponse> {
  return safetyFetch<AckResponse>(`/incidents/${encodeURIComponent(incidentKey)}/audit-ack`, { method: "POST" });
}
