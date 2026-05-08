import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FeatureFamilyFilter } from "./FeatureFamilyFilter";
import { type FeatureFamily, FEATURE_FAMILIES } from "../api/client";

describe("FeatureFamilyFilter", () => {
  it("renders 'All families' summary when nothing is selected", () => {
    render(
      <FeatureFamilyFilter selected={new Set()} onChange={vi.fn()} />,
    );
    expect(
      screen.getByTestId("feature-family-filter-summary").textContent,
    ).toBe("All families");
  });

  it("renders the single family name when exactly one is selected", () => {
    render(
      <FeatureFamilyFilter
        selected={new Set<FeatureFamily>(["onchain"])}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("feature-family-filter-summary").textContent,
    ).toBe("onchain");
  });

  it("renders 'N families' summary when N>1 selected", () => {
    render(
      <FeatureFamilyFilter
        selected={new Set<FeatureFamily>(["onchain", "volatility"])}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("feature-family-filter-summary").textContent,
    ).toBe("2 families");
  });

  it("renders 'All families' when every family is selected", () => {
    render(
      <FeatureFamilyFilter
        selected={new Set<FeatureFamily>(FEATURE_FAMILIES)}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("feature-family-filter-summary").textContent,
    ).toBe("All families");
  });

  it("opens the menu on toggle click and renders 8 family options", () => {
    render(
      <FeatureFamilyFilter selected={new Set()} onChange={vi.fn()} />,
    );
    expect(screen.queryByTestId("feature-family-filter-menu")).toBeNull();
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    expect(screen.getByTestId("feature-family-filter-menu")).toBeTruthy();
    for (const family of FEATURE_FAMILIES) {
      expect(
        screen.getByTestId(`feature-family-filter-option-${family}`),
      ).toBeTruthy();
    }
  });

  it("invokes onChange with the toggled set when a family is clicked", () => {
    const onChange = vi.fn();
    render(
      <FeatureFamilyFilter selected={new Set()} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    fireEvent.click(
      screen.getByTestId("feature-family-filter-option-onchain"),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ReadonlySet<FeatureFamily>;
    expect(next.has("onchain")).toBe(true);
    expect(next.size).toBe(1);
  });

  it("removes a family from the set when clicked while selected", () => {
    const onChange = vi.fn();
    render(
      <FeatureFamilyFilter
        selected={new Set<FeatureFamily>(["onchain", "volatility"])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    fireEvent.click(
      screen.getByTestId("feature-family-filter-option-onchain"),
    );
    const next = onChange.mock.calls[0][0] as ReadonlySet<FeatureFamily>;
    expect(next.has("onchain")).toBe(false);
    expect(next.has("volatility")).toBe(true);
  });

  it("Select all chooses every family", () => {
    const onChange = vi.fn();
    render(
      <FeatureFamilyFilter selected={new Set()} onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    fireEvent.click(screen.getByTestId("feature-family-filter-select-all"));
    const next = onChange.mock.calls[0][0] as ReadonlySet<FeatureFamily>;
    expect(next.size).toBe(FEATURE_FAMILIES.length);
  });

  it("Clear empties the selection", () => {
    const onChange = vi.fn();
    render(
      <FeatureFamilyFilter
        selected={new Set<FeatureFamily>(["onchain", "volatility"])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    fireEvent.click(screen.getByTestId("feature-family-filter-clear"));
    const next = onChange.mock.calls[0][0] as ReadonlySet<FeatureFamily>;
    expect(next.size).toBe(0);
  });

  it("does not open the menu when disabled", () => {
    render(
      <FeatureFamilyFilter
        selected={new Set()}
        onChange={vi.fn()}
        disabled
      />,
    );
    fireEvent.click(screen.getByTestId("feature-family-filter-toggle"));
    expect(screen.queryByTestId("feature-family-filter-menu")).toBeNull();
  });
});
