import { describe, it, expect } from "vitest";
import { compareByColumn } from "./columnSort";

interface Row {
  name: string;
  value: number | null;
  alwaysOn?: boolean;
}

const columnValue = (item: Row, _key: "value"): number | null => item.value;
const defaultCmp = (a: Row, b: Row): number => a.name.localeCompare(b.name);

describe("compareByColumn", () => {
  it("orders by the numeric column value ascending", () => {
    const a: Row = { name: "a", value: 1 };
    const b: Row = { name: "b", value: 2 };
    expect(compareByColumn(a, b, "value", "asc", columnValue, defaultCmp)).toBeLessThan(0);
    expect(compareByColumn(b, a, "value", "asc", columnValue, defaultCmp)).toBeGreaterThan(0);
  });

  it("flips the comparison for descending", () => {
    const a: Row = { name: "a", value: 1 };
    const b: Row = { name: "b", value: 2 };
    expect(compareByColumn(a, b, "value", "desc", columnValue, defaultCmp)).toBeGreaterThan(0);
  });

  it("sorts a null column value last regardless of direction", () => {
    const withValue: Row = { name: "a", value: 5 };
    const withoutValue: Row = { name: "b", value: null };
    expect(compareByColumn(withValue, withoutValue, "value", "asc", columnValue, defaultCmp)).toBeLessThan(0);
    expect(compareByColumn(withValue, withoutValue, "value", "desc", columnValue, defaultCmp)).toBeLessThan(0);
    expect(compareByColumn(withoutValue, withValue, "value", "asc", columnValue, defaultCmp)).toBeGreaterThan(0);
  });

  it("falls back to defaultCmp when both column values are null", () => {
    const a: Row = { name: "a", value: null };
    const b: Row = { name: "z", value: null };
    expect(compareByColumn(a, b, "value", "asc", columnValue, defaultCmp)).toBeLessThan(0);
  });

  it("falls back to defaultCmp on a tie (equal column values)", () => {
    const a: Row = { name: "a", value: 1 };
    const b: Row = { name: "z", value: 1 };
    expect(compareByColumn(a, b, "value", "asc", columnValue, defaultCmp)).toBeLessThan(0);
  });

  it("forceLast overrides the column comparison entirely — even a lower value sorts after", () => {
    const alwaysOn: Row = { name: "a", value: 1, alwaysOn: true };
    const normal: Row = { name: "z", value: 100, alwaysOn: false };
    const forceLast = (item: Row) => Boolean(item.alwaysOn);
    expect(compareByColumn(alwaysOn, normal, "value", "asc", columnValue, defaultCmp, forceLast)).toBeGreaterThan(0);
    expect(compareByColumn(normal, alwaysOn, "value", "asc", columnValue, defaultCmp, forceLast)).toBeLessThan(0);
  });

  it("forceLast is a no-op when both items agree", () => {
    const a: Row = { name: "a", value: 1, alwaysOn: true };
    const b: Row = { name: "b", value: 2, alwaysOn: true };
    const forceLast = (item: Row) => Boolean(item.alwaysOn);
    expect(compareByColumn(a, b, "value", "asc", columnValue, defaultCmp, forceLast)).toBeLessThan(0);
  });
});
