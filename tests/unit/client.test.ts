import { describe, it, expect } from "vitest";

// Test the ApiError and AbortError classes, plus URL building helpers
// We can't test fetchJson directly (it calls fetch), but we can test the exported
// helper constants and error classes.

describe("ApiError", async () => {
  const { ApiError, AbortError } = await import("../../src/api/client");

  it("creates error with status and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("ApiError");
    expect(err instanceof Error).toBe(true);
  });

  it("creates error with 500 status", () => {
    const err = new ApiError(500, "Internal server error");
    expect(err.status).toBe(500);
    expect(err.message).toBe("Internal server error");
  });
});

describe("AbortError", async () => {
  const { AbortError } = await import("../../src/api/client");

  it("creates abort error with standard message", () => {
    const err = new AbortError();
    expect(err.name).toBe("AbortError");
    expect(err.message).toBe("Request was cancelled");
    expect(err instanceof Error).toBe(true);
  });
});

describe("TURBO_MODE_SERVICES", async () => {
  const { TURBO_MODE_SERVICES, TURBO_SUB_DIMENSION_SERVICES, UPSTREAM_CHECK_SERVICES } =
    await import("../../src/api/client");

  it("includes expected services", () => {
    expect(TURBO_MODE_SERVICES).toContain("instruments-service");
    expect(TURBO_MODE_SERVICES).toContain("market-tick-data-service");
    expect(TURBO_MODE_SERVICES).toContain("features-delta-one-service");
  });

  it("has sub-dimension mapping for turbo services", () => {
    expect(TURBO_SUB_DIMENSION_SERVICES["instruments-service"]).toBe("venue");
    expect(TURBO_SUB_DIMENSION_SERVICES["market-tick-data-service"]).toBe("data_type");
    expect(TURBO_SUB_DIMENSION_SERVICES["features-delta-one-service"]).toBe("feature_group");
  });

  it("lists upstream check services", () => {
    expect(UPSTREAM_CHECK_SERVICES).toContain("market-data-processing-service");
    expect(UPSTREAM_CHECK_SERVICES).toContain("features-delta-one-service");
    expect(UPSTREAM_CHECK_SERVICES.length).toBe(2);
  });
});
