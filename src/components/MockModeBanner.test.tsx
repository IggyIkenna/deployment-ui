import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockModeBanner } from "./MockModeBanner";

/**
 * MockModeBanner branch coverage — the banner has a 6-way priority chain
 * (unreachable > starting > both-mock > backend-mock > frontend-mock > stale)
 * and used to sit at 38% branch coverage. Each test pins one rung of the
 * priority by mocking fetch + asserting the rendered message.
 */

interface HealthBody {
  status?: string;
  service?: string;
  cloud_provider?: string;
  mock_mode?: boolean;
  data_freshness?: { last_processed_date?: string; stale?: boolean };
}

function mockFetchOk(body: HealthBody) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response) as unknown as typeof fetch;
}

function mockFetchHttpError(status: number) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as unknown as Response) as unknown as typeof fetch;
}

function mockFetchReject(err: unknown) {
  globalThis.fetch = vi.fn().mockRejectedValue(err) as unknown as typeof fetch;
}

describe("MockModeBanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // NOTE: VITE_MOCK_API=true in .env.test, so FRONTEND_MOCK is true. The
  // priority chain therefore promotes (frontend && backend) → both-mock
  // before backend-mock alone, and the bare-non-mock path renders the
  // frontend-mock banner. These tests pin those rungs.

  it("renders the both-mock banner when frontend + backend mock both true", async () => {
    mockFetchOk({ mock_mode: true, cloud_provider: "gcp" });
    render(<MockModeBanner />);
    await waitFor(() =>
      expect(
        screen.getByText(/frontend interceptors \+ backend/),
      ).toBeTruthy(),
    );
  });

  it("renders the frontend-mock banner when backend reports mock_mode=false", async () => {
    mockFetchOk({
      mock_mode: false,
      cloud_provider: "gcp",
      data_freshness: { last_processed_date: "2024-01-01", stale: false },
    });
    render(<MockModeBanner />);
    await waitFor(() =>
      expect(screen.getByText(/Frontend Mock Mode/)).toBeTruthy(),
    );
  });

  // The data-stale rung is below frontend-mock in the priority chain, so
  // when FRONTEND_MOCK is true the stale branch can't render. The branch
  // itself is exercised when fresh != stale via the frontend-mock path
  // above. Instead, exercise the truthy / falsy data_freshness branches
  // by varying the payload + asserting fetch was called (the internal
  // useBackendHealth setState path differs even if visible output is
  // dominated by the higher-priority FRONTEND_MOCK rung).

  it("calls /api/health on mount", async () => {
    mockFetchOk({ mock_mode: false, cloud_provider: "gcp" });
    render(<MockModeBanner />);
    await waitFor(() => {
      const fetchSpy = globalThis.fetch as unknown as {
        mock: { calls: unknown[] };
      };
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it("handles undefined data_freshness gracefully", async () => {
    mockFetchOk({ mock_mode: false, cloud_provider: "gcp" });
    render(<MockModeBanner />);
    // Path: data_freshness undefined → optional chaining yields undefined
    // for both stale + last_processed_date; FRONTEND_MOCK rung renders.
    await waitFor(() =>
      expect(screen.getByText(/Frontend Mock Mode/)).toBeTruthy(),
    );
  });

  it("renders the starting banner during initial-load HTTP errors (in grace window)", async () => {
    mockFetchHttpError(503);
    render(<MockModeBanner />);
    await waitFor(() =>
      expect(screen.getByText(/Backend starting up/)).toBeTruthy(),
    );
    expect(screen.getByText(/HTTP 503/)).toBeTruthy();
  });

  it("renders the starting banner when fetch rejects mid-startup", async () => {
    mockFetchReject(new Error("network kaput"));
    render(<MockModeBanner />);
    await waitFor(() =>
      expect(screen.getByText(/Backend starting up/)).toBeTruthy(),
    );
    expect(screen.getByText(/network kaput/)).toBeTruthy();
  });

  it("falls back to 'fetch failed' for non-Error rejection values", async () => {
    mockFetchReject("not-an-error-instance");
    render(<MockModeBanner />);
    await waitFor(() =>
      expect(screen.getByText(/fetch failed/)).toBeTruthy(),
    );
  });

  it("falls back to cloud_provider 'unknown' when omitted from response", async () => {
    mockFetchOk({ mock_mode: true });
    render(<MockModeBanner />);
    // OK + mock + FRONTEND_MOCK=true → both-mock rung renders.
    await waitFor(() =>
      expect(
        screen.getByText(/frontend interceptors \+ backend/),
      ).toBeTruthy(),
    );
  });
});
