import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import {
  CloudProviderProvider,
  useCloudProvider,
} from "./CloudProviderContext";

/**
 * CloudProviderContext was sitting at 50% func / 9% branch — the AWS
 * switch path, the dev-vs-prod base-URL branch, and the same-target
 * early-return inside switchTarget had no coverage. These tests pin
 * each branch with a small consumer component.
 */

function ProbeConsumer() {
  const { target, apiBaseUrl, switchTarget, switching } = useCloudProvider();
  return (
    <div>
      <div data-testid="target">{target}</div>
      <div data-testid="apiBaseUrl">{apiBaseUrl}</div>
      <div data-testid="switching">{switching ? "yes" : "no"}</div>
      <button onClick={() => switchTarget("aws")}>switch-aws</button>
      <button onClick={() => switchTarget("gcp")}>switch-gcp</button>
    </div>
  );
}

describe("CloudProviderContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provides gcp as the default target + a /api base URL in dev mode", () => {
    render(
      <CloudProviderProvider>
        <ProbeConsumer />
      </CloudProviderProvider>,
    );
    expect(screen.getByTestId("target").textContent).toBe("gcp");
    // import.meta.env.DEV === true in vitest — the dev-proxy branch wins.
    expect(screen.getByTestId("apiBaseUrl").textContent).toBe("/api");
    expect(screen.getByTestId("switching").textContent).toBe("no");
  });

  it("switches to aws when switchTarget('aws') is called", async () => {
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
      cleared: [],
    } as unknown as apiClient.ClearCacheResponse);
    render(
      <CloudProviderProvider>
        <ProbeConsumer />
      </CloudProviderProvider>,
    );
    fireEvent.click(screen.getByText("switch-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    expect(apiClient.clearCache).toHaveBeenCalled();
  });

  it("does nothing when switchTarget is called with the current target", async () => {
    const clearSpy = vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    render(
      <CloudProviderProvider>
        <ProbeConsumer />
      </CloudProviderProvider>,
    );
    // Already gcp; switching to gcp should noop without calling clearCache.
    fireEvent.click(screen.getByText("switch-gcp"));
    // Synchronous early-return → no await needed; assert immediately +
    // give microtask a turn just to confirm clearCache stays uncalled.
    await Promise.resolve();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("target").textContent).toBe("gcp");
  });

  it("still switches when clearCache rejects (catch swallows)", async () => {
    vi.spyOn(apiClient, "clearCache").mockRejectedValue(
      new Error("backend down"),
    );
    render(
      <CloudProviderProvider>
        <ProbeConsumer />
      </CloudProviderProvider>,
    );
    fireEvent.click(screen.getByText("switch-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
  });

  it("throws when useCloudProvider is called outside the provider", () => {
    function ConsumerWithoutProvider() {
      useCloudProvider();
      return null;
    }
    // Suppress React's "uncaught error" log noise during the test.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ConsumerWithoutProvider />)).toThrow(
      /useCloudProvider must be used within CloudProviderProvider/,
    );
    errSpy.mockRestore();
  });

  it("toggles back from aws to gcp", async () => {
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    render(
      <CloudProviderProvider>
        <ProbeConsumer />
      </CloudProviderProvider>,
    );
    fireEvent.click(screen.getByText("switch-aws"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("aws"),
    );
    fireEvent.click(screen.getByText("switch-gcp"));
    await waitFor(() =>
      expect(screen.getByTestId("target").textContent).toBe("gcp"),
    );
  });
});
