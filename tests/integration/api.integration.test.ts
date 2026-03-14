/**
 * Integration tests — real HTTP calls to deployment-api.
 * Template: unified-trading-pm/scripts/quality-gates-base/ui-integration-test.template.ts
 * Rolled out via: rollout-quality-gates-unified.py
 *
 * Run with deployment-api available:
 *   INTEGRATION_TEST_API_URL=http://localhost:8004 npm run test:integration
 *
 * If API is not reachable, tests are skipped.
 */

import { describe, it, expect, beforeAll } from "vitest";

const BASE =
  (typeof process !== "undefined" && process.env.INTEGRATION_TEST_API_URL) ||
  "http://localhost:8004";
const API = `${BASE.replace(/\/$/, "")}/api`;

async function fetchApi(
  path: string,
  options?: RequestInit,
): Promise<{ ok: boolean; status: number; data?: unknown }> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function isApiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe("deployment-ui ↔ deployment-api integration", () => {
  let apiAvailable: boolean;

  beforeAll(async () => {
    apiAvailable = await isApiReachable();
    if (!apiAvailable) {
      console.warn(
        "Skipping integration tests: deployment-api not reachable at",
        BASE,
      );
    }
  });

  it("GET /health returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/health");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /services returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/services");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /config/venues returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/config/venues");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /deployments returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/deployments");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /service-status/overview returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/service-status/overview");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /capabilities returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/capabilities");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /checklists returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/checklists");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /epics returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/epics");
    expect(ok || status === 401).toBe(true);
  });

  it("GET /cloud-builds/triggers returns ok or 401", async () => {
    if (!apiAvailable) return;
    const { ok, status } = await fetchApi("/cloud-builds/triggers");
    expect(ok || status === 401).toBe(true);
  });
});
