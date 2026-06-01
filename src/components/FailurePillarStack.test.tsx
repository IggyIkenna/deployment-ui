import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FailurePillarStack } from "./FailurePillarStack";

describe("FailurePillarStack", () => {
  it("returns null when failurePillars is absent", () => {
    const { container } = render(<FailurePillarStack />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when every pillar is zero", () => {
    const { container } = render(
      <FailurePillarStack
        failurePillars={{ failed_cluster: 0, failed_other: 0 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one segment per non-zero pillar", () => {
    render(
      <FailurePillarStack
        failurePillars={{
          failed_cluster: 6,
          failed_timestamp_bias: 0,
          failed_other: 4,
        }}
      />,
    );
    expect(screen.getByTestId("failure-pillar-stack")).toBeTruthy();
    expect(
      screen.getByTestId("failure-pillar-segment-failed_cluster"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("failure-pillar-segment-failed_other"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("failure-pillar-segment-failed_timestamp_bias"),
    ).toBeNull();
  });

  it("computes segment widths proportional to total", () => {
    render(
      <FailurePillarStack
        failurePillars={{
          failed_cluster: 3,
          failed_other: 1,
        }}
      />,
    );
    const cluster = screen.getByTestId("failure-pillar-segment-failed_cluster");
    const other = screen.getByTestId("failure-pillar-segment-failed_other");
    // 3 / (3 + 1) = 75%
    expect((cluster as HTMLElement).style.width).toBe("75%");
    expect((other as HTMLElement).style.width).toBe("25%");
  });

  it("emits the total via data-failure-total attribute", () => {
    render(
      <FailurePillarStack
        failurePillars={{
          failed_cluster: 2,
          failed_malformed: 5,
        }}
      />,
    );
    expect(
      screen
        .getByTestId("failure-pillar-stack")
        .getAttribute("data-failure-total"),
    ).toBe("7");
  });

  it("renders interactive buttons when onSegmentClick is supplied", () => {
    const onClick = vi.fn();
    render(
      <FailurePillarStack
        failurePillars={{ failed_cluster: 2 }}
        onSegmentClick={onClick}
      />,
    );
    const seg = screen.getByTestId("failure-pillar-segment-failed_cluster");
    expect(seg.tagName).toBe("BUTTON");
    fireEvent.click(seg);
    expect(onClick).toHaveBeenCalledWith("failed_cluster");
  });

  it("renders non-interactive spans when onSegmentClick is omitted", () => {
    render(<FailurePillarStack failurePillars={{ failed_cluster: 2 }} />);
    const seg = screen.getByTestId("failure-pillar-segment-failed_cluster");
    expect(seg.tagName).toBe("SPAN");
  });

  it("uses a custom testIdPrefix when provided", () => {
    render(
      <FailurePillarStack
        failurePillars={{ failed_cluster: 1 }}
        testIdPrefix="venue-row-7"
      />,
    );
    expect(screen.getByTestId("venue-row-7-failure-pillar-stack")).toBeTruthy();
    expect(
      screen.getByTestId("venue-row-7-failure-pillar-segment-failed_cluster"),
    ).toBeTruthy();
  });

  it("ignores unrecognised pillar keys (closed-set taxonomy)", () => {
    render(
      <FailurePillarStack
        failurePillars={
          {
            failed_cluster: 1,
            failed_invented_unknown: 99,
          } as Record<string, number>
        }
      />,
    );
    expect(
      screen.getByTestId("failure-pillar-segment-failed_cluster"),
    ).toBeTruthy();
    expect(
      screen.queryByTestId("failure-pillar-segment-failed_invented_unknown"),
    ).toBeNull();
    expect(
      screen
        .getByTestId("failure-pillar-stack")
        .getAttribute("data-failure-total"),
    ).toBe("1");
  });
});
