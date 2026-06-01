import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useNotifications } from "../contexts/NotificationContext";
import type { ToastVariant } from "../contexts/NotificationContext";

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    "border-[var(--color-accent-green)]/40 bg-[var(--color-bg-secondary)] text-[var(--color-accent-green)]",
  error:
    "border-[var(--color-accent-red)]/40 bg-[var(--color-bg-secondary)] text-[var(--color-accent-red)]",
  info: "border-[var(--color-accent-cyan)]/40 bg-[var(--color-bg-secondary)] text-[var(--color-accent-cyan)]",
};

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastStack() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
      data-testid="toast-stack"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            role="status"
            data-testid={`toast-${toast.id}`}
            className={`flex items-start gap-3 rounded-lg border p-3 shadow-lg pointer-events-auto ${VARIANT_STYLES[toast.variant]}`}
          >
            <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                {toast.message}
              </p>
              {toast.detail && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                  {toast.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              aria-label={`Dismiss notification: ${toast.message}`}
              className="shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
