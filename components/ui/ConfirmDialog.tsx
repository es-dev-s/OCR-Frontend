"use client";

import { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const handleClose = useCallback(() => {
    if (!busyRef.current) onCancelRef.current();
  }, []);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
    >
      <div className="flex items-center justify-end gap-2 pb-1 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={[
            "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-medium text-white transition-colors disabled:opacity-50",
            danger
              ? "bg-red-600 hover:bg-red-700"
              : "bg-[var(--ink)] hover:bg-black",
          ].join(" ")}
        >
          {busy && <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
