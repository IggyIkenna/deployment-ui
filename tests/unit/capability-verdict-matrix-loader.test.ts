/**
 * Unit tests for capability-verdict-matrix-loader.ts.
 *
 * Covers: loadVerdictMatrix() lazy-load + cache behaviour.
 * The real 2.2 MB JSON is loaded via Vitest's module resolution.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

// Reset module cache between tests so each test gets a fresh loader state.
// We do a full dynamic re-import each time by resetting the module-level cache
// via the exported function itself (calling it twice should hit the cache path).

describe("loadVerdictMatrix", () => {
  // We use a dynamic re-import inside each test because the module cache is
  // isolated per test run in Vitest.

  it("loads the matrix and returns valid summary + archetypes", async () => {
    const { loadVerdictMatrix } = await import("../../src/data/capability-verdict-matrix-loader");
    const matrix = await loadVerdictMatrix();

    expect(matrix.summary).toBeDefined();
    expect(typeof matrix.summary.total_cells).toBe("number");
    expect(typeof matrix.summary.available).toBe("number");
    expect(typeof matrix.summary.blocked).toBe("number");
    expect(typeof matrix.summary.not_registered).toBe("number");
    expect(Array.isArray(matrix.archetypes)).toBe(true);
    expect(matrix.archetypes.length).toBeGreaterThan(0);
  });

  it("returns the same reference on second call (cached)", async () => {
    const { loadVerdictMatrix } = await import("../../src/data/capability-verdict-matrix-loader");
    const first = await loadVerdictMatrix();
    const second = await loadVerdictMatrix();
    expect(first).toBe(second);
  });

  it("summary totals are self-consistent", async () => {
    const { loadVerdictMatrix } = await import("../../src/data/capability-verdict-matrix-loader");
    const matrix = await loadVerdictMatrix();
    const { total_cells, available, blocked, not_registered } = matrix.summary;
    expect(available + blocked + not_registered).toBe(total_cells);
  });

  it("each archetype entry has the expected shape", async () => {
    const { loadVerdictMatrix } = await import("../../src/data/capability-verdict-matrix-loader");
    const matrix = await loadVerdictMatrix();
    for (const arch of matrix.archetypes.slice(0, 5)) {
      expect(typeof arch.archetype).toBe("string");
      expect(arch.archetype.length).toBeGreaterThan(0);
      expect(typeof arch.not_registered).toBe("boolean");
    }
  });
});
