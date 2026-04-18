/**
 * Tests for the /chaos page (Phase 4b).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ChaosInjectionSpec } from "../types";

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../api/client", () => ({
  listActiveChaosInjections: () => mockList(),
  createChaosInjection: (spec: ChaosInjectionSpec) => mockCreate(spec),
  deleteChaosInjection: (id: string) => mockDelete(id),
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
  Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span>,
}));
vi.mock("../components/ui/input", () => ({
  Input: (p: { value?: string; id?: string; placeholder?: string }) => (
    <input id={p.id} placeholder={p.placeholder} defaultValue={p.value} />
  ),
}));
vi.mock("../components/ui/label", () => ({
  Label: (p: { children: React.ReactNode }) => <label>{p.children}</label>,
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

import { Chaos } from "./Chaos";

describe("Chaos page", () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
    mockDelete.mockReset();
  });

  it("renders active injections", async () => {
    const spec: ChaosInjectionSpec = {
      injection_id: "chaos-1",
      point: "venue_latency",
      target_service: "execution-service",
      parameters: { delay_ms: "5000" },
      active_from: "2026-01-01T00:00:00Z",
      active_until: "2026-01-01T00:15:00Z",
      created_by: "operator",
      runtime_profile: "staging",
    };
    mockList.mockResolvedValueOnce([spec]);

    render(
      <MemoryRouter>
        <Chaos />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("venue_latency").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("staging").length).toBeGreaterThan(0);
    expect(screen.getByText(/execution-service/)).toBeInTheDocument();
    expect(screen.getByText(/delay_ms/)).toBeInTheDocument();
  });

  it("shows empty state when no injections", async () => {
    mockList.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <Chaos />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No active injections/)).toBeInTheDocument();
    });
  });

  it("always warns that chaos is forbidden in prod", async () => {
    mockList.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <Chaos />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/forbidden/i)).toBeInTheDocument();
    });
  });
});
