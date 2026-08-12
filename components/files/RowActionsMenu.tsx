"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { PopoverPanel } from "@/components/ui/PopoverPanel";

export type RowActionsMenuProps = {
  docTitle: string;
  openRow?: boolean;
  uploading?: boolean;
  deleting?: boolean;
  canCopyShare?: boolean;
  linkCopied?: boolean;
  onCopyShare: () => void | Promise<void>;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrefetch?: () => void;
};

/**
 * Compact ⋯ menu for table Actions — keeps the column narrow and scalable.
 */
export function RowActionsMenu({
  docTitle,
  openRow = false,
  uploading = false,
  deleting = false,
  canCopyShare = false,
  linkCopied = false,
  onCopyShare,
  onOpen,
  onEdit,
  onDelete,
  onPrefetch,
}: RowActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  const close = useCallback(() => setMenuOpen(false), []);

  const run = useCallback(
    (fn: () => void | Promise<void>) => {
      close();
      void fn();
    },
    [close],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={uploading}
        onMouseEnter={onPrefetch}
        onClick={() => setMenuOpen((v) => !v)}
        className={[
          "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-wait disabled:opacity-50",
          menuOpen || openRow
            ? "bg-white text-[var(--ink)] shadow-sm"
            : "text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]",
        ].join(" ")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={labelId}
        aria-label={`Actions for ${docTitle}`}
      >
        <MoreHorizontal className="size-4" strokeWidth={1.75} />
      </button>

      <PopoverPanel
        open={menuOpen}
        onClose={close}
        triggerRef={triggerRef}
        width={208}
        label={`Actions for ${docTitle}`}
        className="p-1.5"
      >
        <div id={labelId} role="menu" className="flex flex-col gap-0.5">
          <MenuItem
            disabled={!canCopyShare}
            onClick={() => run(onCopyShare)}
            icon={
              linkCopied ? (
                <Check className="size-3.5 text-emerald-600" strokeWidth={2.25} />
              ) : (
                <Link2 className="size-3.5" strokeWidth={1.75} />
              )
            }
            label={linkCopied ? "URL copied" : "Copy public URL"}
            tone={linkCopied ? "success" : "default"}
          />
          <MenuItem
            disabled={uploading}
            onClick={() => run(onOpen)}
            icon={<ExternalLink className="size-3.5" strokeWidth={1.75} />}
            label="Open file"
          />
          <MenuItem
            disabled={uploading || deleting}
            onClick={() => run(onEdit)}
            icon={<Pencil className="size-3.5" strokeWidth={1.75} />}
            label="Edit"
          />
          <div className="my-1 h-px bg-[var(--border)]" role="separator" />
          <MenuItem
            disabled={deleting || uploading}
            onClick={() => run(onDelete)}
            icon={
              deleting ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
              ) : (
                <Trash2 className="size-3.5" strokeWidth={1.75} />
              )
            }
            label={deleting ? "Deleting…" : "Delete"}
            tone="danger"
          />
        </div>
      </PopoverPanel>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={[
        "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "text-red-600 hover:bg-red-50"
          : tone === "success"
            ? "text-emerald-700 hover:bg-emerald-50"
            : "text-[var(--ink)] hover:bg-[var(--canvas)]",
      ].join(" ")}
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--canvas)] text-current">
        {icon}
      </span>
      {label}
    </button>
  );
}
