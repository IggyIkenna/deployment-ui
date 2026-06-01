/**
 * Cloud-provider toggle — port routing + cache-clear contract.
 *
 * Asserts:
 * - Header renders GCP and AWS toggle buttons.
 * - Clicking AWS calls clearCache then sets target to "aws".
 * - Clicking GCP (after AWS) calls clearCache then sets target back to "gcp".
 * - In local-prod mode (DEV=false, hostname=localhost), apiBaseUrl resolves
 *   to http://localhost:8005/api for AWS and http://localhost:8004/api for GCP.
 * - In DEV mode (Vitest default), apiBaseUrl is always "/api" — the Vite proxy wins.
 * - setApiBaseUrl is called on every target transition so the API client
 *   updates its base before the next request.
 *
 * Plan: data_status_comprehensive_test_coverage_2026_05_07 § E.5.
 */

// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import * as apiClient from "../../../src/api/client";
import {
  CloudProviderProvider,
  useCloudProvider,
} from "../../../src/contexts/CloudProviderContext";
import { Header } from "../../../src/components/Header";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

vi.mock("../../../src/hooks/useHealth", () => ({
  useHealth: () => ({ health: null, isHealthy: false, error: null }),
}));

function renderHeaderWithProvider() {
  return render(
    <MemoryRouter>
      <CloudProviderProvider>
        <Header />
      </CloudProviderProvider>
    </MemoryRouter>,
  );
}

/** Minimal consumer that exposes context state as data-testid spans. */
function ContextProbe() {
  const { target, apiBaseUrl, switchTarget } = useCloudProvider();
  return (
    <div>
      <span data-testid="target">{target}</span>
      <span data-testid="apiBaseUrl">{apiBaseUrl}</span>
      <button onClick={() => switchTarget("aws")}>to-aws</button>
      <button onClick={() => switchTarget("gcp")}>to-gcp</button>
    </div>
  );
}

function renderProbeWithProvider() {
  return render(
    <CloudProviderProvider>
      <ContextProbe />
    </CloudProviderProvider>,
  );
}

// ---------------------------------------------------------------------------
// Toggle button rendering
// ---------------------------------------------------------------------------

describe("CloudProviderToggle — Header renders toggle buttons", () => {
  beforeEach(() => {
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    vi.spyOn(apiClient, "setApiBaseUrl").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders GCP and AWS buttons in the header", () => {
    renderHeaderWithProvider();
    expect(screen.getByText("GCP")).toBeTruthy();
    expect(screen.getByText("AWS")).toBeTruthy();
  });

  it("clicking AWS calls clearCache (cache-clear contract)", async () => {
    renderHeaderWithProvider();
    fireEvent.click(screen.getByText("AWS"));
    await waitFor(() => expect(apiClient.clearCache).toHaveBeenCalled());
  });

  it("clicking GCP when already GCP does NOT call clearCache (noop guard)", async () => {
    renderHeaderWithProvider();
    // default target is gcp; clicking gcp again should be a no-op
    fireEvent.click(screen.getByText("GCP"));
    await Promise.resolve();
    expect(apiClient.clearCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Target state transitions via context probe
// ---------------------------------------------------------------------------

describe("CloudProviderToggle — target transitions + clearCache", () => {
  beforeEach(() => {
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    vi.spyOn(apiClient, "setApiBaseUrl").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("target starts as gcp", () => {
    renderProbeWithProvider();
    expect(screen.getByTestId("target").textContent).toBe("gcp");
  });

  it("clicking AWS sets target to aws", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
  });

  it("clicking GCP after AWS reverts target to gcp", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    fireEvent.click(screen.getByText("to-gcp"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("gcp"),
    );
  });

  it("clearCache is called once for GCP→AWS transition", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    expect(apiClient.clearCache).toHaveBeenCalledTimes(1);
  });

  it("clearCache is called for each transition (AWS→GCP also clears)", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    fireEvent.click(screen.getByText("to-gcp"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("gcp"),
    );
    expect(apiClient.clearCache).toHaveBeenCalledTimes(2);
  });

  it("switch still completes when clearCache rejects", async () => {
    vi.spyOn(apiClient, "clearCache").mockRejectedValue(
      new Error("backend down"),
    );
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
  });
});

// ---------------------------------------------------------------------------
// DEV mode apiBaseUrl (Vitest always runs in DEV mode)
// ---------------------------------------------------------------------------

describe("CloudProviderToggle — DEV mode apiBaseUrl (always /api)", () => {
  beforeEach(() => {
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    vi.spyOn(apiClient, "setApiBaseUrl").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("apiBaseUrl is /api for gcp in DEV mode (Vite proxy wins)", () => {
    renderProbeWithProvider();
    expect(screen.getByTestId("apiBaseUrl").textContent).toBe("/api");
  });

  it("apiBaseUrl remains /api after switching to aws in DEV mode", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    // DEV mode: proxy always wins regardless of target.
    expect(screen.getByTestId("apiBaseUrl").textContent).toBe("/api");
  });
});

// ---------------------------------------------------------------------------
// Local-prod mode port routing (DEV=false, hostname=localhost)
// Pins the PORT_MAP contract: GCP→8004, AWS→8005.
// ---------------------------------------------------------------------------

describe("CloudProviderToggle — local-prod port routing (DEV=false)", () => {
  beforeEach(() => {
    // Simulate `vite preview` against locally-running backends.
    // Direct assignment works in Vitest (import.meta.env is a plain object).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import.meta.env as Record<string, unknown>)["DEV"] = false;
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    vi.spyOn(apiClient, "setApiBaseUrl").mockImplementation(() => {});
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (import.meta.env as Record<string, unknown>)["DEV"] = true;
    vi.restoreAllMocks();
  });

  it("apiBaseUrl contains port 8004 for gcp in local-prod mode", () => {
    renderProbeWithProvider();
    const url = screen.getByTestId("apiBaseUrl").textContent ?? "";
    // jsdom hostname is "localhost" → hits the local-prod branch.
    expect(url).toContain("8004");
    expect(url).toContain("/api");
  });

  it("apiBaseUrl contains port 8005 for aws after switch in local-prod mode", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    const url = screen.getByTestId("apiBaseUrl").textContent ?? "";
    expect(url).toContain("8005");
    expect(url).toContain("/api");
  });

  it("apiBaseUrl returns to port 8004 after switching back to gcp", async () => {
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    fireEvent.click(screen.getByText("to-gcp"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("gcp"),
    );
    const url = screen.getByTestId("apiBaseUrl").textContent ?? "";
    expect(url).toContain("8004");
  });

  it("setApiBaseUrl is called with the AWS port-8005 URL on target switch", async () => {
    const setUrlSpy = vi.spyOn(apiClient, "setApiBaseUrl");
    renderProbeWithProvider();
    fireEvent.click(screen.getByText("to-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    const calls = setUrlSpy.mock.calls.map(([url]) => url);
    const awsCall = calls.find((url) => url.includes("8005"));
    expect(awsCall).toBeTruthy();
    expect(awsCall).toContain("http://localhost:8005/api");
  });
});
