/**
 * Nav-menu dedup contract (2026-07-17 nav audit).
 *
 * The menu used to mix chromes — some entries pointed at a cockpit tab, others at the
 * standalone page rendering the SAME component — so the same screen appeared twice under
 * two labels and which chrome you got depended on which item you clicked. These tests pin
 * the invariants that fix cost us, so a future entry can't silently reintroduce a duplicate.
 */

import { describe, expect, it } from "vitest";
import { cockpitTabIdFor, NAV_GROUPS, NAV_GROUPS_CANONICAL, NAV_ITEMS_CANONICAL, NAV_LINKS_FLAT } from "./NavMenu";

const canonicalItems = NAV_GROUPS_CANONICAL.flatMap((g) => g.items);
const legacyItems = NAV_GROUPS.filter((g) => g.legacy).flatMap((g) => g.items);

describe("NAV_GROUPS canonical entries", () => {
  it("point at exactly one destination each — no duplicate `to`", () => {
    const targets = canonicalItems.map((i) => i.to);
    expect(targets).toHaveLength(new Set(targets).size);
  });

  it("have unique ids (ids are the e2e/test handles)", () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("never point at a standalone route that a cockpit tab already folds", () => {
    // The folded standalones belong in the legacy quarantine, never in the canonical nav.
    const folded = [
      "/deployments",
      "/ops/live-deployments",
      "/fleet",
      "/infra",
      "/repos",
      "/alerts",
      "/chaos",
      "/safety-ops",
      "/research/ml-experiments",
      "/research/strategy-backtests",
      "/research/execution-backtests",
    ];
    const offenders = canonicalItems.filter((i) => folded.includes(i.to));
    expect(offenders.map((o) => `${o.id} → ${o.to}`)).toEqual([]);
  });

  it("reach every cockpit tab that has no standalone page of its own", () => {
    // Health is `/cockpit` (default tab, no ?tab=); the rest are explicit.
    const reached = new Set(canonicalItems.map((i) => i.to));
    for (const to of [
      "/cockpit",
      "/cockpit?tab=deploy",
      "/cockpit?tab=deployments",
      "/cockpit?tab=fleet",
      "/cockpit?tab=consolidators",
      "/cockpit?tab=ci",
      "/cockpit?tab=alerts",
      "/cockpit?tab=launch",
      "/cockpit?tab=chaos",
      "/cockpit?tab=safety",
    ]) {
      expect(reached).toContain(to);
    }
  });

  it("reach the screens that have NO cockpit twin", () => {
    const reached = new Set(canonicalItems.map((i) => i.to));
    // /home = service picker, /epics = plans, /ops/costs = spend, /vm-deployments = full
    // per-VM history (the cockpit Fleet tab embeds only a compact view), and Data Status
    // is a per-service tab so it defaults to the canonical instruments-service.
    for (const to of ["/home", "/epics", "/ops/costs", "/vm-deployments", "/service/instruments-service/data-status"]) {
      expect(reached).toContain(to);
    }
  });
});

describe("legacy quarantine", () => {
  it("only holds routes whose content is reachable canonically", () => {
    expect(legacyItems.length).toBeGreaterThan(0);
    // Quarantined entries are duplicates BY DEFINITION — none may share a `to` with a
    // canonical entry (that would be the same URL listed twice, not a chrome duplicate).
    const canonicalTargets = new Set(canonicalItems.map((i) => i.to));
    for (const item of legacyItems) {
      expect(canonicalTargets.has(item.to)).toBe(false);
    }
  });

  it("is flagged so it can be deleted wholesale once the routes are redirected", () => {
    const legacyGroups = NAV_GROUPS.filter((g) => g.legacy);
    expect(legacyGroups).toHaveLength(1);
    expect(legacyGroups[0].heading).toMatch(/pending removal/i);
  });
});

describe("NAV_LINKS_FLAT (mobile hamburger parity)", () => {
  it("covers every entry the desktop dropdown shows", () => {
    expect(NAV_LINKS_FLAT).toHaveLength(canonicalItems.length + legacyItems.length);
  });
});

describe("cockpit bar / dropdown shared source", () => {
  it("NAV_ITEMS_CANONICAL is exactly the canonical entries, in group order", () => {
    expect(NAV_ITEMS_CANONICAL).toEqual(canonicalItems);
  });

  it("every canonical entry has a compact label for the bar", () => {
    const missing = NAV_ITEMS_CANONICAL.filter((i) => !i.short).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it("cockpitTabIdFor maps cockpit entries to their tab and others to null", () => {
    expect(cockpitTabIdFor("/cockpit")).toBe("health"); // bare /cockpit == default tab
    expect(cockpitTabIdFor("/cockpit?tab=consolidators")).toBe("consolidators");
    expect(cockpitTabIdFor("/cockpit?tab=ci")).toBe("ci");
    // Entries with no cockpit twin navigate to their own route.
    expect(cockpitTabIdFor("/home")).toBeNull();
    expect(cockpitTabIdFor("/ops/costs")).toBeNull();
    expect(cockpitTabIdFor("/vm-deployments")).toBeNull();
  });

  it("splits the canonical entries into cockpit tabs vs route links as the bar renders them", () => {
    const tabs = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) !== null).map((i) => i.id);
    const links = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) === null).map((i) => i.id);
    // 10 cockpit tabs + the 5 screens with no cockpit twin = 15 canonical entries.
    expect(tabs).toHaveLength(10);
    expect(links).toEqual(["home", "epics", "vm-deployments", "data-status", "costs"]);
    expect(NAV_ITEMS_CANONICAL).toHaveLength(15);
  });
});
