/**
 * Nav SSOT contract (2026-07-17: one plain-URL scheme, `?tab=` retired).
 *
 * The nav used to mix chromes — some entries pointed at `/cockpit?tab=X`, others at the
 * standalone page rendering the SAME component. The refactor collapsed everything onto ONE
 * plain route per screen and deleted the `?tab=` scheme + the legacy quarantine group. These
 * tests pin that contract so a future entry can't reintroduce `?tab=` or a duplicate screen.
 *
 * The legacy quarantine group was REINTRODUCED 2026-07-21 (Fleet-tab consolidation, BLK-7cb5bbbc)
 * for exactly one entry, `/vm-deployments`, then fully RETIRED the same day once its 2 remaining
 * unique features (Reconcile Registry, the raw active/archive VM table) got real homes — see
 * plans/active/issues/vm_deployments_venue_panels_orphaned_route_2026_07_21.md. No legacy group
 * exists today; these tests now pin the ABSENCE of one, so a future fold can't silently reuse
 * `legacy: true` without a test noticing.
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
    // /fleet itself was removed 2026-07-27 (deployment_ui_fleet_tab_removal_2026_07_27.md) — fleet
    // git-health's only home is now agent-orchestrator's own dashboard.
    const removed = ["/ops/live-deployments", "/infra", "/repos", "/fleet"];
    const offenders = canonicalItems.filter((i) => removed.includes(i.to));
    expect(offenders.map((o) => `${o.id} → ${o.to}`)).toEqual([]);
  });

  it("reach every former cockpit pane at its plain route", () => {
    const reached = new Set(canonicalItems.map((i) => i.to));
    for (const to of [
      "/cockpit", // health
      "/deploy",
      "/deployments",
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
    // /home = service picker, /epics = plans, /costs = spend, and Data Status is a
    // per-service tab so it defaults to the canonical instruments-service. /vm-deployments
    // is fully retired (see "legacy quarantine" describe below), reachable nowhere in nav.
    for (const to of ["/home", "/epics", "/costs", "/service/instruments-service/data-status"]) {
      expect(reached).toContain(to);
    }
    expect(reached).not.toContain("/vm-deployments");
  });
});

describe("legacy quarantine", () => {
  it("is currently empty — no group is legacy-flagged", () => {
    // Pins the ABSENCE of a legacy group (retired 2026-07-21, see the file header). The
    // `legacy?: boolean` flag on NavGroup is a reusable convention for a FUTURE fold, not
    // something a passing test suite should let silently reappear unnoticed.
    const legacyGroups = NAV_GROUPS.filter((g) => g.legacy);
    expect(legacyGroups).toEqual([]);
    expect(NAV_GROUPS.flatMap((g) => g.items).map((i) => i.to)).not.toContain("/vm-deployments");
  });
});

describe("NAV_LINKS_FLAT (mobile hamburger parity)", () => {
  it("covers exactly the canonical entries — no legacy quarantine today", () => {
    expect(NAV_LINKS_FLAT).toHaveLength(canonicalItems.length);
    expect(NAV_LINKS_FLAT.map((l) => l.to)).not.toContain("/vm-deployments");
  });
});

describe("cockpit bar shared source (the dropdown that used to share it was deleted 2026-07-28)", () => {
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
  });

  it("splits the canonical entries into former-pane tabs vs route links as the bar renders them", () => {
    const tabs = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) !== null).map((i) => i.id);
    const links = NAV_ITEMS_CANONICAL.filter((i) => cockpitTabIdFor(i.to) === null).map((i) => i.id);
    // 9 former cockpit panes + the 10 screens with no pane heritage = 19 canonical entries
    // (vm-deployments moved to the legacy quarantine — see "legacy quarantine" describe above;
    // venue-config is its relocated venue-panel replacement, added 2026-07-21; fleet's own pane
    // was removed 2026-07-27, deployment_ui_fleet_tab_removal_2026_07_27.md; vm-resource-comparison
    // added 2026-07-27, deployment_durable_operational_data_bigquery_2026_07_21.md; cloud-run-jobs
    // added 2026-08-20, deployment_service_api_integration_cleanup_2026_08_18.md item 9; kill-switch
    // + risk added 2026-08-21, DR plan Phase 7.B + Risk plan Phase 6.C mounted).
    expect(tabs).toHaveLength(9);
    expect(links).toEqual([
      "home",
      "epics",
      "venue-config",
      "cloud-run-jobs",
      "data-status",
      "costs",
      "vm-resource-comparison",
      "artifacts",
      "kill-switch",
      "risk",
    ]);
    expect(NAV_ITEMS_CANONICAL).toHaveLength(19);
  });
});
