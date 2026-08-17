import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RolloutRatchetPanel } from "./RolloutRatchetPanel";
import * as client from "../api/client";
import * as deploymentApi from "../api/deploymentApi";
import type { RolloutRatchetOverview } from "../api/client";
import type { RunningResponse } from "../api/deploymentApi";

function mockOverview(overrides: Partial<RolloutRatchetOverview> = {}): RolloutRatchetOverview {
  return {
    generated_at: "2026-08-17T12:00:00+00:00",
    template_drift_source: "mock",
    ruleset_drift_source: "mock",
    template_drift: {
      "unified-trading-library": { verdict: "CLEAN", reasons: [], checked_at: "2026-08-17T03:23:00Z" },
      "instruments-service": {
        verdict: "ERROR",
        reasons: ["pre-commit config drift"],
        checked_at: "2026-08-17T03:23:00Z",
      },
    },
    ruleset_drift: {
      "unified-trading-library": { verdict: "CLEAN", reasons: [], checked_at: "2026-08-17T06:00:00Z" },
      "deployment-api": {
        verdict: "DRIFT",
        reasons: ["main required-contexts drifted"],
        checked_at: "2026-08-17T06:00:00Z",
      },
    },
    ...overrides,
  };
}

function mockRunning(): RunningResponse {
  return {
    generated_at: "2026-08-17T12:00:00Z",
    groups: [
      {
        service: "instruments-service",
        lane: "image",
        cloud: "gcp",
        fragmented: false,
        frag_note: "",
        versions: [
          {
            version: ":abc1234",
            artifact: "unified-trading-system/instruments-service",
            digest: "sha256:abc",
            built_from: "abc1234",
            drift: ["floating"],
            hosts: [],
            why: "floating tag",
            main_head_sha: "def5678",
            behind_main: true,
          },
        ],
      },
    ],
    stats: { services: 1, versions: 1, fragmented: 0, floating: 1, hand: 0, unknown: 0, behind_main: 1 },
  };
}

describe("RolloutRatchetPanel", () => {
  beforeEach(() => {
    vi.spyOn(client, "getRolloutRatchetOverview").mockResolvedValue(mockOverview());
    vi.spyOn(deploymentApi, "getArtifactRunning").mockResolvedValue(mockRunning());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders flagged repos with their verdict chips and digest-pin column", async () => {
    render(<RolloutRatchetPanel />);

    await waitFor(() => expect(screen.getByTestId("rollout-ratchet-sources")).toBeInTheDocument());

    expect(screen.getByTestId("rollout-ratchet-template-source")).toHaveTextContent("mock");
    expect(screen.getByTestId("rollout-ratchet-ruleset-source")).toHaveTextContent("mock");

    expect(screen.getByTestId("rollout-ratchet-row-instruments-service")).toBeInTheDocument();
    expect(screen.getByTestId("rollout-ratchet-template-instruments-service")).toHaveTextContent("ERROR");
    expect(screen.getByTestId("rollout-ratchet-digest-instruments-service")).toHaveTextContent("floating");

    expect(screen.getByTestId("rollout-ratchet-row-deployment-api")).toBeInTheDocument();
    expect(screen.getByTestId("rollout-ratchet-ruleset-deployment-api")).toHaveTextContent("DRIFT");

    // unified-trading-library is CLEAN on both columns -> not in the flagged list.
    expect(screen.queryByTestId("rollout-ratchet-row-unified-trading-library")).not.toBeInTheDocument();
  });

  it("shows the all-clean message when nothing is flagged", async () => {
    vi.spyOn(client, "getRolloutRatchetOverview").mockResolvedValue(
      mockOverview({
        template_drift: { "unified-trading-library": { verdict: "CLEAN", reasons: [], checked_at: null } },
        ruleset_drift: { "unified-trading-library": { verdict: "CLEAN", reasons: [], checked_at: null } },
      }),
    );
    vi.spyOn(deploymentApi, "getArtifactRunning").mockResolvedValue({
      generated_at: "",
      groups: [],
      stats: { services: 0, versions: 0, fragmented: 0, floating: 0, hand: 0, unknown: 0, behind_main: 0 },
    });

    render(<RolloutRatchetPanel />);

    await waitFor(() => expect(screen.getByTestId("rollout-ratchet-all-clean")).toBeInTheDocument());
  });

  it("shows the error state when the overview fetch fails", async () => {
    vi.spyOn(client, "getRolloutRatchetOverview").mockRejectedValue(new Error("boom"));

    render(<RolloutRatchetPanel />);

    await waitFor(() => expect(screen.getByTestId("rollout-ratchet-error")).toHaveTextContent("boom"));
  });
});
