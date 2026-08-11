"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isTopModal, pushModalClose } from "@/components/ui/modalStack";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Rendered in the header, left of the close button */
  headerAction?: ReactNode;
  /** @deprecated use size="lg" */
  wide?: boolean;
  /** md default, lg ~2xl, xl ~5xl, full ~ almost viewport */
  size?: "md" | "lg" | "xl" | "full";
};

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true",
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  headerAction,
  wide = false,
  size,
}: ModalProps) {
  const resolvedSize: "md" | "lg" | "xl" | "full" = size ?? (wide ? "lg" : "md");
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus trap + body scroll lock. Depends only on `open` so unstable
  // parent onClose identities cannot steal focus on every keystroke.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const raf = requestAnimationFrame(() => {
      if (!panel) return;
      const focusables = getFocusable(panel);
      const initial =
        focusables.find(
          (el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA",
        ) ??
        focusables[0] ??
        panel;
      initial?.focus();
    });

    const close = () => onCloseRef.current();
    const popStack = pushModalClose(close);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isTopModal(close)) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      // Only the topmost modal traps focus.
      if (!isTopModal(close)) return;
      const items = getFocusable(panel);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      popStack();
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      className={[
        "fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center",
        resolvedSize === "full" ? "sm:p-3" : "sm:p-6",
      ].join(" ")}
    >
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[rgba(15,23,32,0.36)] backdrop-blur-[2px] transition-opacity"
        onClick={() => onCloseRef.current()}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={[
          "relative z-[81] flex w-full flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-white shadow-[var(--shadow-elevated)] outline-none sm:rounded-3xl",
          resolvedSize === "full"
            ? "max-h-[min(98dvh,72rem)] sm:max-w-[min(99vw,110rem)]"
            : resolvedSize === "xl"
            ? "max-h-[min(96dvh,56rem)] sm:max-w-5xl"
            : resolvedSize === "lg"
              ? "max-h-[min(92dvh,44rem)] sm:max-w-2xl"
              : "max-h-[min(92dvh,44rem)] sm:max-w-lg",
          "animate-[popoverIn_220ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
        ].join(" ")}
      >
        <div
          className={[
            "flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)]",
            resolvedSize === "full" || resolvedSize === "xl"
              ? "px-5 py-3 sm:px-6"
              : "px-5 py-4 sm:px-6",
          ].join(" ")}
        >
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[16px] font-semibold tracking-[-0.02em] text-[var(--ink)]"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descId}
                className={[
                  "mt-0.5 text-[12.5px] text-[var(--muted)]",
                  resolvedSize === "full" ? "line-clamp-2" : "truncate",
                ].join(" ")}
              >
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerAction}
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div
          className={[
            "docs-scroll min-h-0 flex-1 overflow-y-auto",
            resolvedSize === "full" || resolvedSize === "xl"
              ? "px-5 py-3 sm:px-6"
              : "px-5 py-4 sm:px-6",
          ].join(" ")}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
