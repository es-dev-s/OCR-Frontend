import type { FileRecord } from "@/lib/api";

export const DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp,application/pdf";

const ALLOWED_EXT = /\.(pdf|png|jpe?g|tiff?|webp)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n == null || Number.isNaN(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Short local datetime for duplicate / upload provenance in lists. */
export function formatUploadedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isAllowedDocumentFile(file: File): boolean {
  return ALLOWED_EXT.test(file.name);
}

export function validateDocumentFile(file: File): string | null {
  if (!isAllowedDocumentFile(file)) {
    return "Use a PDF, PNG, JPG, TIFF, or WebP file";
  }
  if (file.size > MAX_BYTES) {
    return "File is too large (max 50 MB)";
  }
  return null;
}

const STATUS_PILL = {
  processing: "bg-[#eef4ff] text-[#3b5bcc]",
  completed: "bg-[#e8f4fc] text-[#1d6fb8]",
  duplicate: "bg-orange-50 text-orange-800",
} as const;

/**
 * Document table / detail status pill.
 * Primary states users should distinguish: Processing, Completed, Duplicate.
 * OCR failure is not the product SoT — uploaded PDFs show as Completed.
 */
export function statusMeta(file: FileRecord): { label: string; className: string } {
  if (file.status === "uploading") {
    return { label: "Processing", className: STATUS_PILL.processing };
  }

  // This row is itself a nested / approved duplicate of another document.
  if (file.parent_file_id) {
    return { label: "Duplicate", className: STATUS_PILL.duplicate };
  }

  const dupCount = file.duplicate_count ?? file.duplicates?.length ?? 0;
  const hasDuplicates = dupCount > 0 || file.status === "duplicate";
  const uploaded =
    (file.byte_size ?? 0) > 0 ||
    (file.source_count ?? file.sources?.length ?? 0) > 0 ||
    Boolean(file.storage_path);

  // Still in the upload / source-check pipeline.
  if (
    file.status === "pending" ||
    file.sources_pending ||
    file.status_label === "Processing" ||
    file.status_label === "Uploading"
  ) {
    return { label: "Processing", className: STATUS_PILL.processing };
  }

  // OCR-only outcomes: treat uploaded docs as Completed (fingerprinting SoT).
  const ocrOnly =
    file.status === "failed" ||
    file.status === "ocr_unavailable" ||
    file.status === "ocr_no_text" ||
    file.status_label === "Failed" ||
    file.status_label === "OCR unavailable" ||
    file.status_label === "No readable text";
  if (ocrOnly && uploaded) {
    if (hasDuplicates) {
      return { label: "Duplicate", className: STATUS_PILL.duplicate };
    }
    return { label: "Completed", className: STATUS_PILL.completed };
  }

  // Finished and linked to one or more duplicate uploads.
  if (hasDuplicates) {
    return { label: "Duplicate", className: STATUS_PILL.duplicate };
  }

  // Finished cleanly with no linked duplicates.
  return { label: "Completed", className: STATUS_PILL.completed };
}

export function isTerminal(file: FileRecord): boolean {
  if (file.status === "pending") return false;
  if (file.sources_pending) return false;
  // OCR failure on an uploaded file is terminal Completed for polling.
  return [
    "completed",
    "tier1_done",
    "tier2_done",
    "duplicate",
    "failed",
    "ocr_unavailable",
    "ocr_no_text",
  ].includes(file.status);
}
