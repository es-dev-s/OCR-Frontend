"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type ExpandPanelProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
};

/**
 * Measured-height expand/collapse. More stable than grid-rows for table rows.
 */
export function ExpandPanel({ open, children, className, id }: ExpandPanelProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);
  const [animating, setAnimating] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (open && !mounted) {
    setMounted(true);
  }

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = innerRef.current;
    if (!el) return;
    let cancelled = false;

    if (reduceMotion) {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return;
        setAnimating(false);
        setHeight(open ? "auto" : 0);
        if (!open) setMounted(false);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
      };
    }

    if (open) {
      const outer = requestAnimationFrame(() => {
        if (cancelled || !innerRef.current) return;
        setAnimating(true);
        setHeight(innerRef.current.scrollHeight);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(outer);
      };
    }

    const current = el.scrollHeight;
    const idRaf = requestAnimationFrame(() => {
      if (cancelled) return;
      setAnimating(true);
      setHeight(current);
      requestAnimationFrame(() => {
        if (!cancelled) setHeight(0);
      });
    });

    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setAnimating(false);
      setMounted(false);
      setHeight(0);
    }, 400);

    return () => {
      cancelled = true;
      cancelAnimationFrame(idRaf);
      window.clearTimeout(timeout);
    };
  }, [open, mounted, reduceMotion]);

  useLayoutEffect(() => {
    if (!mounted || !open || reduceMotion) return;
    const el = innerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      if (!innerRef.current) return;
      setAnimating(false);
      setHeight(innerRef.current.scrollHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, open, reduceMotion]);

  const style: CSSProperties = {
    height: height === "auto" ? "auto" : height,
    overflow: "hidden",
    transition:
      animating && !reduceMotion
        ? "height 320ms cubic-bezier(0.22, 1, 0.36, 1)"
        : undefined,
  };

  return (
    <div
      id={id}
      className={className}
      style={style}
      aria-hidden={!open}
      inert={!open || undefined}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.propertyName !== "height") return;
        setAnimating(false);
        if (!open) {
          setMounted(false);
          setHeight(0);
        } else {
          setHeight("auto");
        }
      }}
    >
      {mounted ? <div ref={innerRef}>{children}</div> : null}
    </div>
  );
}
