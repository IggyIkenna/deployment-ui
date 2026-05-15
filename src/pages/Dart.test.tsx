import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Dart } from "./Dart";

function renderDart() {
  return render(
    <MemoryRouter>
      <Dart />
    </MemoryRouter>,
  );
}

describe("Dart", () => {
  it("renders page title and operator-monitored banner", () => {
    renderDart();
    expect(screen.getByText("DART Terminal")).toBeInTheDocument();
    expect(screen.getByTestId("operator-monitored-banner")).toBeInTheDocument();
    expect(
      screen.getByText(/operator-monitored window — required before automation flip/i),
    ).toBeInTheDocument();
  });

  it("renders archetype state skeleton panel", () => {
    renderDart();
    expect(screen.getByTestId("archetype-state-panel")).toBeInTheDocument();
    expect(screen.getByText("Archetype State")).toBeInTheDocument();
    expect(
      screen.getByText(/skeleton — live data wired in automation flip/i),
    ).toBeInTheDocument();
  });

  it("renders manual trade entry form with all fields", () => {
    renderDart();
    expect(screen.getByTestId("trade-form")).toBeInTheDocument();
    expect(screen.getByTestId("archetype-select")).toBeInTheDocument();
    expect(screen.getByTestId("venue-select")).toBeInTheDocument();
    expect(screen.getByTestId("instrument-input")).toBeInTheDocument();
    expect(screen.getByTestId("side-select")).toBeInTheDocument();
    expect(screen.getByTestId("quantity-input")).toBeInTheDocument();
    expect(screen.getByTestId("price-input")).toBeInTheDocument();
    expect(screen.getByTestId("submit-trade-button")).toBeInTheDocument();
  });

  it("shows submitted confirmation after form submit", () => {
    renderDart();
    fireEvent.click(screen.getByTestId("submit-trade-button"));
    expect(screen.getByTestId("trade-submitted")).toBeInTheDocument();
    expect(screen.getByText(/trade submitted via execution-service/i)).toBeInTheDocument();
  });

  it("shows all 5 operator checklist items", () => {
    renderDart();
    const banner = screen.getByTestId("operator-monitored-banner");
    expect(banner.querySelectorAll("li")).toHaveLength(5);
  });

  it("submit button label references execution-service same path", () => {
    renderDart();
    expect(screen.getByTestId("submit-trade-button")).toHaveTextContent(
      "Submit via execution-service",
    );
  });
});
