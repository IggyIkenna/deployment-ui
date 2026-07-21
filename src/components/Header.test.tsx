import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import { CloudProviderProvider } from "../contexts/CloudProviderContext";
import { Header } from "./Header";
import type { HealthResponse } from "../types";

/**
 * Header tests.
 *
 * The 5 utility fork points — data-mode chip (4-way), cloud-provider toggle,
 * clear-cache (idle/loading/cleared), API status (healthy/error/checking) and the
 * gcs_fuse storage badge — moved BEHIND the StatusMenu chip when the top bar was
 * rebuilt to carry the page nav (operator 2026-07-17). They are unchanged in
 * behaviour, so each test now opens the chip first via `openStatusMenu()`.
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

/** The utilities are one click away now — open the chip before asserting on them. */
function openStatusMenu() {
  fireEvent.click(screen.getByTestId("status-menu-trigger"));
}

describe("Header", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the short brand + the version chip inside the status menu", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ version: "1.2.3" }));
    renderHeader();
    // Brand shrank to "UTS" to free the middle of the bar for the page nav.
    expect(screen.getByText("UTS")).toBeTruthy();
    expect(screen.queryByText(/Unified Trading Deployment/)).toBeNull();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText("v1.2.3")).toBeTruthy());
  });

  it("shows the Connected badge when health is healthy", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderHeader();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText("Connected")).toBeTruthy());
  });

  it("shows the Disconnected badge on health error", async () => {
    vi.spyOn(apiClient, "getHealth").mockRejectedValue(new Error("backend down"));
    renderHeader();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText("Disconnected")).toBeTruthy());
  });

  it("renders the MOCK (both) badge when frontend + backend are mock", async () => {
    // FRONTEND_MOCK comes from VITE_MOCK_API=true in .env.test.
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ mock_mode: true }));
    renderHeader();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText(/MOCK \(both\)/)).toBeTruthy());
  });

  it("renders the MOCK (UI) badge when only frontend is mock", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth({ mock_mode: false }));
    renderHeader();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText(/MOCK \(UI\)/)).toBeTruthy());
  });

  it("renders the cloud-provider toggle + switches to AWS on click", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    vi.spyOn(apiClient, "clearCache").mockResolvedValue({
      status: "ok",
    } as unknown as apiClient.ClearCacheResponse);
    renderHeader();
    openStatusMenu();
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
    openStatusMenu();
    fireEvent.click(screen.getByText("Clear Cache"));
    await waitFor(() => expect(clearSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Cleared!/)).toBeTruthy());
  });

  it("recovers gracefully when clearCache rejects (catch swallow)", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    vi.spyOn(apiClient, "clearCache").mockRejectedValue(new Error("nope"));
    renderHeader();
    openStatusMenu();
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
    openStatusMenu();
    await waitFor(() => expect(screen.getByText("GCS Fuse")).toBeTruthy());
  });

  it("renders gcs_fuse badge as 'GCS API' on GCP when not active", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(
      makeHealth({
        gcs_fuse: { active: false, reason: "not mounted" },
      }),
    );
    renderHeader();
    openStatusMenu();
    await waitFor(() => expect(screen.getByText("GCS API")).toBeTruthy());
  });

  it("top-left trigger opens a dismissable page-nav menu (does not force-navigate)", () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderHeader();
    const trigger = screen.getByTestId("nav-cockpit");
    expect(trigger).toBeTruthy();
    // Closed by default — the page links are not in the DOM (keeps the top bar quiet).
    expect(screen.queryByTestId("nav-menu")).toBeNull();
    expect(screen.queryByText("VM Deployments")).toBeNull();
    // Clicking the trigger reveals the grouped page nav instead of navigating away.
    // vm-deployments moved to the legacy quarantine (2026-07-21) — off the canonical dropdown,
    // so it no longer renders here (see NavMenu.test.tsx "legacy quarantine" for its coverage).
    fireEvent.click(trigger);
    expect(screen.getByTestId("nav-menu")).toBeTruthy();
    expect(screen.getByTestId("nav-menu-item-deployments")).toBeTruthy();
    expect(screen.getByTestId("nav-menu-item-chaos")).toBeTruthy();
  });
});
