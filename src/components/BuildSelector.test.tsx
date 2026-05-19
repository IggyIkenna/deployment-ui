import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as deploymentApi from "../api/deploymentApi";
import { BuildSelector } from "./BuildSelector";

/**
 * BuildSelector tests — was sitting at 66.7% function / 41.7% branch.
 *
 * Pins the four render branches (loading, error, empty, populated) plus
 * the v1 / pre-v1 badge fork inside the populated list.
 */

describe("BuildSelector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the loading message while fetchBuilds is in flight", async () => {
    let resolve!: (v: deploymentApi.BuildEntry[]) => void;
    vi.spyOn(deploymentApi, "fetchBuilds").mockImplementation(
      () =>
        new Promise<deploymentApi.BuildEntry[]>((r) => {
          resolve = r;
        }),
    );
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Loading builds/)).toBeTruthy(),
    );
    resolve([]);
  });

  it("renders the error message on fetch failure", async () => {
    vi.spyOn(deploymentApi, "fetchBuilds").mockRejectedValue(new Error("boom"));
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
  });

  it("falls back to default error string when reject value is not an Error", async () => {
    vi.spyOn(deploymentApi, "fetchBuilds").mockRejectedValue(
      "string-rejection",
    );
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to fetch builds/)).toBeTruthy(),
    );
  });

  it("renders the no-builds message when fetchBuilds returns []", async () => {
    vi.spyOn(deploymentApi, "fetchBuilds").mockResolvedValue([]);
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/No builds found in dev/)).toBeTruthy(),
    );
  });

  it("renders the build picker when builds are returned (v1 + pre-v1)", async () => {
    vi.spyOn(deploymentApi, "fetchBuilds").mockResolvedValue([
      {
        tag: "1.2.3",
        display: "1.2.3 (a1b2c3)",
        is_v1: true,
      } as deploymentApi.BuildEntry,
      {
        tag: "0.9.0",
        display: "0.9.0 (deadbee)",
        is_v1: false,
      } as deploymentApi.BuildEntry,
    ]);
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Pick a build to pre-fill tag/)).toBeTruthy(),
    );
  });

  it("does not call fetchBuilds when service is empty", () => {
    const spy = vi.spyOn(deploymentApi, "fetchBuilds").mockResolvedValue([]);
    render(<BuildSelector service="" onSelect={vi.fn()} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("renders the env picker label", async () => {
    vi.spyOn(deploymentApi, "fetchBuilds").mockResolvedValue([]);
    render(<BuildSelector service="instruments-service" onSelect={vi.fn()} />);
    expect(screen.getByText(/From env/)).toBeTruthy();
    expect(screen.getByText(/Select build/)).toBeTruthy();
  });
});
