import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test render error");
  return <div>Content rendered successfully</div>;
}

function ThrowNullError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("");
  return <div>OK</div>;
}

let _shouldFlipThrow = true;
function FlipChild() {
  if (_shouldFlipThrow) throw new Error("Flip error");
  return <div>Recovered after reset</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("catches render error and shows fallback UI with role=alert", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("displays the caught error message in the fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Test render error")).toBeInTheDocument();
  });

  it("shows fallback text when error has no message", () => {
    render(
      <ErrorBoundary>
        <ThrowNullError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
  });

  it("provides a Try again button that resets error state", () => {
    _shouldFlipThrow = true;
    render(
      <ErrorBoundary>
        <FlipChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Stop throwing before clicking Try again so the reset renders successfully
    _shouldFlipThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("Recovered after reset")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("provides a Reload page button", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: /reload the page/i })).toBeInTheDocument();
  });

  it("accepts a custom fallback title", () => {
    render(
      <ErrorBoundary fallbackTitle="Custom error title">
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom error title")).toBeInTheDocument();
  });
});
