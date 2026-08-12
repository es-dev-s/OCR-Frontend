"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Link2 } from "lucide-react";

type ToastTone = "success" | "neutral";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (message) => {
        if (typeof window !== "undefined") {
          // Fallback when provider is missing (should not happen in app).
          console.info(message);
        }
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-3), { id, message, tone }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((item) => (
          <ToastChip key={item.id} item={item} onDone={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastChip({
  item,
  onDone,
}: {
  item: ToastItem;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2400);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white shadow-[var(--shadow-elevated)] animate-[fadeRise_0.28s_var(--shell-ease)_both]"
    >
      {item.tone === "success" ? (
        <Check className="size-3.5 text-emerald-300" strokeWidth={2.25} />
      ) : (
        <Link2 className="size-3.5 text-white/70" strokeWidth={1.75} />
      )}
      {item.message}
    </div>
  );
}
