import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificationProvider, useNotifications } from "./NotificationContext";

function Harness() {
  const { toasts, addToast, dismissToast } = useNotifications();
  return (
    <div>
      <button
        onClick={() =>
          addToast("VM launched", "success", "ml-train-eth-20260515")
        }
        data-testid="add-success"
      >
        add success
      </button>
      <button
        onClick={() => addToast("Launch failed", "error", "connection refused")}
        data-testid="add-error"
      >
        add error
      </button>
      <button
        onClick={() => addToast("Info msg", "info")}
        data-testid="add-info"
      >
        add info
      </button>
      {toasts.map((t) => (
        <div key={t.id} data-testid={`toast-${t.id}`}>
          <span data-testid="toast-message">{t.message}</span>
          {t.detail && <span data-testid="toast-detail">{t.detail}</span>}
          <span data-testid="toast-variant">{t.variant}</span>
          <button
            onClick={() => dismissToast(t.id)}
            data-testid={`dismiss-${t.id}`}
          >
            dismiss
          </button>
        </div>
      ))}
      <span data-testid="toast-count">{toasts.length}</span>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationContext", () => {
  it("throws when used outside NotificationProvider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(() => render(<Harness />)).toThrow(/NotificationProvider/);
    consoleError.mockRestore();
  });

  it("adds a success toast with correct fields", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-success"));
    expect(screen.getByTestId("toast-message").textContent).toBe("VM launched");
    expect(screen.getByTestId("toast-detail").textContent).toBe(
      "ml-train-eth-20260515",
    );
    expect(screen.getByTestId("toast-variant").textContent).toBe("success");
  });

  it("adds an error toast", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-error"));
    expect(screen.getByTestId("toast-variant").textContent).toBe("error");
    expect(screen.getByTestId("toast-message").textContent).toBe(
      "Launch failed",
    );
  });

  it("adds multiple toasts and shows correct count", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-success"));
    fireEvent.click(screen.getByTestId("add-error"));
    expect(screen.getByTestId("toast-count").textContent).toBe("2");
  });

  it("dismiss removes the toast immediately", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-info"));
    expect(screen.getByTestId("toast-count").textContent).toBe("1");
    const dismissBtn = screen.getByTestId(/^dismiss-/);
    fireEvent.click(dismissBtn);
    expect(screen.getByTestId("toast-count").textContent).toBe("0");
  });

  it("auto-dismisses after default 5 seconds", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-success"));
    expect(screen.getByTestId("toast-count").textContent).toBe("1");
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("toast-count").textContent).toBe("0");
  });

  it("toast persists before auto-dismiss interval elapses", () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByTestId("add-success"));
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByTestId("toast-count").textContent).toBe("1");
  });
});
