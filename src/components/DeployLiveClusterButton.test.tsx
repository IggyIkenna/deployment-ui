/**
 * DeployLiveClusterButton — Phase 11.4 UI unit tests.
 *
 * Plan: live_pipeline_mtds_mdps_features_2026_05_08.md Phase 11.4.
 *
 * Covers: opening the modal, role-picker conditional rendering
 * (per-asset_group + window-parameterised branches), POST body shape,
 * preview rendering, error rendering.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeployLiveClusterButton } from "./DeployLiveClusterButton";

function _mockSuccess() {
  return vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          role: "mtds-live",
          asset_group: "cefi",
          deployment_env: "prod",
          launcher_script: "deployment-service/scripts/vm/launch-mtds-live.sh",
          command:
            "bash deployment-service/scripts/vm/launch-mtds-live.sh \\\n  --asset-group cefi \\\n  --env prod",
          notes: ["note-1", "note-2"],
          warnings: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
}

describe("DeployLiveClusterButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the trigger button collapsed by default", () => {
    render(<DeployLiveClusterButton />);
    expect(
      screen.getByTestId("deploy-live-cluster-button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("deploy-live-cluster-form"),
    ).not.toBeInTheDocument();
  });

  it("opens the modal with mtds-live preselected + asset-group visible", () => {
    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    expect(screen.getByTestId("deploy-live-cluster-form")).toBeInTheDocument();
    expect(screen.getByTestId("deploy-live-cluster-role")).toHaveValue(
      "mtds-live",
    );
    expect(
      screen.getByTestId("deploy-live-cluster-asset-group"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("deploy-live-cluster-env")).toHaveValue("prod");
  });

  it("hides asset-group selector when singleton role is picked", () => {
    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.change(screen.getByTestId("deploy-live-cluster-role"), {
      target: { value: "features-cross-cutting" },
    });
    expect(
      screen.queryByTestId("deploy-live-cluster-asset-group"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("deploy-live-cluster-replay-start"),
    ).not.toBeInTheDocument();
  });

  it("shows replay-window fields when replay-cascade is picked", () => {
    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.change(screen.getByTestId("deploy-live-cluster-role"), {
      target: { value: "replay-cascade" },
    });
    expect(
      screen.getByTestId("deploy-live-cluster-replay-start"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("deploy-live-cluster-replay-end"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("deploy-live-cluster-replay-shard-key"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("deploy-live-cluster-asset-group"),
    ).toBeInTheDocument();
  });

  it("submits and renders the launcher command on success", async () => {
    const spy = _mockSuccess();
    vi.stubGlobal("fetch", spy);

    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.click(screen.getByTestId("deploy-live-cluster-submit"));

    await waitFor(() =>
      expect(
        screen.getByTestId("deploy-live-cluster-preview"),
      ).toBeInTheDocument(),
    );
    const cmd = screen.getByTestId("deploy-live-cluster-command");
    expect(cmd).toHaveTextContent(/launch-mtds-live\.sh/);
    expect(cmd).toHaveTextContent(/--asset-group cefi/);
    expect(cmd).toHaveTextContent(/--env prod/);

    expect(spy).toHaveBeenCalledWith(
      "/api/data-status/deploy-live-cluster-preview",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("sends asset_group=null in the body for singleton roles", async () => {
    const spy = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            role: "features-cross-cutting",
            asset_group: null,
            deployment_env: "prod",
            launcher_script:
              "deployment-service/scripts/vm/launch-features-cross-cutting.sh",
            command:
              "bash deployment-service/scripts/vm/launch-features-cross-cutting.sh \\\n  --env prod",
            notes: [],
            warnings: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    vi.stubGlobal("fetch", spy);

    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.change(screen.getByTestId("deploy-live-cluster-role"), {
      target: { value: "features-cross-cutting" },
    });
    fireEvent.click(screen.getByTestId("deploy-live-cluster-submit"));

    await waitFor(() =>
      expect(
        screen.getByTestId("deploy-live-cluster-preview"),
      ).toBeInTheDocument(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const callArgs = spy.mock.calls[0]!;
    const init = callArgs[1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.role).toBe("features-cross-cutting");
    expect(body.asset_group).toBeNull();
    expect(body.deployment_env).toBe("prod");
  });

  it("renders the error block when the POST fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("invalid env", {
            status: 400,
            statusText: "Bad Request",
          }),
        ),
      ),
    );
    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.click(screen.getByTestId("deploy-live-cluster-submit"));
    await waitFor(() =>
      expect(
        screen.getByTestId("deploy-live-cluster-error"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("deploy-live-cluster-error")).toHaveTextContent(
      /invalid env/,
    );
  });

  it("renders warnings block when staging env is selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              role: "mtds-live",
              asset_group: "cefi",
              deployment_env: "staging",
              launcher_script:
                "deployment-service/scripts/vm/launch-mtds-live.sh",
              command:
                "bash deployment-service/scripts/vm/launch-mtds-live.sh --asset-group cefi --env staging",
              notes: [],
              warnings: ["--env staging: ensure buckets are provisioned"],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );
    render(<DeployLiveClusterButton />);
    fireEvent.click(screen.getByTestId("deploy-live-cluster-button"));
    fireEvent.change(screen.getByTestId("deploy-live-cluster-env"), {
      target: { value: "staging" },
    });
    fireEvent.click(screen.getByTestId("deploy-live-cluster-submit"));
    await waitFor(() =>
      expect(
        screen.getByTestId("deploy-live-cluster-warnings"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId("deploy-live-cluster-warnings"),
    ).toHaveTextContent(/buckets are provisioned/);
  });
});
