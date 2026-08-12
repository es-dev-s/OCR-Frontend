"use client";

import { useRef, useState } from "react";
import { Eye, FileUp, Loader2, X } from "lucide-react";
import { DOCUMENT_ACCEPT, formatBytes, validateDocumentFile } from "@/lib/files";
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

/** Case-insensitive key for comparing intake values. */
export function normalizeMetaKey(value: string): string {
  return normalizeMeta(value).toLowerCase();
}

export type IntakeMetaFields = Pick<
  TextFields,
  "client_name" | "erp_code" | "anzsco" | "team" | "member"
>;

export function applyMetaProfile<T extends IntakeMetaFields>(
  form: T,
  profile: {
    client_name: string;
    erp_code: string;
    anzsco: string;
    team: string;
    member: string;
  },
): T {
  return {
    ...form,
    client_name: profile.client_name.slice(0, MAX_META),
    erp_code: profile.erp_code.slice(0, MAX_META),
    anzsco: (profile.anzsco || "").slice(0, MAX_META),
    team: profile.team.slice(0, MAX_META),
    member: profile.member.slice(0, MAX_META),
  };
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
    <div className="block min-w-0">
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
  titleValue,
  titleDetecting,
  disabled,
  check,
  onPick,
  onClear,
  onViewOriginal,
}: {
  slot: SourceSlotNum;
  file: File | null;
  existingName?: string | null;
  /** Fixed PDF title for this source (detected / original, not editable). */
  titleValue?: string;
  titleDetecting?: boolean;
  disabled: boolean;
  check?: SourceCheckState;
  onPick: (file: File | null) => void;
  onClear: () => void;
  onViewOriginal?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = `doc-source-${slot}`;
  const hasFile = Boolean(file || existingName);
  const fileLabel = file
    ? file.name
    : existingName
      ? existingName
      : "Optional";

  // Fixed-height status row keeps the grid from jumping when checks resolve.
  let statusLabel = "\u00a0";
  let statusTitle: string | undefined;
  let statusTone = "text-[var(--muted-soft)]";
  if (hasFile) {
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
          <p className="truncate text-[11px] text-[var(--muted)]" title={fileLabel}>
            {fileLabel}
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

      {hasFile ? (
        <div className="mt-2 border-t border-[var(--border)] pt-1.5">
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--muted-soft)]">
            PDF title
          </p>
          <div className="flex min-h-[1.75rem] items-start gap-1.5">
            {titleDetecting ? (
              <>
                <Loader2
                  className="mt-0.5 size-3.5 shrink-0 animate-spin text-[var(--muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <p className="text-[12px] text-[var(--muted)]">Detecting title…</p>
              </>
            ) : (
              <p
                className="min-w-0 flex-1 break-words text-[12.5px] font-medium leading-snug text-[var(--ink)]"
                title={titleValue?.trim() || undefined}
              >
                {titleValue?.trim() || "—"}
              </p>
            )}
          </div>
        </div>
      ) : null}

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

/**
 * Source intake dropzone for Add Document.
 * - Single mode: one file (legacy).
 * - Multi mode: drop/browse up to `remaining` files at once; parent shows slots.
 */
export function SourceDropzone({
  file,
  titleValue,
  titleDetecting,
  disabled,
  check,
  onPick,
  onClear,
  onViewOriginal,
  remaining = 1,
  onPickMany,
}: {
  file?: File | null;
  titleValue?: string;
  titleDetecting?: boolean;
  disabled: boolean;
  check?: SourceCheckState;
  onPick?: (file: File | null) => void;
  onClear?: () => void;
  onViewOriginal?: () => void;
  /** How many more sources can be added (multi mode). */
  remaining?: number;
  /** When set, dropzone accepts multiple files and calls this. */
  onPickMany?: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const multi = typeof onPickMany === "function";
  const canAdd = multi ? remaining > 0 : true;

  const isChecking = check?.status === "checking";
  const isDuplicate = check?.status === "duplicate";
  const isError = check?.status === "error";
  const isReady = check?.status === "unique";

  const badge = (() => {
    if (multi || !file) return null;
    if (isChecking) {
      return {
        label: "Checking",
        className: "bg-[#eff6ff] text-[#1d4ed8]",
        spinning: true,
      };
    }
    if (isDuplicate) {
      return {
        label: check.near ? "Near match" : "Already exists",
        className: "bg-orange-50 text-orange-800",
        spinning: false,
      };
    }
    if (isError) {
      return {
        label: "Check failed",
        className: "bg-red-50 text-red-700",
        spinning: false,
      };
    }
    if (isReady) {
      return {
        label: "Ready",
        className: "bg-emerald-50 text-emerald-800",
        spinning: false,
      };
    }
    return {
      label: "Selected",
      className: "bg-[var(--surface-muted)] text-[var(--muted)]",
      spinning: false,
    };
  })();

  const takeFiles = (list: FileList | File[] | null | undefined) => {
    if (disabled || !list) return;
    const files = Array.from(list).filter(Boolean);
    if (files.length === 0) return;
    if (multi) {
      onPickMany?.(files.slice(0, Math.max(0, remaining)));
      return;
    }
    onPick?.(files[0] ?? null);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || !canAdd) return;
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && canAdd) e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragging(false);
    if (disabled || !canAdd) return;
    takeFiles(e.dataTransfer.files);
  };

  if (multi && remaining <= 0) return null;

  const showSelected = !multi && Boolean(file);

  return (
    <div className="space-y-2.5">
      <div
        role="button"
        tabIndex={disabled || !canAdd ? -1 : 0}
        aria-disabled={disabled || !canAdd}
        aria-label={
          multi
            ? `Drop up to ${remaining} source file${remaining === 1 ? "" : "s"}, or browse`
            : file
              ? `Selected source ${file.name}. Drop a file to replace, or browse.`
              : "Drop a PDF or image here, or browse to upload"
        }
        onClick={() => {
          if (!disabled && canAdd) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled || !canAdd) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={[
          "relative cursor-pointer rounded-2xl border border-dashed px-4 transition-[border-color,background-color,box-shadow,min-height]",
          disabled || !canAdd ? "cursor-not-allowed opacity-60" : "",
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_3px_var(--accent-soft)]"
            : isDuplicate && !multi
              ? "border-orange-300 bg-orange-50/40"
              : isError && !multi
                ? "border-red-300 bg-red-50/40"
                : showSelected
                  ? "border-[var(--border-strong)] bg-[var(--canvas)]"
                  : "border-[var(--border-strong)] bg-[var(--canvas)] hover:border-[var(--ink)]/35 hover:bg-white",
          showSelected
            ? "py-3.5"
            : "flex min-h-[7.5rem] flex-col items-center justify-center py-5 text-center",
        ].join(" ")}
      >
        {showSelected && file ? (
          <div className="flex w-full items-center gap-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--ink)] shadow-sm ring-1 ring-[var(--border)]">
              <FileUp className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p
                  className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)]"
                  title={file.name}
                >
                  {file.name}
                </p>
                {badge ? (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${badge.className}`}
                  >
                    {badge.spinning ? (
                      <Loader2 className="size-3 animate-spin" strokeWidth={1.75} />
                    ) : null}
                    {badge.label}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                <span className="tabular-nums">{formatBytes(file.size)}</span>
                <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                Drop to replace, or click to browse
              </p>
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onClear?.();
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white hover:text-[var(--ink)] disabled:opacity-50"
              aria-label="Remove source file"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <>
            <span
              className={[
                "mb-2.5 flex size-11 items-center justify-center rounded-2xl",
                dragging
                  ? "bg-white text-[var(--accent)]"
                  : "bg-white text-[var(--ink)] ring-1 ring-[var(--border)]",
              ].join(" ")}
            >
              <FileUp className="size-[18px]" strokeWidth={1.75} />
            </span>
            <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
              {dragging
                ? multi
                  ? "Drop files to upload"
                  : "Drop file to upload"
                : multi
                  ? remaining === 4
                    ? "Drag & drop sources here"
                    : `Add ${remaining} more source${remaining === 1 ? "" : "s"}`
                  : "Drag & drop your source here"}
            </p>
            <p className="mt-1 max-w-sm text-[12px] leading-snug text-[var(--muted)]">
              {multi
                ? `Up to ${remaining} file${remaining === 1 ? "" : "s"} · PDF, PNG, JPG, TIFF, or WebP · max 50 MB each`
                : "PDF, PNG, JPG, TIFF, or WebP · max 50 MB"}
            </p>
            <span className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] bg-white px-3 text-[12px] font-medium text-[var(--ink)]">
              Browse files
            </span>
          </>
        )}

        <input
          ref={inputRef}
          id={multi ? "doc-sources-multi" : "doc-source-1"}
          name={multi ? "sources" : "source_1"}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple={multi}
          className="hidden"
          disabled={disabled || !canAdd}
          tabIndex={-1}
          onChange={(e) => {
            takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {!multi && isDuplicate && check ? (
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/90 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-orange-800/80">
              {check.near ? "Similar document found" : "Already in library"}
              {check.similarity != null
                ? ` · ${Math.round(check.similarity * 100)}%`
                : ""}
            </p>
            <p
              className="mt-0.5 truncate text-[12.5px] font-medium text-orange-950"
              title={
                [check.title, check.filename].filter(Boolean).join(" · ") ||
                undefined
              }
            >
              {check.title || check.filename || "Matching document"}
            </p>
          </div>
          {onViewOriginal ? (
            <button
              type="button"
              onClick={onViewOriginal}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 text-[12px] font-medium text-orange-900 hover:bg-orange-100"
            >
              <Eye className="size-3.5" strokeWidth={1.75} />
              Compare
            </button>
          ) : null}
        </div>
      ) : null}

      {!multi && isError && check.status === "error" ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {check.message}
        </div>
      ) : null}

      {!multi && file ? (
        <div>
          <p className="mb-1 text-[12px] font-medium text-[var(--ink)]">
            PDF title
          </p>
          <div className="flex min-h-[2.5rem] items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
            {titleDetecting ? (
              <>
                <Loader2
                  className="mt-0.5 size-3.5 shrink-0 animate-spin text-[var(--muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <p className="text-[13px] text-[var(--muted)]">Detecting title…</p>
              </>
            ) : (
              <p
                className="min-w-0 flex-1 break-words text-[13px] font-medium leading-snug text-[var(--ink)]"
                title={titleValue?.trim() || undefined}
              >
                {titleValue?.trim() || "—"}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
