"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScreenAwarePopover } from "@/hooks/useScreenAwarePopover";

type PopoverPanelProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  width: number;
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Screen-aware fixed popover. Renders in a portal so it never
 * fights sidebar layout or sibling navbar menus.
 */
export function PopoverPanel({
  open,
  onClose,
  triggerRef,
  width,
  label,
  children,
  className = "",
}: PopoverPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

  const panelRef = useCallback((node: HTMLDivElement | null) => {
    setPanelEl(node);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const coords = useScreenAwarePopover({
    open,
    trigger: triggerRef.current,
    panel: panelEl,
    width,
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelEl?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, triggerRef, panelEl]);

  if (!mounted || !open) return null;

  // First paint uses provisional coords from trigger; panel mount remeasures.
  const style = coords
    ? {
        top: coords.top,
        left: coords.left,
        width: coords.width,
        transformOrigin: coords.transformOrigin,
        maxHeight: "calc(100dvh - 24px)",
        visibility: "visible" as const,
      }
    : {
        top: 0,
        left: 0,
        width,
        visibility: "hidden" as const,
        maxHeight: "calc(100dvh - 24px)",
      };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      className={[
        "fixed z-[80] overflow-hidden rounded-2xl border border-[var(--border)] bg-white",
        "shadow-[var(--shadow-elevated)]",
        coords ? "animate-[popoverIn_160ms_cubic-bezier(0.22,1,0.36,1)_both]" : "",
        className,
      ].join(" ")}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
