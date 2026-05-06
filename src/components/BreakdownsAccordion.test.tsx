import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BreakdownsAccordion } from "./BreakdownsAccordion";

describe("BreakdownsAccordion", () => {
  it("renders nothing when no axes are declared", () => {
    const { container } = render(
      <BreakdownsAccordion axes={[]} breakdowns={{}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("emits 'no data yet' for declared-but-empty axes", () => {
    // Phase 3 deliver-with-empty-data invariant: an axis declared in the
    // UAC SSOT for this (service, asset_group) MUST render even when the
    // backend writer hasn't populated the column yet.
    render(
      <BreakdownsAccordion
        axes={["job_id", "training_period"]}
        breakdowns={{}}
        title="Breakdowns"
      />,
    );
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
    expect(rows.map((r) => r.textContent)).toEqual([
      "ETHEREUM",
      "ARBITRUM",
      "SOLANA",
    ]);
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

  it("shows axis count + total row count summary in the header", () => {
    render(
      <BreakdownsAccordion
        axes={["chain"]}
        breakdowns={{ chain: { ETHEREUM: 100, ARBITRUM: 25 } }}
      />,
    );
    expect(screen.getByText("2 values · 125 rows")).toBeTruthy();
  });
});
