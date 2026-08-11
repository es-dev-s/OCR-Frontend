"use client";

import { ChevronDown } from "lucide-react";

type AccordionItemProps = {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string | number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function AccordionItem({
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
}: AccordionItemProps) {
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-[var(--canvas)]/70"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {title}
            </span>
            {badge !== undefined && badge !== "" && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--muted)]">
                {badge}
              </span>
            )}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          className={[
            "size-4 shrink-0 text-[var(--muted-soft)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open ? "rotate-180" : "rotate-0",
          ].join(" ")}
          strokeWidth={1.75}
        />
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={[
              "px-4 pb-4 pt-0 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              open ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
