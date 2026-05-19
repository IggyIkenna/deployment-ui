import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  detail?: string;
  variant: ToastVariant;
}

interface NotificationContextValue {
  toasts: Toast[];
  addToast: (
    message: string,
    variant?: ToastVariant,
    detail?: string,
    autoDismissMs?: number,
  ) => void;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

let _seq = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (
      message: string,
      variant: ToastVariant = "info",
      detail?: string,
      autoDismissMs = 5000,
    ) => {
      const id = `toast-${++_seq}`;
      setToasts((prev) => [...prev, { id, message, detail, variant }]);
      const timer = setTimeout(() => dismissToast(id), autoDismissMs);
      timers.current.set(id, timer);
    },
    [dismissToast],
  );

  return (
    <NotificationContext.Provider value={{ toasts, addToast, dismissToast }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used inside NotificationProvider",
    );
  return ctx;
}
