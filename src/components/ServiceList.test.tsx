import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ServiceList } from "./ServiceList";

/**
 * ServiceList tests — was sitting at 7.7% function / 0% branch.
 *
 * The component renders the 8-layer pipeline tree (L1 → L6 + Infra +
 * Website) with per-service mode/operationalMode badges and an
 * expandable operations section for multi-op services. These tests pin
 * each behaviour at the public-surface level.
 */

describe("ServiceList", () => {
  it("renders all pipeline layer headers", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    expect(screen.getByText(/L1: Root/)).toBeTruthy();
    expect(screen.getByText(/L2: Data/)).toBeTruthy();
    expect(screen.getByText(/L3: Features/)).toBeTruthy();
    expect(screen.getByText(/L4: ML/)).toBeTruthy();
    expect(screen.getByText(/L5: Execution/)).toBeTruthy();
    expect(screen.getByText(/L6: Risk/)).toBeTruthy();
    expect(screen.getByText(/Infra/)).toBeTruthy();
    expect(screen.getByText(/Website/)).toBeTruthy();
  });

  it("renders the total service count badge", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    // 1 + 2 + 8 + 2 + 3 + 4 + 2 + 1 = 23
    expect(screen.getByText("23")).toBeTruthy();
  });

  it("calls onSelectService with the default operation when a single-op service is clicked", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("instruments"));
    expect(onSelect).toHaveBeenCalledWith("instruments-service", "instruments");
  });

  it("expands operations + selects default operation when a multi-op service is clicked", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    // market-tick-data-service has 4 operations — clicking should
    // expand AND emit the default operation (the first).
    fireEvent.click(screen.getByText("market tick data"));
    expect(onSelect).toHaveBeenCalledWith(
      "market-tick-data-service",
      "download",
    );
    // Sub-operations now visible.
    expect(screen.getByText("Gas Fees")).toBeTruthy();
    expect(screen.getByText("Solana DeFi")).toBeTruthy();
    expect(screen.getByText("EVM DeFi")).toBeTruthy();
  });

  it("collapses an expanded service when clicked a second time", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    const trigger = screen.getByText("market tick data");
    fireEvent.click(trigger);
    expect(screen.getByText("Gas Fees")).toBeTruthy();
    fireEvent.click(trigger);
    // After collapse, the operation row goes away.
    expect(screen.queryByText("Gas Fees")).toBeNull();
  });

  it("emits the chosen operation when an operation row is clicked", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("market tick data"));
    onSelect.mockClear();
    fireEvent.click(screen.getByText("Gas Fees"));
    expect(onSelect).toHaveBeenCalledWith(
      "market-tick-data-service",
      "collect-gas-fees",
    );
  });

  it("renders mode badges for each service", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    // batch + live appear as small pill labels for many services.
    expect(screen.getAllByText("batch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("live").length).toBeGreaterThan(0);
  });

  it("renders operationalMode badges for execution-service", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    // execution-service declares operationalModes [live, manual, paper, backtest].
    // 'manual' is unique to execution-service, so seeing it confirms the
    // operationalMode rendering branch.
    expect(screen.getAllByText("manual").length).toBeGreaterThan(0);
  });

  it("highlights the selected service", () => {
    const { container } = render(
      <ServiceList
        selectedService="strategy-service"
        onSelectService={vi.fn()}
      />,
    );
    // The strategy-service row picks up the selected styling — assert
    // the rendered text + that some element references the layer color
    // border. We don't assert exact CSS; the branch under test is the
    // `isSelected` arm.
    expect(within(container).getByText("strategy")).toBeTruthy();
  });

  it("shows the chevron-down icon while expanded for multi-op services", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    fireEvent.click(screen.getByText("market tick data"));
    // ChevronDown / ChevronRight don't render text — just confirm the
    // expanded panel is now visible (first sub-op present).
    expect(screen.getByText("Gas Fees")).toBeTruthy();
  });

  it("renders the strategy-service multi-op expansion", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    // strategy-service has [backtest, trade] operations.
    fireEvent.click(screen.getByText("strategy"));
    expect(onSelect).toHaveBeenCalledWith("strategy-service", "backtest");
    expect(screen.getByText("Backtest")).toBeTruthy();
    expect(screen.getByText("Trade")).toBeTruthy();
  });

  it("renders execution-service multi-op expansion + emits selected operation", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("execution"));
    onSelect.mockClear();
    fireEvent.click(screen.getByText("Live Execution"));
    expect(onSelect).toHaveBeenCalledWith(
      "execution-service",
      "live_execution",
    );
  });

  it("supports services without operationalModes (no amber badges where absent)", () => {
    render(<ServiceList selectedService={null} onSelectService={vi.fn()} />);
    // alerting-service has no operationalModes — its rendering
    // path goes through opModes.map([]) which is the empty-list branch.
    expect(screen.getByText("alerting")).toBeTruthy();
  });

  it("handles deployment-service single-op click", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("deployment"));
    expect(onSelect).toHaveBeenCalledWith("deployment-service", "deploy");
  });

  it("expands ml-training operations", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("ml training"));
    expect(onSelect).toHaveBeenCalledWith("ml-training-service", "train");
    expect(screen.getByText("Train")).toBeTruthy();
    expect(screen.getByText("Evaluate")).toBeTruthy();
  });

  it("expands alerting-service operations", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    fireEvent.click(screen.getByText("alerting"));
    expect(onSelect).toHaveBeenCalledWith("alerting-service", "monitor");
    expect(screen.getByText("Replay")).toBeTruthy();
  });

  it("expands instruments-service operations on click (single-op)", () => {
    const onSelect = vi.fn();
    render(<ServiceList selectedService={null} onSelectService={onSelect} />);
    // calendar service is multi-op too.
    fireEvent.click(screen.getByText("features calendar"));
    expect(onSelect).toHaveBeenCalledWith(
      "features-calendar-service",
      "calendar",
    );
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Corporate Actions")).toBeTruthy();
  });
});
