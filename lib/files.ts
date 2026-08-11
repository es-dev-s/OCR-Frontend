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

export function statusMeta(file: FileRecord): { label: string; className: string } {
  // Nested rows (member view) are duplicates of another document — say so
  // instead of a generic "Completed".
  if (file.parent_file_id) {
    return {
      label: "Duplicate",
      className: "bg-[var(--accent-soft)] text-[var(--accent)]",
    };
  }
  const label =
    file.status_label ||
    (file.status === "uploading"
      ? "Uploading"
      : file.status === "failed"
      ? "Failed"
      : file.status === "pending"
        ? "Processing"
        : file.status === "tier1_done"
          ? "Tier 1 complete"
          : file.status === "tier2_done"
            ? "Deep Scan complete"
            : file.status === "duplicate"
              ? "Duplicate"
              : file.status === "ocr_unavailable"
                ? "OCR unavailable"
                : file.status === "ocr_no_text"
                  ? "No readable text"
                  : "Completed");

  if (file.status === "uploading" || label === "Uploading") {
    return { label: "Uploading", className: "bg-[#eff6ff] text-[#1d4ed8]" };
  }
  if (label === "Failed" || file.status === "failed") {
    return { label, className: "bg-[#fff1f0] text-[#b42318]" };
  }
  if (file.status === "ocr_unavailable" || file.status === "ocr_no_text") {
    return { label, className: "bg-[#fffaeb] text-[#b54708]" };
  }
  if (
    label === "Processing" ||
    file.status === "pending" ||
    file.needs_ocr
  ) {
    return {
      label: file.needs_ocr && label === "Processing" ? "Deep Scan queued" : label,
      className: "bg-[#eff6ff] text-[#1d4ed8]",
    };
  }
  if (file.status === "duplicate" || label.toLowerCase().includes("duplicate")) {
    return { label, className: "bg-[var(--accent-soft)] text-[var(--accent)]" };
  }
  return {
    label,
    className: "bg-[var(--surface-muted)] text-[var(--ink)]",
  };
}

export function isTerminal(file: FileRecord): boolean {
  if (file.status === "pending" && file.needs_ocr) return false;
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
