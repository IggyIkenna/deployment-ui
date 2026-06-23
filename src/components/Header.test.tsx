import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import { CloudProviderProvider } from "../contexts/CloudProviderContext";
import { Header } from "./Header";
import type { HealthResponse } from "../types";

/**
 * Header tests — was sitting at 42.85% function / 71.05% branch.
 *
 * The header has 5 fork points: data-mode chip (4-way), cloud-provider
 * toggle, clear-cache button (idle/loading/cleared), API status chip
 * (healthy/error/checking), and gcs_fuse storage badge. Each rung gets
 * a focused test.
 */

function makeHealth(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: "healthy",
    version: "0.42.0",
    config_dir: "/tmp/cfg",
    cloud_provider: "gcp",
    mock_mode: false,
    ...overrides,
  };
}

function renderHeader() {
  return render(
    <MemoryRouter>
      <CloudProviderProvider>
        <Header />
      </CloudProviderProvider>
    </MemoryRouter>,
  );
}

describe("Header", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the brand title + version chip when health resolves", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ version: "1.2.3" }));
    renderHeader();
    expect(screen.getByText(/Unified Trading Deployment/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("v1.2.3")).toBeTruthy());
  });

  it("shows the Connected badge when health is healthy", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderHeader();
    await waitFor(() => expect(screen.getByText("Connected")).toBeTruthy());
  });

  it("shows the Disconnected badge on health error", async () => {
    vi.spyOn(apiClient, "getHealth").mockRejectedValue(new Error("backend down"));
    renderHeader();
    await waitFor(() => expect(screen.getByText("Disconnected")).toBeTruthy());
  });

  it("renders the MOCK (both) badge when frontend + backend are mock", async () => {
    // FRONTEND_MOCK comes from VITE_MOCK_API=true in .env.test.
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ mock_mode: true }));
    renderHeader();
    await waitFor(() => expect(screen.getByText(/MOCK \(both\)/)).toBeTruthy());
  });

  it("renders the MOCK (UI) badge when only frontend is mock", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ mock_mode: false }));
    renderHeader();
    await waitFor(() => expect(screen.getByText(/MOCK \(UI\)/)).toBeTruthy());
  });

  it("renders the cloud-provider toggle + switches to AWS on click", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    renderHeader();
    expect(screen.getByText("GCP")).toBeTruthy();
    expect(screen.getByText("AWS")).toBeTruthy();
    fireEvent.click(screen.getByText("AWS"));
    await waitFor(() => expect(apiClient.clearCache).toHaveBeenCalled());
  });

  it("clears cache + flips Cleared! when the button is clicked", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    const clearSpy = vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    renderHeader();
    fireEvent.click(screen.getByText("Clear Cache"));
    await waitFor(() => expect(clearSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Cleared!/)).toBeTruthy());
  });

  it("recovers gracefully when clearCache rejects (catch swallow)", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    vi.spyOn(apiClient, "clearCache").mockRejectedValue(new Error("nope"));
    renderHeader();
    fireEvent.click(screen.getByText("Clear Cache"));
    // Component recovers — header stays in DOM, no crash.
    await waitFor(() => expect(screen.getByText("Clear Cache")).toBeTruthy());
  });

  it("renders gcs_fuse badge as 'GCS Fuse' on GCP when active", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(
      makeHealth({
        gcs_fuse: { active: true, env: "prod", reason: "mounted" },
      }),
    );
    renderHeader();
    await waitFor(() => expect(screen.getByText("GCS Fuse")).toBeTruthy());
  });

  it("renders gcs_fuse badge as 'GCS API' on GCP when not active", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(
      makeHealth({
        gcs_fuse: { active: false, reason: "not mounted" },
      }),
    );
    renderHeader();
    await waitFor(() => expect(screen.getByText("GCS API")).toBeTruthy());
  });

  it("renders a utility-only top bar — the only nav entry is the Cockpit", () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderHeader();
    // The single nav entry: everything else folded into the cockpit (Plan 0.7).
    expect(screen.getByTestId("nav-cockpit")).toBeTruthy();
    // The former per-page links are gone from the top bar.
    expect(screen.queryByText("VM Deployments")).toBeNull();
    expect(screen.queryByText("Chaos")).toBeNull();
  });
});
