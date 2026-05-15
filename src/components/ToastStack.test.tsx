import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ToastStack } from "./ToastStack";
import { NotificationProvider, useNotifications } from "../contexts/NotificationContext";

function AddToastButton({ message, variant = "success" }: { message: string; variant?: "success" | "error" | "info" }) {
  const { addToast } = useNotifications();
  return (
    <button onClick={() => addToast(message, variant, "detail-text")} data-testid="add-btn">
      add
    </button>
  );
}

function TestApp({ message = "VM launched", variant = "success" as "success" | "error" | "info" }) {
  return (
    <NotificationProvider>
      <AddToastButton message={message} variant={variant} />
      <ToastStack />
    </NotificationProvider>
  );
}

describe("ToastStack", () => {
  it("renders nothing when no toasts", () => {
    render(<TestApp />);
    expect(screen.queryByTestId("toast-stack")).not.toBeInTheDocument();
  });

  it("renders toast after addToast called", () => {
    render(<TestApp message="VM launched" />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByTestId("toast-stack")).toBeInTheDocument();
    expect(screen.getByText("VM launched")).toBeInTheDocument();
  });

  it("shows detail text when provided", () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByText("detail-text")).toBeInTheDocument();
  });

  it("renders error variant toast", () => {
    render(<TestApp message="Launch failed" variant="error" />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByText("Launch failed")).toBeInTheDocument();
  });

  it("dismiss button removes the toast", () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByText("VM launched")).toBeInTheDocument();
    const dismissBtn = screen.getByRole("button", { name: /dismiss notification/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByText("VM launched")).not.toBeInTheDocument();
  });

  it("dismiss button has accessible aria-label", () => {
    render(<TestApp message="Test toast" />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(
      screen.getByRole("button", { name: /dismiss notification: Test toast/i }),
    ).toBeInTheDocument();
  });

  it("toast-stack has aria-live=polite", () => {
    render(<TestApp />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByTestId("toast-stack")).toHaveAttribute("aria-live", "polite");
  });

  it("multiple toasts rendered when multiple added", () => {
    const { rerender } = render(<TestApp message="First" />);
    fireEvent.click(screen.getByTestId("add-btn"));
    rerender(<TestApp message="Second" />);
    fireEvent.click(screen.getByTestId("add-btn"));
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });
});
