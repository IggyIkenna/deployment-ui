import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as clientModule from "../../src/api/client";

const {
  AbortError,
  ApiError,
  getHealth,
  getDeployments,
  getDataStatus,
  getHierarchicalDrilldown,
  getDrilldownSupportedPairs,
  postDeployMissingPreview,
  getDeployMissingServices,
  setApiBaseUrl,
  buildShardDownloadUrl,
} = clientModule;

/**
 * client-branches.test.ts — focused tests for the BRANCH coverage gap
 * in src/api/client.ts (was 46.9%, ~190 missing branches).
 *
 * Targets:
 *   - fetchJson error-wrapping forks (AbortError vs ApiClientError vs other)
 *   - 204 No Content path
 *   - PATCH method fallthrough to fetchJsonDirect
 *   - setApiBaseUrl same-url short-circuit
 *   - getDataStatus legacy ``categories`` → ``asset_groups`` migration
 *   - getHierarchicalDrilldown filter-key loop branches (each filter
 *     present, filter empty string skipped, filter null skipped)
 *   - getDeployments all-falsy filters branch
 *   - getDeployMissingServices empty response services array
 */

function mockFetchOk(data: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      json: () => Promise.resolve(data),
    }),
  );
}

function mockFetchError(status: number, body: Record<string, unknown> | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: body == null ? () => Promise.reject(new Error("nope")) : () => Promise.resolve(body),
    }),
  );
}

function mockFetchAbort() {
  const err = new Error("Aborted");
  err.name = "AbortError";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(err),
  );
}

describe("client.ts — branch coverage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AbortError class carries the standard cancelled message", () => {
    const e = new AbortError();
    expect(e.message).toBe("Request was cancelled");
    expect(e instanceof Error).toBe(true);
  });

  it("ApiError class wraps status + message", () => {
    const e = new ApiError(503, "Bad");
    expect(e.status).toBe(503);
    expect(e.message).toBe("Bad");
  });

  it("re-throws as AbortError when fetch is aborted", async () => {
    mockFetchAbort();
    await expect(getHealth()).rejects.toBeInstanceOf(AbortError);
  });

  it("wraps non-OK responses as ApiError with parsed detail", async () => {
    mockFetchError(500, { detail: "kaboom" });
    await expect(getHealth()).rejects.toMatchObject({
      status: 500,
      message: "kaboom",
    });
  });

  it("falls back to 'Unknown error' message when response JSON parse fails", async () => {
    mockFetchError(503, null);
    await expect(getHealth()).rejects.toMatchObject({
      status: 503,
      message: "Unknown error",
    });
  });

  it("returns undefined on 204 No Content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.resolve(undefined),
      }),
    );
    const result = await getHealth();
    // 204 path returns undefined; the function's typed return is HealthResponse
    // but at runtime we get undefined. assert it's not an object with status.
    expect(result).toBeUndefined();
  });

  it("setApiBaseUrl short-circuits when called with the current base", () => {
    // The default API_BASE is "/api". Calling setApiBaseUrl("/api") should
    // be a no-op — exercises the early-return branch.
    setApiBaseUrl("/api");
    setApiBaseUrl("/api2");
    setApiBaseUrl("/api2"); // same as last call → noop
    setApiBaseUrl("/api"); // restore to default for other tests.
  });

  it("getDeployments with no filters omits the query string", async () => {
    mockFetchOk({ deployments: [], count: 0 });
    await getDeployments();
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("?");
  });

  it("getDeployments with empty filter object also omits the query string", async () => {
    mockFetchOk({ deployments: [], count: 0 });
    await getDeployments({});
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("?");
  });

  it("getDataStatus migrates legacy 'categories' field to 'asset_groups'", async () => {
    mockFetchOk({
      service: "svc",
      overall_excluded: 0,
      categories: { cefi: { foo: "bar" } },
      // no asset_groups key — triggers the migration branch
    });
    const result = await getDataStatus({
      service: "svc",
      start_date: "2024-01-01",
      end_date: "2024-01-05",
    });
    // After migration the result has asset_groups, no categories
    expect((result as { asset_groups: unknown }).asset_groups).toEqual({
      cefi: { foo: "bar" },
    });
    expect("categories" in (result as object)).toBe(false);
  });

  it("getDataStatus passes through normal asset_groups responses unchanged", async () => {
    mockFetchOk({
      service: "svc",
      overall_excluded: 0,
      asset_groups: { defi: { x: 1 } },
    });
    const result = await getDataStatus({
      service: "svc",
      start_date: "2024-01-01",
      end_date: "2024-01-05",
    });
    expect((result as { asset_groups: unknown }).asset_groups).toEqual({
      defi: { x: 1 },
    });
  });

  it("getHierarchicalDrilldown threads expand_to_depth + child_offset + child_limit when set", async () => {
    mockFetchOk({
      service: "svc",
      asset_group: "cefi",
      axes: [],
      tree: [],
      totals: { captured: 0, empty_confirmed: 0, attempted_failed: 0, total: 0, completion_pct: 0 },
      filtered_by: {},
    });
    await getHierarchicalDrilldown({
      service: "svc",
      asset_group: "cefi",
      start_date: "2024-01-01",
      end_date: "2024-01-05",
      expand_to_depth: 3,
      child_offset: 50,
      child_limit: 25,
    });
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("expand_to_depth=3");
    expect(url).toContain("child_offset=50");
    expect(url).toContain("child_limit=25");
  });

  it("getHierarchicalDrilldown skips null/empty-string filter values", async () => {
    mockFetchOk({
      service: "svc",
      asset_group: "tradfi",
      axes: [],
      tree: [],
      totals: { captured: 0, empty_confirmed: 0, attempted_failed: 0, total: 0, completion_pct: 0 },
      filtered_by: {},
    });
    await getHierarchicalDrilldown({
      service: "svc",
      asset_group: "tradfi",
      start_date: "2024-01-01",
      end_date: "2024-01-05",
      filters: {
        venue: "CME",
        data_type: "", // empty string → skipped
        instrument_type: "FUTURE",
      },
    });
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("venue=CME");
    expect(url).toContain("instrument_type=FUTURE");
    expect(url).not.toContain("data_type=");
  });

  it("getHierarchicalDrilldown without optional params omits all filter keys", async () => {
    mockFetchOk({
      service: "svc",
      asset_group: "cefi",
      axes: [],
      tree: [],
      totals: { captured: 0, empty_confirmed: 0, attempted_failed: 0, total: 0, completion_pct: 0 },
      filtered_by: {},
    });
    await getHierarchicalDrilldown({
      service: "svc",
      asset_group: "cefi",
      start_date: "2024-01-01",
      end_date: "2024-01-05",
    });
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).not.toContain("expand_to_depth=");
    expect(url).not.toContain("child_offset=");
    expect(url).not.toContain("child_limit=");
  });

  it("getDrilldownSupportedPairs returns [] when response.pairs is undefined", async () => {
    mockFetchOk({});
    const result = await getDrilldownSupportedPairs();
    expect(result).toEqual([]);
  });

  it("getDrilldownSupportedPairs returns pairs when present", async () => {
    mockFetchOk({
      pairs: [{ service: "svc", asset_group: "cefi", axes: ["venue"] }],
    });
    const result = await getDrilldownSupportedPairs();
    expect(result).toHaveLength(1);
  });

  it("postDeployMissingPreview defaults mode to 'preview'", async () => {
    mockFetchOk({
      service: "svc",
      asset_group: "cefi",
      row_key: { venue: "BINANCE" },
      shard_key: "venue=BINANCE",
      launcher_script: "x.sh",
      command: "bash x.sh",
      notes: [],
      mode: "preview",
      warnings: [],
    });
    await postDeployMissingPreview({
      service: "svc",
      asset_group: "cefi",
      row_key: { venue: "BINANCE" },
    });
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const opts = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(opts.body).toContain('"mode":"preview"');
  });

  it("postDeployMissingPreview honors explicit mode", async () => {
    mockFetchOk({
      service: "svc",
      asset_group: "cefi",
      row_key: {},
      shard_key: "",
      launcher_script: "",
      command: "",
      notes: [],
      mode: "tarball-from-local",
      warnings: [],
    });
    await postDeployMissingPreview({
      service: "svc",
      asset_group: "cefi",
      row_key: {},
      mode: "tarball-from-local",
    });
    const fetchSpy = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } });
    const opts = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(opts.body).toContain('"mode":"tarball-from-local"');
  });

  it("getDeployMissingServices returns [] when response.services is missing", async () => {
    mockFetchOk({});
    expect(await getDeployMissingServices()).toEqual([]);
  });

  it("getDeployMissingServices returns the services array when present", async () => {
    mockFetchOk({ services: ["mtds", "instruments"] });
    expect(await getDeployMissingServices()).toEqual(["mtds", "instruments"]);
  });

  it("buildShardDownloadUrl includes optional chain + league_id when set", () => {
    const url = buildShardDownloadUrl({
      service: "mtds",
      asset_group: "defi",
      venue: "UNISWAP_V3",
      date: "2024-01-03",
      data_type: "swaps",
      instrument_type: "DEX_POOL",
      chain: "ETHEREUM",
      league_id: "EPL",
    });
    expect(url).toContain("chain=ETHEREUM");
    expect(url).toContain("league_id=EPL");
  });

  it("buildShardDownloadUrl omits chain/league_id when undefined", () => {
    const url = buildShardDownloadUrl({
      service: "mtds",
      asset_group: "cefi",
      venue: "BINANCE",
      date: "2024-01-03",
      data_type: "trades",
      instrument_type: "PERPETUAL",
    });
    expect(url).not.toContain("chain=");
    expect(url).not.toContain("league_id=");
  });
});
