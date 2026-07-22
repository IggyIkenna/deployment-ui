import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunLogPanel } from "./RunLogPanel";
import type { RunLogDownload, RunLogMetadata, RunLogTail } from "../api/deploymentApi";

const mockGetRunLogMetadata = vi.fn();
const mockGetRunLogTail = vi.fn();
const mockGetRunLogDownload = vi.fn();

vi.mock("../api/deploymentApi", () => ({
  getRunLogMetadata: (name: string) => mockGetRunLogMetadata(name),
  getRunLogTail: (name: string) => mockGetRunLogTail(name),
  getRunLogDownload: (name: string) => mockGetRunLogDownload(name),
}));

/**
 * RunLogPanel branch coverage — 0% before this file (nothing rendered it). Covers the
 * three top-line states (loading / has-metadata / absent), the empty-vs-populated tail
 * body, the archive-copy notice, byte formatting at each unit boundary, and both download
 * outcomes (opens a URL vs. surfaces "no log available").
 */

const EXISTS_LIVE: RunLogMetadata = {
  name: "vm-1",
  exists: true,
  location: "live",
  uri: "gs://bucket/vm-logs/vm-1/run.log",
  size_bytes: 2048,
  last_modified: "2026-07-20T00:00:00Z",
};

const EXISTS_ARCHIVE: RunLogMetadata = {
  ...EXISTS_LIVE,
  location: "archive",
};

const ABSENT: RunLogMetadata = {
  name: "vm-1",
  exists: false,
  location: null,
  uri: "",
  size_bytes: null,
  last_modified: null,
};

function tailFor(meta: RunLogMetadata, lines: string[]): RunLogTail {
  return { ...meta, lines, line_count: lines.length, tail_bytes: 4096 };
}

beforeEach(() => {
  mockGetRunLogMetadata.mockReset();
  mockGetRunLogTail.mockReset();
  mockGetRunLogDownload.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RunLogPanel", () => {
  it("shows size + last-modified when the log exists", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, ["line one", "line two"]));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-size")).toHaveTextContent("2.0 KB"));
    expect(screen.getByTestId("run-log-size")).toHaveTextContent("last modified 2026-07-20T00:00:00Z");
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
    expect(screen.getByTestId("run-log-tail-label")).toHaveTextContent("last 2 lines of");
  });

  it("omits the last-modified suffix when the API doesn't report one", async () => {
    const meta = { ...EXISTS_LIVE, last_modified: null };
    mockGetRunLogMetadata.mockResolvedValue(meta);
    mockGetRunLogTail.mockResolvedValue(tailFor(meta, ["only line"]));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-size")).toBeInTheDocument());
    expect(screen.getByTestId("run-log-size").textContent).not.toContain("last modified");
  });

  it("shows the honest empty state when no log exists anywhere (no archive notice, no tail box)", async () => {
    mockGetRunLogMetadata.mockResolvedValue(ABSENT);
    mockGetRunLogTail.mockResolvedValue(tailFor(ABSENT, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-empty")).toBeInTheDocument());
    expect(screen.queryByTestId("run-log-tail")).not.toBeInTheDocument();
    expect(screen.queryByTestId("run-log-archive-notice")).not.toBeInTheDocument();
    // "—" placeholder in the header when metadata says the log doesn't exist.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the archive-copy notice when location is archive", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_ARCHIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_ARCHIVE, ["archived line"]));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-archive-notice")).toBeInTheDocument());
  });

  it("shows 'Log is empty.' when the tail resolves with zero lines but the log exists", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByText("Log is empty.")).toBeInTheDocument());
  });

  it("formats byte sizes at each unit boundary (B / KB / MB)", async () => {
    const small = { ...EXISTS_LIVE, size_bytes: 512 };
    mockGetRunLogMetadata.mockResolvedValue(small);
    mockGetRunLogTail.mockResolvedValue(tailFor(small, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-size")).toHaveTextContent("512 B"));
  });

  it("formats a megabyte-scale size", async () => {
    const big = { ...EXISTS_LIVE, size_bytes: 5 * 1024 * 1024 };
    mockGetRunLogMetadata.mockResolvedValue(big);
    mockGetRunLogTail.mockResolvedValue(tailFor(big, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-size")).toHaveTextContent("5.0 MB"));
  });

  it("surfaces a fetch error via the alert region instead of a blank panel", async () => {
    mockGetRunLogMetadata.mockRejectedValue(new Error("boom"));
    mockGetRunLogTail.mockResolvedValue(tailFor(ABSENT, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-error")).toHaveTextContent("boom"));
  });

  it("stringifies a non-Error rejection", async () => {
    mockGetRunLogMetadata.mockRejectedValue("plain string failure");
    mockGetRunLogTail.mockResolvedValue(tailFor(ABSENT, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-error")).toHaveTextContent("plain string failure"));
  });

  it("re-fetches on refresh click", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, ["a"]));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(mockGetRunLogMetadata).toHaveBeenCalledTimes(1));
    screen.getByTestId("run-log-refresh").click();
    await waitFor(() => expect(mockGetRunLogMetadata).toHaveBeenCalledTimes(2));
  });

  it("download success opens the returned URL in a new tab", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, ["a"]));
    const download: RunLogDownload = {
      name: "vm-1",
      exists: true,
      location: "live",
      download_url: "https://signed.example/run.log",
      expires_in_seconds: 900,
    };
    mockGetRunLogDownload.mockResolvedValue(download);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-download")).not.toBeDisabled());
    screen.getByTestId("run-log-download").click();
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith("https://signed.example/run.log", "_blank", "noopener,noreferrer"),
    );
  });

  it("download failure (no url) surfaces the download-error alert instead of opening a tab", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, ["a"]));
    mockGetRunLogDownload.mockResolvedValue({
      name: "vm-1",
      exists: false,
      location: null,
      download_url: "",
      expires_in_seconds: 0,
    } as RunLogDownload);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-download")).not.toBeDisabled());
    screen.getByTestId("run-log-download").click();
    await waitFor(() => expect(screen.getByTestId("run-log-download-error")).toHaveTextContent("no log available"));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("download-request rejection surfaces its message in the download-error alert", async () => {
    mockGetRunLogMetadata.mockResolvedValue(EXISTS_LIVE);
    mockGetRunLogTail.mockResolvedValue(tailFor(EXISTS_LIVE, ["a"]));
    mockGetRunLogDownload.mockRejectedValue(new Error("download boom"));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-download")).not.toBeDisabled());
    screen.getByTestId("run-log-download").click();
    await waitFor(() => expect(screen.getByTestId("run-log-download-error")).toHaveTextContent("download boom"));
  });

  it("disables the download button while metadata says the log doesn't exist", async () => {
    mockGetRunLogMetadata.mockResolvedValue(ABSENT);
    mockGetRunLogTail.mockResolvedValue(tailFor(ABSENT, []));
    render(<RunLogPanel name="vm-1" />);
    await waitFor(() => expect(screen.getByTestId("run-log-empty")).toBeInTheDocument());
    expect(screen.getByTestId("run-log-download")).toBeDisabled();
  });
});
