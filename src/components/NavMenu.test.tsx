/**
 * Nav SSOT contract (2026-07-17: one plain-URL scheme, `?tab=` retired).
 *
 * The nav used to mix chromes — some entries pointed at `/cockpit?tab=X`, others at the
 * standalone page rendering the SAME component. The refactor collapsed everything onto ONE
 * plain route per screen and deleted the `?tab=` scheme + the legacy quarantine group. These
 * tests pin that contract so a future entry can't reintroduce `?tab=` or a duplicate screen.
 */

import { describe, expect, it } from "vitest";
import { cockpitTabIdFor, NAV_GROUPS, NAV_GROUPS_CANONICAL, NAV_ITEMS_CANONICAL, NAV_LINKS_FLAT } from "./NavMenu";

const canonicalItems = NAV_GROUPS_CANONICAL.flatMap((g) => g.items);

describe("NAV_GROUPS canonical entries", () => {
  it("point at exactly one destination each — no duplicate `to`", () => {
    const targets = canonicalItems.map((i) => i.to);
    expect(targets).toHaveLength(new Set(targets).size);
  });

  it("have unique ids (ids are the e2e/test handles)", () => {
    const ids = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("use plain routes only — never the retired `?tab=` scheme", () => {
    const offenders = canonicalItems.filter((i) => i.to.includes("?tab="));
    expect(offenders.map((o) => `${o.id} → ${o.to}`)).toEqual([]);
  });

  it("never point at a route that was deleted in the plain-routes cutover", () => {
    // These were `?tab=` compat redirects / folded standalones — gone (or redirect-only, no nav).
    const removed = ["/ops/live-deployments", "/infra", "/repos"];
    const offenders = canonicalItems.filter((i) => removed.includes(i.to));
    expect(offenders.map((o) => `${o.id} → ${o.to}`)).toEqual([]);
  });

  it("reach every former cockpit pane at its plain route", () => {
    const reached = new Set(canonicalItems.map((i) => i.to));
    for (const to of [
      "/cockpit", // health
      "/deploy",
      "/deployments",
      "/fleet",
      "/consolidators",
      "/ci",
      "/alerts",
      "/launch",
      "/chaos",
      "/safety-ops",
    ]) {
      expect(reached).toContain(to);
    }
  });

  it("reach the screens that have NO cockpit-pane heritage", () => {
    const reached = new Set(canonicalItems.map((i) => i.to));
    // /home = service picker, /epics = plans, /ops/costs = spend, /vm-deployments = full
    // per-VM history (the Fleet route embeds only a compact view), and Data Status is a
    // per-service tab so it defaults to the canonical instruments-service.
    for (const to of ["/home", "/epics", "/ops/costs", "/vm-deployments", "/service/instruments-service/data-status"]) {
      expect(reached).toContain(to);
    }
  });
});

describe("legacy quarantine", () => {
  it("no longer exists — the duplicate-route group + its routes were deleted in the cutover", () => {
    expect(NAV_GROUPS.some((g) => g.legacy)).toBe(false);
    expect(NAV_GROUPS_CANONICAL).toEqual(NAV_GROUPS);
  });
});

describe("NAV_LINKS_FLAT (mobile hamburger parity)", () => {
  it("covers every canonical entry the desktop dropdown shows", () => {
    expect(NAV_LINKS_FLAT).toHaveLength(canonicalItems.length);
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

  it("cockpitTabIdFor maps former-pane plain routes to their tab id and others to null", () => {
    expect(cockpitTabIdFor("/cockpit")).toBe("health");
    expect(cockpitTabIdFor("/consolidators")).toBe("consolidators");
    expect(cockpitTabIdFor("/ci")).toBe("ci");
    // Entries with no cockpit-pane heritage.
    expect(cockpitTabIdFor("/home")).toBeNull();
    expect(cockpitTabIdFor("/ops/costs")).toBeNull();
    expect(cockpitTabIdFor("/vm-deployments")).toBeNull();
  });

  it("splits the canonical entries into former-pane tabs vs route links as the bar renders them", () => {
    const tabs = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) !== null).map((i) => i.id);
    const links = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) === null).map((i) => i.id);
    // 10 former cockpit panes + the 5 screens with no pane heritage = 15 canonical entries.
    expect(tabs).toHaveLength(10);
    expect(links).toEqual(["home", "epics", "vm-deployments", "data-status", "costs"]);
    expect(NAV_ITEMS_CANONICAL).toHaveLength(15);
  });
});
