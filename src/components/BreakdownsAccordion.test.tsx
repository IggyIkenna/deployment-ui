import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BreakdownsAccordion } from "./BreakdownsAccordion";

describe("BreakdownsAccordion", () => {
  it("renders nothing when no axes are declared", () => {
    const { container } = render(<BreakdownsAccordion axes={[]} breakdowns={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it("emits 'no data yet' for declared-but-empty axes", () => {
    // Phase 3 deliver-with-empty-data invariant: an axis declared in the
    // UAC SSOT for this (service, asset_group) MUST render even when the
    // backend writer hasn't populated the column yet.
    render(<BreakdownsAccordion axes={["job_id", "training_period"]} breakdowns={{}} title="Breakdowns" />);
    expect(screen.getByText("Job (experiment run)")).toBeTruthy();
    expect(screen.getByText("Training period")).toBeTruthy();
    // Two "no data yet" labels — one per axis header.
    expect(screen.getAllByText("no data yet")).toHaveLength(2);
  });

  it("expands an axis and renders sorted value rows", () => {
    render(
      <BreakdownsAccordion
        axes={["chain", "instrument_type"]}
        breakdowns={{
          chain: { ETHEREUM: 120, ARBITRUM: 40, SOLANA: 5 },
          instrument_type: { DEX_POOL: 140 },
        }}
      />,
    );

    fireEvent.click(screen.getByText("Chain"));
    // Sorted descending by count → ETHEREUM, ARBITRUM, SOLANA
    const rows = screen.getAllByText(/^ETHEREUM|ARBITRUM|SOLANA$/);
    expect(rows.map((r) => r.textContent)).toEqual(["ETHEREUM", "ARBITRUM", "SOLANA"]);
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("labels __legacy__ values explicitly + skips them in onSelectValue", () => {
    const onSelectValue = vi.fn();
    render(
      <BreakdownsAccordion
        axes={["job_id"]}
        breakdowns={{
          job_id: { __legacy__: 7, "20260506-runA": 12 },
        }}
        onSelectValue={onSelectValue}
      />,
    );
    fireEvent.click(screen.getByText("Job (experiment run)"));
    // Click the legacy row — it must NOT fire onSelectValue (legacy is
    // a synthetic bucket, not a real job_id to filter on).
    fireEvent.click(screen.getByText("(legacy — pre-job_id)"));
    expect(onSelectValue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("20260506-runA"));
    expect(onSelectValue).toHaveBeenCalledWith("job_id", "20260506-runA");
  });

  it("labels __legacy__ as '(unlabeled)' on a NON-job_id axis (P4-A)", () => {
    // The __legacy__ sentinel only means "pre-job_id" on the job_id axis; on
    // instrument_type/data_type a blank is just an unlabeled value.
    render(
      <BreakdownsAccordion
        axes={["instrument_type"]}
        breakdowns={{ instrument_type: { SPOT_PAIR: 30, __legacy__: 4 } }}
      />,
    );
    fireEvent.click(screen.getByText("Instrument type"));
    expect(screen.getByText("(unlabeled)")).toBeTruthy();
    expect(screen.queryByText("(legacy — pre-job_id)")).toBeNull();
  });

  it("canonicalises legacy instrument_type labels but keeps the raw query key (P4-A)", () => {
    const onSelectValue = vi.fn();
    render(
      <BreakdownsAccordion
        axes={["instrument_type"]}
        breakdowns={{ instrument_type: { spot: 42, perpetual: 10 } }}
        onSelectValue={onSelectValue}
      />,
    );
    fireEvent.click(screen.getByText("Instrument type"));
    // Display is canonical UPPERCASE …
    const spotRow = screen.getByText("SPOT_PAIR");
    expect(spotRow).toBeTruthy();
    expect(screen.getByText("PERPETUAL")).toBeTruthy();
    // … raw value visible on hover …
    expect(spotRow.getAttribute("title")).toBe("raw: spot");
    // … and the manifest query key sent back is the RAW value, not the label.
    fireEvent.click(spotRow);
    expect(onSelectValue).toHaveBeenCalledWith("instrument_type", "spot");
  });

  it("shows axis count + total row count summary in the header", () => {
    render(<BreakdownsAccordion axes={["chain"]} breakdowns={{ chain: { ETHEREUM: 100, ARBITRUM: 25 } }} />);
    expect(screen.getByText("2 values · 125 rows")).toBeTruthy();
  });
});
