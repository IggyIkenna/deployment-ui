import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VenueCredentialsPanel } from "./VenueCredentialsPanel";

vi.mock("../api/deploymentApi", () => ({
  fetchVenueCredentials: vi.fn(),
}));

let mockFetch: ReturnType<typeof vi.fn>;

const MOCK_EXPIRED = [
  {
    name: "tardis-api-key",
    venue: "tardis",
    status: "expired",
    probe_detail: "api-key-info returned [] — no datasets accessible",
    checked_at: "2026-05-29T12:00:00Z",
  },
];

const MOCK_ACTIVE = [
  {
    name: "tardis-api-key",
    venue: "tardis",
    status: "active",
    probe_detail: "5 dataset(s) accessible",
    checked_at: "2026-05-29T12:00:00Z",
  },
];

beforeEach(async () => {
  const mod = await import("../api/deploymentApi");
  mockFetch = vi.mocked(mod.fetchVenueCredentials);
  mockFetch.mockResolvedValue(MOCK_EXPIRED);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VenueCredentialsPanel", () => {
  it("renders panel with heading", async () => {
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByTestId("venue-credentials-panel")).toBeInTheDocument());
    expect(screen.getByText("Venue API Credentials")).toBeInTheDocument();
  });

  it("shows tardis-api-key row with EXPIRED badge", async () => {
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByTestId("credential-row-tardis-api-key")).toBeInTheDocument());
    expect(screen.getByTestId("credential-status-tardis-api-key")).toHaveTextContent("EXPIRED");
    expect(screen.getByText("tardis-api-key")).toBeInTheDocument();
    expect(screen.getByText("tardis")).toBeInTheDocument();
  });

  it("shows ACTIVE badge for active credentials", async () => {
    mockFetch.mockResolvedValueOnce(MOCK_ACTIVE);
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByTestId("credential-status-tardis-api-key")).toBeInTheDocument());
    expect(screen.getByTestId("credential-status-tardis-api-key")).toHaveTextContent("ACTIVE");
  });

  it("shows probe_detail text", async () => {
    render(<VenueCredentialsPanel />);
    await waitFor(() => screen.getByTestId("credential-row-tardis-api-key"));
    expect(screen.getByText(/no datasets accessible/)).toBeInTheDocument();
  });

  it("shows empty message when no credentials returned", async () => {
    mockFetch.mockResolvedValueOnce([]);
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByText("No credentials configured")).toBeInTheDocument());
  });

  it("shows error message when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByTestId("venue-credentials-error")).toBeInTheDocument());
    expect(screen.getByText(/network error/)).toBeInTheDocument();
  });

  it("refresh button re-triggers fetch", async () => {
    render(<VenueCredentialsPanel />);
    await waitFor(() => expect(screen.getByTestId("credential-row-tardis-api-key")).toBeInTheDocument());
    mockFetch.mockClear();
    fireEvent.click(screen.getByTestId("venue-credentials-refresh-btn"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});
