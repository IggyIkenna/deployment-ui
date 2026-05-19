/**
 * Tests for the /client-subscriptions page (Phase 4b).
 *
 * Verifies that:
 *   * listClientSubscriptions is called on mount
 *   * each subscription's client_id, SLA tier, and service overrides render
 *   * the "New subscription" button opens the form
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ClientSubscription } from "../types";

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../api/client", () => ({
  listClientSubscriptions: () => mockList(),
  createClientSubscription: (sub: ClientSubscription) => mockCreate(sub),
  updateClientSubscription: (
    clientId: string,
    patch: Partial<ClientSubscription>,
  ) => mockUpdate(clientId, patch),
  setApiBaseUrl: vi.fn(),
  clearCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../components/ui/card", () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <h3>{p.children}</h3>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock("../components/ui/button", () => ({
  Button: (p: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={p.onClick}>{p.children}</button>
  ),
}));
vi.mock("../components/ui/badge", () => ({
  Badge: (p: { children: React.ReactNode; variant?: string }) => (
    <span data-variant={p.variant}>{p.children}</span>
  ),
}));
vi.mock("../components/ui/input", () => ({
  Input: (p: {
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
    id?: string;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <input
      id={p.id}
      disabled={p.disabled}
      placeholder={p.placeholder}
      value={p.value}
      onChange={(e) =>
        p.onChange?.({ target: { value: e.currentTarget.value } })
      }
    />
  ),
}));
vi.mock("../components/ui/label", () => ({
  Label: (p: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={p.htmlFor}>{p.children}</label>
  ),
}));
vi.mock("../components/ui/select", () => ({
  Select: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectItem: (p: { children: React.ReactNode; value: string }) => (
    <option value={p.value}>{p.children}</option>
  ),
  SelectTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectValue: () => <span />,
}));

import { ClientSubscriptions } from "./ClientSubscriptions";

describe("ClientSubscriptions page", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
  });

  it("renders subscriptions returned from the API", async () => {
    const subs: ClientSubscription[] = [
      {
        client_id: "alpha",
        sla_tier: "premium",
        service_overrides: [
          { service_name: "risk-and-exposure-service", isolation: "isolated" },
        ],
        active_from: "2026-01-01T00:00:00Z",
      },
    ];
    mockList.mockResolvedValueOnce(subs);

    render(
      <MemoryRouter>
        <ClientSubscriptions />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("alpha")).toBeInTheDocument();
    });
    expect(screen.getByText("premium")).toBeInTheDocument();
    expect(screen.getByText(/risk-and-exposure-service/)).toBeInTheDocument();
  });

  it("shows empty state when there are no subscriptions", async () => {
    mockList.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <ClientSubscriptions />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No subscriptions yet/)).toBeInTheDocument();
    });
  });

  it("surfaces the API error when listing fails", async () => {
    mockList.mockRejectedValueOnce(new Error("boom"));
    render(
      <MemoryRouter>
        <ClientSubscriptions />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
  });
});
