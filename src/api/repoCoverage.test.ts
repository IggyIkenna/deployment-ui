/**
 * Unit tests for the small fetch wrappers that sat at 0% function coverage
 * (repoCoverage / repoReadiness / treasury) — happy path + HTTP-error path each.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRepoCoverage } from "./repoCoverage";
import { fetchRepoReadiness } from "./repoReadiness";
import { fetchClientTreasury, fetchClientSubscriptions, postWithdrawalRequest } from "./treasury";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("repoCoverage", () => {
  it("returns parsed coverage rows", async () => {
    const rows = [
      {
        repo: "greeks-service",
        all_above_target: true,
        snapshot_at: "2026-06-11",
        worst_surface: null,
        worst_actual_pct: null,
        worst_target_pct: null,
      },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rows)));
    await expect(fetchRepoCoverage()).resolves.toEqual(rows);
  });

  it("throws with status on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(fetchRepoCoverage()).rejects.toThrow("HTTP 503");
  });
});

describe("repoReadiness", () => {
  it("returns parsed readiness rows", async () => {
    const rows = [{ repo: "greeks-service", deploy_ready: true, reason: "", last_snapshot_date: "2026-06-11" }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(rows)));
    await expect(fetchRepoReadiness()).resolves.toEqual(rows);
  });

  it("throws with status on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(fetchRepoReadiness()).rejects.toThrow("HTTP 500");
  });
});

describe("treasury", () => {
  it("fetchClientTreasury hits the client treasury endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ client_id: "c1", wallets: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchClientTreasury("c1");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("c1");
  });

  it("fetchClientSubscriptions hits the subscriptions endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await fetchClientSubscriptions("c1");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("postWithdrawalRequest POSTs and surfaces HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(postWithdrawalRequest("c1", { amount: 1 } as never)).rejects.toThrow("403");
  });
});
