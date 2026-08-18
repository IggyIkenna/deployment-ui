/** Unit tests for the GitHub rate-limit client (regression: an untested ghRateLimit.ts at 12.5%
 * coverage dragged the global v8 coverage below the gate floor → deployment-ui main v2 RED
 * 2026-06-11, all 785 tests passing but the coverage threshold failing). */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGhRateLimit, type GhRateLimit } from "./ghRateLimit";

const SAMPLE: GhRateLimit = {
  fetched_at: "2026-06-11T04:00:00Z",
  resources: {
    core: { limit: 5000, remaining: 12, used: 4988, reset: 1736568000 },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchGhRateLimit", () => {
  it("returns the parsed rate-limit payload on a 200", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGhRateLimit();

    expect(result.resources.core.remaining).toBe(12);
    expect(result.fetched_at).toBe("2026-06-11T04:00:00Z");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/api/repos/gh-rate-limit");
  });

  it("forwards an AbortSignal when provided", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(SAMPLE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await fetchGhRateLimit(controller.signal);

    expect(fetchMock.mock.calls[0][1]).toEqual({ headers: {}, signal: controller.signal });
  });

  it("throws `HTTP <status>: <body>` on a non-ok response (the 403/5xx path)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limit exhausted", { status: 503 })),
    );

    await expect(fetchGhRateLimit()).rejects.toThrow("HTTP 503: rate limit exhausted");
  });
});
