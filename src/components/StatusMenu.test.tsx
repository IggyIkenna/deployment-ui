import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as apiClient from "../api/client";
import { CloudProviderProvider } from "../contexts/CloudProviderContext";
import { StatusMenu } from "./StatusMenu";
import type { HealthResponse } from "../types";

/**
 * StatusMenu's "Account" section (2026-08-18) defaults its visibility from
 * `import.meta.env` — but Vite inlines source-file (non-`*.test.*`) `import.meta.env.VITE_*`
 * reads at transform time, so `vi.stubEnv` cannot flip that from here (confirmed empirically:
 * a direct `.env.test`-driven default stays `VITE_MOCK_API=true` regardless of stubbing).
 * `showAccountSection` is exposed as a prop specifically so this path is testable without
 * fighting that — see the prop's doc comment in StatusMenu.tsx.
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

const subscribeAuthStateMock = vi.fn();
const signOutOfGoogleMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../auth/GoogleAuth", () => ({
  subscribeAuthState: (cb: (user: { email: string | null } | null) => void) => {
    subscribeAuthStateMock(cb);
    return () => {};
  },
  signOutOfGoogle: () => signOutOfGoogleMock(),
}));

function renderStatusMenu(showAccountSection: boolean) {
  return render(
    <CloudProviderProvider>
      <StatusMenu showAccountSection={showAccountSection} />
    </CloudProviderProvider>,
  );
}

describe("StatusMenu — Account section", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    subscribeAuthStateMock.mockClear();
    signOutOfGoogleMock.mockClear();
  });

  it("renders the signed-in email once the auth-state listener fires, and Sign Out calls signOutOfGoogle", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderStatusMenu(true);

    expect(subscribeAuthStateMock).toHaveBeenCalledTimes(1);
    const onAuthState = subscribeAuthStateMock.mock.calls[0][0] as (user: { email: string } | null) => void;
    onAuthState({ email: "harshkantariya@odum-research.com" });

    fireEvent.click(screen.getByTestId("status-menu-trigger"));
    await waitFor(() => expect(screen.getByText("harshkantariya@odum-research.com")).toBeTruthy());

    fireEvent.click(screen.getByTestId("sign-out-button"));
    await waitFor(() => expect(signOutOfGoogleMock).toHaveBeenCalledTimes(1));
  });

  it("falls back to 'Signed in' when the listener hasn't reported an email yet", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderStatusMenu(true);

    fireEvent.click(screen.getByTestId("status-menu-trigger"));
    await waitFor(() => expect(screen.getByText("Signed in")).toBeTruthy());
  });

  it("hides the Account section entirely and never subscribes when showAccountSection is false", async () => {
    vi.spyOn(apiClient, "getHealth").mockResolvedValue(makeHealth());
    renderStatusMenu(false);

    fireEvent.click(screen.getByTestId("status-menu-trigger"));
    expect(screen.queryByTestId("sign-out-button")).toBeNull();
    expect(subscribeAuthStateMock).not.toHaveBeenCalled();
  });
});
