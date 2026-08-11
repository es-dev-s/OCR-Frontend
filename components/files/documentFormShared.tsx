"use client";

import { useRef } from "react";
import { Eye, X } from "lucide-react";
import { DOCUMENT_ACCEPT, validateDocumentFile } from "@/lib/files";
import {
  SOURCE_SLOTS,
  sourceKey,
  type SourceKey,
  type SourceSlotNum,
} from "@/lib/sources";

export const MAX_META = 200;

export type TextFields = {
  title: string;
  client_name: string;
  erp_code: string;
  anzsco: string;
  team: string;
  member: string;
};

export type { SourceKey, SourceSlotNum };
export { SOURCE_SLOTS, sourceKey };
export type FieldKey = keyof TextFields;
export type FieldErrors = Partial<Record<FieldKey | "sources" | "form", string>>;

export function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return (base || name)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_META);
}

export function normalizeMeta(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_META);
}

export function validateField(
  key: FieldKey,
  value: string,
  opts?: { titleRequired?: boolean },
): string | undefined {
  const v = normalizeMeta(value);
  switch (key) {
    case "title":
      if (opts?.titleRequired !== false && !v) return "PDF title is required";
      break;
    case "client_name":
      if (!v) return "Client name is required";
      break;
    case "erp_code":
      if (!v) return "ERP code is required";
      break;
    case "team":
      if (!v) return "Team is required";
      break;
    case "member":
      if (!v) return "Member is required";
      break;
    case "anzsco":
      break;
  }
  if (value.length > MAX_META) return `Max ${MAX_META} characters`;
  return undefined;
}

export function validateSources(
  sources: Partial<Record<SourceKey, File | null>>,
  opts?: { requireAtLeastOne?: boolean },
): string | undefined {
  const files = SOURCE_SLOTS.map((slot) => sources[sourceKey(slot)]).filter(
    Boolean,
  ) as File[];
  if (opts?.requireAtLeastOne && files.length === 0) {
    return "Upload at least one source PDF";
  }
  for (const slot of SOURCE_SLOTS) {
    const f = sources[sourceKey(slot)];
    if (!f) continue;
    const msg = validateDocumentFile(f);
    if (msg) return `Source ${slot}: ${msg}`;
  }
  return undefined;
}

export function Field({
  id,
  label,
  required,
  error,
  children,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const hintId = `${id}-hint`;
  const errId = `${id}-error`;
  return (
    <div className="block">
      <label
        htmlFor={id}
        className="mb-1 flex items-center gap-1 text-[12px] font-medium text-[var(--ink)]"
      >
        {label}
        {required && (
          <span className="text-red-500" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span id={errId} role="alert" className="mt-1 block text-[11px] text-red-600">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="mt-1 block text-[11px] text-[var(--muted-soft)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border bg-[var(--canvas)] px-2.5 text-[13px] text-[var(--ink)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-soft)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60";

export function inputBorder(error?: string) {
  return error
    ? "border-red-400 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
    : "border-[var(--border-strong)]";
}

export type SourceCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "unique" }
  | {
      status: "duplicate";
      title: string;
      filename: string;
      peerSlot?: number;
      fileId?: string;
      kind?: string;
      matchSlot?: number;
      /** True when matched by text near-dup (not exact SHA). */
      near?: boolean;
      similarity?: number;
    }
  | { status: "error"; message: string };

export function SourceSlot({
  slot,
  file,
  existingName,
  disabled,
  check,
  onPick,
  onClear,
  onViewOriginal,
}: {
  slot: SourceSlotNum;
  file: File | null;
  existingName?: string | null;
  disabled: boolean;
  check?: SourceCheckState;
  onPick: (file: File | null) => void;
  onClear: () => void;
  onViewOriginal?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `doc-source-${slot}`;
  const label = file
    ? file.name
    : existingName
      ? existingName
      : "Optional";

  // Fixed-height status row keeps the grid from jumping when checks resolve.
  let statusLabel = "\u00a0";
  let statusTitle: string | undefined;
  let statusTone = "text-[var(--muted-soft)]";
  if (file || existingName) {
    if (check?.status === "checking") {
      statusLabel = "Checking…";
    } else if (check?.status === "unique") {
      statusLabel = "Ready";
      statusTone = "text-[var(--muted)]";
    } else if (check?.status === "duplicate") {
      const where =
        check.peerSlot != null ? `Source ${check.peerSlot}` : check.title;
      statusLabel = where;
      statusTitle = [
        check.near ? "Near match" : "Exact match",
        check.similarity != null
          ? `${Math.round(check.similarity * 100)}% similar`
          : null,
        check.title,
        check.filename && check.filename !== check.title
          ? check.filename
          : null,
        check.peerSlot != null
          ? `matches Source ${check.peerSlot}`
          : "in corpus",
      ]
        .filter(Boolean)
        .join(" · ");
      statusTone = "text-orange-600";
    } else if (check?.status === "error") {
      statusLabel = "Check failed";
      statusTitle = check.message;
      statusTone = "text-red-600";
    } else if (existingName && !file) {
      statusLabel = "Attached";
      statusTone = "text-[var(--muted)]";
    } else {
      statusLabel = "Selected";
      statusTone = "text-[var(--muted)]";
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-[var(--ink)]">
            Source {slot}
          </p>
          <p className="truncate text-[11px] text-[var(--muted)]" title={label}>
            {label}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {file && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white hover:text-[var(--ink)] disabled:opacity-50"
              aria-label={`Clear new source ${slot}`}
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-7 items-center rounded-lg border border-[var(--border-strong)] bg-white px-2 text-[11.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {file || existingName ? "Change" : "Add"}
          </button>
        </div>
      </div>

      <div
        className="mt-2 flex h-7 items-center justify-between gap-1.5 border-t border-[var(--border)] pt-1.5"
        role="status"
        aria-live="polite"
      >
        <p
          className={`min-w-0 truncate text-[10.5px] font-medium ${statusTone}`}
          title={statusTitle}
        >
          {check?.status === "duplicate" && (
            <span className="mr-1 font-semibold text-orange-700">
              {check.near ? "Near" : "Match"}
            </span>
          )}
          {statusLabel}
          {check?.status === "duplicate" &&
            check.near &&
            check.similarity != null && (
              <span className="ml-1 tabular-nums text-orange-700/80">
                {Math.round(check.similarity * 100)}%
              </span>
            )}
        </p>
        {check?.status === "duplicate" && onViewOriginal ? (
          <button
            type="button"
            onClick={onViewOriginal}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1 text-[10.5px] font-medium text-orange-700 hover:bg-orange-50"
            title={statusTitle || "Compare with matched original"}
          >
            <Eye className="size-3" strokeWidth={1.75} />
            Compare
          </button>
        ) : (
          <span className="inline-block h-6 w-12 shrink-0" aria-hidden />
        )}
      </div>

      <input
        ref={inputRef}
        id={id}
        name={id}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        disabled={disabled}
        tabIndex={-1}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}
