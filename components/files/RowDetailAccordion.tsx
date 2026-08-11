"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Eye,
  ExternalLink,
  GitCompare,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScanSearch,
  Trash2,
} from "lucide-react";
import {
  displayTitle,
  fileContentURL,
  type DocumentSource,
  type DuplicateRecord,
  type FileRecord,
  type MatchRecord,
} from "@/lib/api";
import { formatBytes, formatUploadedAt, validateDocumentFile } from "@/lib/files";
import { SOURCE_SLOT_COUNT, SOURCE_SLOTS, isSourceSlot } from "@/lib/sources";
import {
  IntakeCompareModal,
  type ReviewCompareTarget,
} from "@/components/files/IntakeCompareModal";
import { SourcePreviewModal } from "@/components/files/SourcePreviewModal";
import {
  MatchCompareModal,
  peerSlotFromDetail,
  type CompareTarget,
} from "@/components/files/MatchCompareModal";
import {
  FileDetailsModal,
  type FileDetailsTarget,
} from "@/components/files/FileDetailsModal";

type RowDetailAccordionProps = {
  file: FileRecord;
  matches?: MatchRecord[];
  loading: boolean;
  deepScanning: boolean;
  replacing?: boolean;
  deleting?: boolean;
  deletingDupId?: string | null;
  message?: string | null;
  detailError?: string | null;
  onDeepScan: () => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
  onDeleteDuplicate?: (dup: DuplicateRecord) => void;
  onEdit: () => void;
};

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function openFile(id: string) {
  window.open(fileContentURL(id), "_blank", "noopener,noreferrer");
}

function sourceLineMeta(source: DocumentSource): {
  label: string;
  tone: string;
  confidence: number | null;
  validating: boolean;
} {
  const validating =
    source.match_status === "pending" || source.match_status === "processing";
  const confidence =
    source.confidence_percent ??
    (source.similarity != null ? source.similarity * 100 : null);

  if (validating) {
    return {
      label: "Checking",
      tone: "text-[#1d4ed8]",
      confidence: null,
      validating: true,
    };
  }
  if (source.match_status === "failed") {
    return { label: "Failed", tone: "text-red-600", confidence, validating: false };
  }
  if (source.match_status === "skipped_no_text") {
    return {
      label: "No text",
      tone: "text-amber-700",
      confidence,
      validating: false,
    };
  }
  switch (source.decision) {
    case "exact_bytes":
    case "auto_duplicate":
      return {
        label: "Match",
        tone: "text-orange-600",
        confidence,
        validating: false,
      };
    case "needs_review":
      return {
        label: "Review",
        tone: "text-amber-700",
        confidence,
        validating: false,
      };
    case "unique":
      return {
        label: "Unique",
        tone: "text-[var(--muted)]",
        confidence,
        validating: false,
      };
    default:
      return {
        label: source.decision_label || "Done",
        tone: "text-[var(--muted)]",
        confidence,
        validating: false,
      };
  }
}

function isComparableMatch(source: DocumentSource): boolean {
  return (
    source.decision === "exact_bytes" ||
    source.decision === "auto_duplicate" ||
    source.decision === "needs_review"
  );
}

function dupTierLabel(dup: DuplicateRecord): string {
  if (dup.review_status === "approved") return "Approved exact";
  if (dup.match_tier === 0) return "Exact bytes";
  if (dup.match_tier === 2) return "Deep Scan";
  if (dup.source === "upload") return "Exact upload";
  return `Tier ${dup.match_tier || 1}`;
}

export function RowDetailAccordion({
  file,
  matches = [],
  loading,
  deepScanning,
  replacing = false,
  deleting = false,
  deletingDupId = null,
  message,
  detailError,
  onDeepScan,
  onReplace,
  onDelete,
  onDeleteDuplicate,
  onEdit,
}: RowDetailAccordionProps) {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<DocumentSource | null>(
    null,
  );
  const [compareTarget, setCompareTarget] = useState<CompareTarget | null>(
    null,
  );
  const [dupCompare, setDupCompare] = useState<ReviewCompareTarget | null>(
    null,
  );
  const [detailsTarget, setDetailsTarget] = useState<FileDetailsTarget | null>(
    null,
  );
  const [dupsOpen, setDupsOpen] = useState(false);

  // Each row opens with Matched duplicates collapsed.
  useEffect(() => {
    setDupsOpen(false);
  }, [file.id]);

  const sourceSlots = useMemo(() => {
    const bySlot = new Map(
      (file.sources ?? [])
        .filter((s) => isSourceSlot(s.slot))
        .map((s) => [s.slot as (typeof SOURCE_SLOTS)[number], s]),
    );
    return SOURCE_SLOTS.map((slot) => ({
      slot,
      source: bySlot.get(slot) ?? null,
    }));
  }, [file.sources]);

  const sourcesBySlot = useMemo(() => {
    const map = new Map<number, DocumentSource>();
    for (const s of file.sources ?? []) map.set(s.slot, s);
    return map;
  }, [file.sources]);

  const openSourceCompare = (source: DocumentSource) => {
    const peerSlot = peerSlotFromDetail(source.decision_detail);
    let peer =
      peerSlot != null ? sourcesBySlot.get(peerSlot) ?? null : null;
    // Fallback: same hash, or first other attached source.
    if (!peer) {
      peer =
        (file.sources ?? []).find(
          (s) =>
            s.slot !== source.slot &&
            s.sha256_hash &&
            s.sha256_hash === source.sha256_hash,
        ) ??
        (file.sources ?? []).find((s) => s.slot !== source.slot) ??
        null;
    }
    if (!peer) {
      setCompareTarget(null);
      setPreviewSource(source);
      return;
    }
    // Always put the lower slot on the left for a stable layout.
    const [left, right] =
      source.slot <= peer.slot ? [source, peer] : [peer, source];
    setPreviewSource(null);
    setCompareTarget({ kind: "sources", left, right });
  };

  const openCorpusCompare = (match: MatchRecord) => {
    setPreviewSource(null);
    setDupCompare(null);
    setCompareTarget({ kind: "corpus", match });
  };

  const openDuplicateCompare = (dup: DuplicateRecord) => {
    setPreviewSource(null);
    setCompareTarget(null);
    const title = displayTitle(dup);
    setDupCompare({
      kind: "review",
      decision:
        dup.review_status === "approved"
          ? "Approved exact duplicate"
          : dup.match_tier === 0
            ? "Exact byte duplicate"
            : "Matched duplicate",
      description: [
        dupTierLabel(dup),
        dup.confidence_percent != null
          ? `${Math.round(dup.confidence_percent)}% similar`
          : null,
        dup.uploader_name ? `uploaded by ${dup.uploader_name}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      left: {
        url: fileContentURL(file.id),
        title: displayTitle(file),
        filename: file.original_filename || "original.pdf",
        size: file.byte_size,
        eyebrow: "Original · this document",
        openLabel: "Open original in new tab",
      },
      right: {
        url: fileContentURL(dup.open_file_id || dup.id),
        title,
        filename: dup.original_filename || title,
        size: dup.byte_size,
        eyebrow: dup.uploader_name
          ? `Duplicate · ${dup.uploader_name}`
          : "Duplicate",
        openLabel: "Open duplicate in new tab",
      },
    });
  };

  const sourceGrid =
    "grid grid-cols-[2rem_minmax(0,1fr)_4.75rem_3.5rem_5.5rem_3.75rem] items-center gap-x-2";

  const attachedCount = file.source_count ?? file.sources?.length ?? 0;
  const validatingCount = (file.sources ?? []).filter(
    (s) => s.match_status === "pending" || s.match_status === "processing",
  ).length;
  const duplicates = file.duplicates ?? [];
  const duplicateCount = file.duplicate_count ?? duplicates.length;
  // Nested duplicates only attach to root documents.
  const isApprovedDuplicateRow = Boolean(file.parent_file_id);
  const showDuplicates = !isApprovedDuplicateRow && duplicateCount > 0;
  const uploadedLabel = formatUploadedAt(file.uploaded_at);

  const busy = loading || replacing || deleting || deepScanning;

  return (
    <div
      className="border-t border-[var(--border)] bg-transparent"
      onClick={(e) => e.stopPropagation()}
    >
      <SourcePreviewModal
        fileId={file.id}
        source={previewSource}
        onClose={() => setPreviewSource(null)}
      />
      <MatchCompareModal
        open={compareTarget != null}
        file={file}
        target={compareTarget}
        onClose={() => setCompareTarget(null)}
      />
      <IntakeCompareModal
        open={dupCompare != null}
        target={dupCompare}
        onClose={() => setDupCompare(null)}
      />
      <FileDetailsModal
        open={detailsTarget != null}
        target={detailsTarget}
        onClose={() => setDetailsTarget(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
        <div className="min-w-0 flex-1">
          {message ? (
            <p className="truncate text-[12px] text-[var(--muted)]">{message}</p>
          ) : (
            <p className="text-[12px] text-[var(--muted-soft)]">
              <span
                className="font-mono text-[11px] text-[var(--muted)]"
                title={file.sha256_hash}
              >
                {shortHash(file.sha256_hash)}
              </span>
              <span className="mx-1.5 text-[var(--border-strong)]">·</span>
              <span title={file.original_filename}>{file.original_filename}</span>
              <span className="mx-1.5 text-[var(--border-strong)]">·</span>
              <span className="tabular-nums">{formatBytes(file.byte_size)}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <span
            role="status"
            aria-live="polite"
            className={[
              "inline-flex h-8 w-[6.25rem] shrink-0 items-center justify-end gap-1.5 text-[12px] text-[var(--muted)] transition-opacity duration-200",
              busy ? "opacity-100" : "opacity-0",
            ].join(" ")}
          >
            {busy && (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {deleting
                  ? "Deleting…"
                  : replacing
                    ? "Replacing…"
                    : deepScanning
                      ? "Scanning…"
                      : "Updating…"}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => openFile(file.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--ink)] px-2.5 text-[12px] font-medium text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            Open
            <ExternalLink className="size-3.5" strokeWidth={1.75} />
          </button>
          {!isApprovedDuplicateRow && (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={replacing || deleting}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <Pencil className="size-3.5" strokeWidth={1.75} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => replaceRef.current?.click()}
                disabled={replacing || deleting}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {replacing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" strokeWidth={1.75} />
                )}
                Replace
              </button>
              <button
                type="button"
                onClick={onDeepScan}
                disabled={deepScanning || replacing || deleting}
                className={[
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  file.needs_ocr
                    ? "bg-[var(--accent)] text-white hover:bg-[#0077ed]"
                    : "border border-[var(--border-strong)] bg-white text-[var(--ink)] hover:bg-[var(--surface-muted)]",
                ].join(" ")}
              >
                {deepScanning ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ScanSearch className="size-3.5" strokeWidth={1.75} />
                )}
                Deep Scan
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting || replacing}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            )}
            Delete
          </button>
          {!isApprovedDuplicateRow && (
            <input
              ref={replaceRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0];
                e.target.value = "";
                if (!next) return;
                const msg = validateDocumentFile(next);
                if (msg) {
                  setReplaceError(msg);
                  return;
                }
                setReplaceError(null);
                onReplace(next);
              }}
            />
          )}
        </div>
      </div>

      <div className="space-y-2 px-5 pb-3.5">
        {(detailError || replaceError) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            <span>{detailError || replaceError}</span>
          </div>
        )}

        {isApprovedDuplicateRow && (
          <section className="overflow-hidden rounded-lg border border-orange-200 bg-orange-50/40">
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-orange-700 shadow-sm ring-1 ring-orange-200">
                <Copy className="size-3.5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10.5px] font-semibold text-orange-800 ring-1 ring-orange-200">
                    Duplicate
                  </span>
                  <p className="truncate text-[12.5px] font-medium text-[var(--ink)]">
                    Duplicate of {file.parent_title || "original document"}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-[10.5px] text-[var(--muted)]">
                  {[
                    uploadedLabel ? `Uploaded ${uploadedLabel}` : null,
                    duplicateCount > 0
                      ? `Original used ${duplicateCount} time${duplicateCount === 1 ? "" : "s"} as a duplicate`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {file.parent_file_id && (
                <button
                  type="button"
                  onClick={() => openFile(file.parent_file_id!)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200 bg-white px-2 text-[11.5px] font-medium text-orange-900 hover:bg-orange-50"
                >
                  Open original
                  <ExternalLink className="size-3" strokeWidth={1.75} />
                </button>
              )}
            </div>
          </section>
        )}

        {file.needs_ocr && !isApprovedDuplicateRow && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
            No text layer — run Deep Scan to continue matching.
          </div>
        )}

        {!isApprovedDuplicateRow && (
        <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-1.5">
            <p className="text-[11px] font-medium text-[var(--ink)]">
              Sources
              <span className="ml-1.5 font-normal tabular-nums text-[var(--muted)]">
                {attachedCount}/{SOURCE_SLOT_COUNT}
                {validatingCount > 0 ? ` · ${validatingCount} checking` : ""}
              </span>
            </p>
            {attachedCount < SOURCE_SLOT_COUNT && (
              <button
                type="button"
                onClick={onEdit}
                disabled={replacing || deleting}
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                <Plus className="size-3" strokeWidth={2} />
                Add
              </button>
            )}
          </div>

          <div
            className={`${sourceGrid} border-b border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--muted-soft)]`}
            aria-hidden
          >
            <span>#</span>
            <span>File</span>
            <span>Status</span>
            <span className="text-right">Score</span>
            <span className="text-center">Compare</span>
            <span className="text-right">View</span>
          </div>

          <ul className="divide-y divide-[var(--border)]">
            {sourceSlots.map(({ slot, source }) => {
              const meta = source ? sourceLineMeta(source) : null;
              const canCompare = source != null && isComparableMatch(source);
              return (
                <li key={slot} className={`${sourceGrid} px-3 py-2`}>
                  <span className="text-[12px] tabular-nums text-[var(--muted)]">
                    {slot}
                  </span>
                  <div className="min-w-0">
                    {source ? (
                      <>
                        <p
                          className="truncate text-[12.5px] text-[var(--ink)]"
                          title={source.original_filename}
                        >
                          {source.original_filename}
                        </p>
                        <p className="truncate text-[10.5px] tabular-nums text-[var(--muted-soft)]">
                          {formatBytes(source.byte_size)}
                        </p>
                      </>
                    ) : (
                      <p className="text-[12.5px] text-[var(--muted-soft)]">—</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    {meta ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${meta.tone}`}
                        title={source?.decision_detail || undefined}
                      >
                        {meta.validating && (
                          <Loader2 className="size-3 animate-spin" />
                        )}
                        {meta.label}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-[var(--muted-soft)]">
                        Empty
                      </span>
                    )}
                  </div>
                  <span className="text-right text-[11.5px] font-medium tabular-nums text-[var(--ink)]">
                    {meta && meta.confidence != null && !meta.validating
                      ? `${meta.confidence.toFixed(0)}%`
                      : "—"}
                  </span>
                  <div className="flex justify-center">
                    {canCompare ? (
                      <button
                        type="button"
                        onClick={() => openSourceCompare(source)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 text-[11.5px] font-medium text-orange-800 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        title={
                          source.decision_detail ||
                          "Compare matched sources side by side"
                        }
                      >
                        <GitCompare className="size-3.5" strokeWidth={1.75} />
                        Compare
                      </button>
                    ) : (
                      <span className="text-[11.5px] text-[var(--muted-soft)]">
                        —
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {source ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCompareTarget(null);
                          setPreviewSource(source);
                        }}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <Eye className="size-3.5" strokeWidth={1.75} />
                        View
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onEdit}
                        disabled={replacing || deleting}
                        className="inline-flex h-7 items-center rounded-md px-1.5 text-[11.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        )}

        {showDuplicates && (
          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
            <button
              type="button"
              aria-expanded={dupsOpen}
              onClick={() => setDupsOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDown
                  className={[
                    "size-3.5 shrink-0 text-[var(--muted)] transition-transform duration-200",
                    dupsOpen ? "rotate-0" : "-rotate-90",
                  ].join(" ")}
                  strokeWidth={1.75}
                />
                <span className="text-[11px] font-medium text-[var(--ink)]">
                  Matched duplicates
                </span>
                <span className="inline-flex rounded-full bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-orange-800">
                  {duplicateCount}
                </span>
              </span>
              <span className="shrink-0 text-[10.5px] text-[var(--muted-soft)]">
                {dupsOpen
                  ? "Hide details"
                  : "When · who · how — click to expand"}
              </span>
            </button>

            {dupsOpen && (
              <div className="border-t border-[var(--border)]">
                {/* Original anchor */}
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]">
                    <Copy className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800">
                        Original
                      </span>
                      <p
                        className="truncate text-[12.5px] font-medium text-[var(--ink)]"
                        title={displayTitle(file)}
                      >
                        {displayTitle(file)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-[10.5px] text-[var(--muted-soft)]">
                      This document · {formatBytes(file.byte_size)}
                      {file.uploader_name ? ` · ${file.uploader_name}` : ""}
                      {uploadedLabel ? ` · uploaded ${uploadedLabel}` : ""}
                      {duplicateCount > 0
                        ? ` · duplicated ${duplicateCount} time${duplicateCount === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openFile(file.id)}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-[var(--ink)] px-2 text-[11.5px] font-medium text-white hover:bg-black"
                  >
                    Open
                    <ExternalLink className="size-3" strokeWidth={1.75} />
                  </button>
                </div>

                {duplicates.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] text-[var(--muted)]">
                    {loading
                      ? "Loading matched duplicates…"
                      : "Duplicate count is set, but details have not loaded yet."}
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {duplicates.map((dup, index) => {
                      const title = displayTitle(dup);
                      const conf =
                        dup.confidence_percent ??
                        (dup.similarity != null
                          ? dup.similarity * 100
                          : null);
                      const busyDup = deletingDupId === dup.id;
                      const isLast = index === duplicates.length - 1;
                      return (
                        <li
                          key={dup.id}
                          className="relative flex flex-wrap items-center gap-2 px-3 py-2.5 pl-10"
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-[1.35rem] top-0 bottom-0 w-px bg-orange-200"
                            style={isLast ? { bottom: "50%" } : undefined}
                          />
                          <span
                            aria-hidden
                            className="pointer-events-none absolute left-[1.35rem] top-1/2 h-px w-3 bg-orange-200"
                          />
                          <span className="absolute left-[1.05rem] top-1/2 flex size-2.5 -translate-y-1/2 rounded-full border-2 border-orange-400 bg-white" />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10.5px] font-semibold text-orange-800">
                                Duplicate
                              </span>
                              <p
                                className="truncate text-[12.5px] font-medium text-[var(--ink)]"
                                title={title}
                              >
                                {title}
                              </p>
                            </div>
                            <p className="mt-0.5 truncate text-[10.5px] text-[var(--muted-soft)]">
                              {dupTierLabel(dup)}
                              {conf != null ? ` · ${conf.toFixed(0)}%` : ""}
                              <span className="mx-1 text-[var(--border-strong)]">
                                ·
                              </span>
                              {formatBytes(dup.byte_size)}
                              {dup.uploader_name ? (
                                <>
                                  <span className="mx-1 text-[var(--border-strong)]">
                                    ·
                                  </span>
                                  {dup.uploader_name}
                                </>
                              ) : null}
                              {dup.client_name ? (
                                <>
                                  <span className="mx-1 text-[var(--border-strong)]">
                                    ·
                                  </span>
                                  {dup.client_name}
                                </>
                              ) : null}
                              {formatUploadedAt(dup.created_at) ? (
                                <>
                                  <span className="mx-1 text-[var(--border-strong)]">
                                    ·
                                  </span>
                                  uploaded {formatUploadedAt(dup.created_at)}
                                </>
                              ) : null}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setDetailsTarget({ kind: "duplicate", dup })
                              }
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border-strong)] bg-white px-2 text-[11.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              title="View all form and file details"
                            >
                              <ListTree
                                className="size-3.5"
                                strokeWidth={1.75}
                              />
                              Detail
                            </button>
                            <button
                              type="button"
                              onClick={() => openDuplicateCompare(dup)}
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 text-[11.5px] font-medium text-orange-800 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              title="Compare original (left) with this duplicate (right)"
                            >
                              <GitCompare
                                className="size-3.5"
                                strokeWidth={1.75}
                              />
                              Compare
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openFile(dup.open_file_id || dup.id)
                              }
                              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                            >
                              <Eye className="size-3.5" strokeWidth={1.75} />
                              View
                            </button>
                            {onDeleteDuplicate && (
                              <button
                                type="button"
                                disabled={busyDup || deleting || replacing}
                                onClick={() => onDeleteDuplicate(dup)}
                                className="inline-flex size-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                aria-label={`Remove duplicate ${title}`}
                              >
                                {busyDup ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2
                                    className="size-3.5"
                                    strokeWidth={1.75}
                                  />
                                )}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {matches.length > 0 && (
          <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] px-3 py-1.5">
              <p className="text-[11px] font-medium text-[var(--ink)]">
                Corpus matches
                <span className="ml-1.5 font-normal tabular-nums text-[var(--muted)]">
                  {matches.length}
                </span>
              </p>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {matches.map((m) => {
                const conf =
                  m.confidence_percent ??
                  (m.similarity != null ? m.similarity * 100 : null);
                const erp = (m.matched_erp_code ?? "").trim();
                const anzsco = (m.matched_anzsco ?? "").trim();
                return (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[12.5px] font-medium text-[var(--ink)]"
                        title={m.matched_filename}
                      >
                        {m.matched_filename}
                      </p>
                      <p className="truncate text-[10.5px] text-[var(--muted-soft)]">
                        {m.decision_label || m.decision}
                        {m.tier_label ? ` · ${m.tier_label}` : ""}
                        {conf != null ? ` · ${conf.toFixed(0)}%` : ""}
                        <span className="mx-1 text-[var(--border-strong)]">·</span>
                        {formatBytes(m.matched_byte_size)}
                        {erp ? (
                          <>
                            <span className="mx-1 text-[var(--border-strong)]">
                              ·
                            </span>
                            <span className="font-mono">ERP {erp}</span>
                          </>
                        ) : null}
                        {anzsco ? (
                          <>
                            <span className="mx-1 text-[var(--border-strong)]">
                              ·
                            </span>
                            <span className="font-mono">ANZSCO {anzsco}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailsTarget({ kind: "match", match: m })
                        }
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--border-strong)] bg-white px-2 text-[11.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        title="View all form and file details"
                      >
                        <ListTree className="size-3.5" strokeWidth={1.75} />
                        Detail
                      </button>
                      <button
                        type="button"
                        onClick={() => openCorpusCompare(m)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2 text-[11.5px] font-medium text-orange-800 hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <GitCompare className="size-3.5" strokeWidth={1.75} />
                        Compare
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
