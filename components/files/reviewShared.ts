import type { ReviewCompareTarget } from "@/components/files/IntakeCompareModal";
import {
  fileContentURL,
  type FileRecord,
  type ReviewItem,
} from "@/lib/api";
import { formatBytes } from "@/lib/files";

export type ReviewChangedInfo = {
  action: "request" | "approve" | "reject" | "discard" | "sync";
  item?: ReviewItem;
  original?: FileRecord | null;
};

export function reviewStatusChip(item: ReviewItem): {
  label: string;
  className: string;
} {
  switch (item.review_status) {
    case "prompt":
      return {
        label: "Awaiting your decision",
        className: "bg-[#eff6ff] text-[#1d4ed8]",
      };
    case "requested":
      return { label: "Requested", className: "bg-[#fffaeb] text-[#b54708]" };
    case "approved":
      return {
        label: "Approved",
        className: "bg-[var(--accent-soft)] text-[var(--accent)]",
      };
    default:
      return {
        label: item.review_status,
        className: "bg-[var(--surface-muted)] text-[var(--ink)]",
      };
  }
}

export function reviewCompareTarget(item: ReviewItem): ReviewCompareTarget {
  return {
    kind: "review",
    decision: "Exact duplicate · admin review",
    description: [
      item.uploader_name ? `Requested by ${item.uploader_name}` : null,
      formatBytes(item.byte_size),
      item.client_name || null,
    ]
      .filter(Boolean)
      .join(" · "),
    left: {
      url: fileContentURL(item.original_file_id),
      title: item.original_title || "Original document",
      filename: item.original_title || "original.pdf",
      eyebrow: "Matched original (in corpus)",
      openLabel: "Open original in new tab",
    },
    right: {
      url: fileContentURL(item.id),
      title: item.title || item.original_filename,
      filename: item.original_filename || item.title || "upload.pdf",
      size: item.byte_size,
      eyebrow: item.uploader_name
        ? `Submitted duplicate · ${item.uploader_name}`
        : "Submitted duplicate",
      openLabel: "Open submitted file in new tab",
    },
  };
}

/** Items that still need a decision on the documents banner. */
export function isActionableReview(item: ReviewItem, isAdmin: boolean): boolean {
  return isAdmin
    ? item.review_status === "requested"
    : item.review_status === "prompt";
}
