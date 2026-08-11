"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, FileText, Search } from "lucide-react";
import { PopoverPanel } from "@/components/ui/PopoverPanel";

type SearchPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

const SUGGESTIONS = [
  { label: "Recent documents", hint: "Browse library", icon: FileText },
  { label: "Invoice batch", hint: "Jump to job", icon: ArrowUpRight },
];

export function SearchPopover({ open, onClose, triggerRef }: SearchPopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  return (
    <PopoverPanel
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      width={360}
      label="Search"
    >
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-3.5">
        <Search className="size-4 shrink-0 text-[var(--muted-soft)]" strokeWidth={1.75} />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search documents…"
          className="h-12 w-full bg-transparent text-[14px] tracking-[-0.01em] text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)]"
        />
        <kbd className="hidden shrink-0 rounded-md border border-[var(--border)] px-1.5 py-0.5 font-sans text-[10px] text-[var(--muted-soft)] sm:inline">
          esc
        </kbd>
      </div>

      <div className="p-1.5">
        <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted-soft)]">
          Suggestions
        </p>
        <ul className="flex flex-col gap-0.5">
          {SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--ink)]">
                    <Icon className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium tracking-[-0.01em] text-[var(--ink)]">
                      {item.label}
                    </span>
                    <span className="block truncate text-[12px] text-[var(--muted)]">
                      {item.hint}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </PopoverPanel>
  );
}
