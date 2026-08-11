"use client";

import { useCallback, useLayoutEffect, useState } from "react";

export type PopoverCoords = {
  top: number;
  left: number;
  width: number;
  transformOrigin: string;
};

type Options = {
  open: boolean;
  trigger: HTMLElement | null;
  panel: HTMLElement | null;
  /** Preferred panel width in px */
  width: number;
  /** Gap under the trigger */
  offset?: number;
  /** Viewport padding */
  pad?: number;
};

/**
 * Positions a fixed panel under a trigger, clamped to the viewport.
 * Recomputes on open, panel mount, resize, and scroll.
 */
export function useScreenAwarePopover({
  open,
  trigger,
  panel,
  width,
  offset = 8,
  pad = 12,
}: Options): PopoverCoords | null {
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const measure = useCallback(() => {
    if (!open || !trigger) {
      setCoords(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const panelHeight = panel?.offsetHeight || 240;
    const maxWidth = Math.min(width, window.innerWidth - pad * 2);

    let left = rect.right - maxWidth;
    left = Math.max(pad, Math.min(left, window.innerWidth - maxWidth - pad));

    const spaceBelow = window.innerHeight - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const placeBelow =
      spaceBelow >= Math.min(panelHeight, 160) || spaceBelow >= spaceAbove;

    let top: number;
    let transformOrigin: string;

    if (placeBelow) {
      top = rect.bottom + offset;
      transformOrigin = "top right";
    } else {
      top = Math.max(pad, rect.top - offset - panelHeight);
      transformOrigin = "bottom right";
    }

    const maxTop =
      window.innerHeight - pad - Math.min(panelHeight, window.innerHeight - pad * 2);
    top = Math.max(pad, Math.min(top, maxTop));

    setCoords({
      top,
      left,
      width: maxWidth,
      transformOrigin,
    });
  }, [open, trigger, panel, width, offset, pad]);

  useLayoutEffect(() => {
    measure();
    if (!open) return;

    const onRecalc = () => measure();
    window.addEventListener("resize", onRecalc);
    window.addEventListener("scroll", onRecalc, true);
    return () => {
      window.removeEventListener("resize", onRecalc);
      window.removeEventListener("scroll", onRecalc, true);
    };
  }, [open, measure]);

  return coords;
}
