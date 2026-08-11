"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FileText,
  GitCompare,
  Lock,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatBytes } from "@/lib/files";
import {
  corpusOriginalURL,
  type DuplicateCheck,
} from "@/lib/sourceCheck";

export type IntakeCompareTarget = {
  kind?: "intake";
  /** Newly selected file the user is about to upload. */
  selected: File;
  check: DuplicateCheck;
  /** Peer source file when the match is another slot in the same form. */
  peerFile?: File | null;
};

export type UrlComparePane = {
  url: string;
  title: string;
  filename: string;
  size?: number;
  eyebrow: string;
  openLabel?: string;
};

/** Admin/member review-queue compare: both sides already stored (URLs). */
export type ReviewCompareTarget = {
  kind: "review";
  left: UrlComparePane;
  right: UrlComparePane;
  decision?: string;
  description?: string;
};

export type SideBySideCompareTarget = IntakeCompareTarget | ReviewCompareTarget;

type Props = {
  open: boolean;
  target: SideBySideCompareTarget | null;
  onClose: () => void;
};

const PREVIEWABLE =
  /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?)(?:$|\?)/i;

/** Prefer a real filename with extension; corpus titles often lack ".pdf". */
function previewFilename(
  ...candidates: Array<string | null | undefined>
): string {
  for (const c of candidates) {
    const name = (c ?? "").trim();
    if (name && PREVIEWABLE.test(name)) return name;
  }
  const fallback = candidates.find((c) => (c ?? "").trim())?.trim();
  if (fallback && /\.[a-z0-9]{2,5}$/i.test(fallback)) return fallback;
  // Content endpoints serve document bytes — treat as PDF for iframe preview.
  return fallback ? `${fallback}.pdf` : "document.pdf";
}

function PreviewFrame({ url, filename }: { url: string; filename: string }) {
  const name = previewFilename(filename);
  const isPdf = /\.pdf(?:$|\?)/i.test(name);
  const isImage = /\.(png|jpe?g|webp|gif|bmp|tiff?)(?:$|\?)/i.test(name);

  if (isPdf) {
    return (
      <iframe
        key={url}
        title={name}
        src={url}
        className="h-[min(74dvh,48rem)] w-full bg-white"
      />
    );
  }
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt={name}
        className="mx-auto max-h-[min(74dvh,48rem)] w-auto object-contain py-4"
      />
    );
  }
  return (
    <div className="flex h-[min(74dvh,48rem)] flex-col items-center justify-center gap-2 bg-[var(--canvas)] text-[var(--muted)]">
      <FileText className="size-8" strokeWidth={1.5} />
      <p className="text-[13px]">Preview not available for this file type</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--accent)] hover:underline"
      >
        Open in new tab
        <ExternalLink className="size-3.5" strokeWidth={1.75} />
      </a>
    </div>
  );
}

function PaneHeader({
  eyebrow,
  title,
  size,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  size?: number;
  tone?: "default" | "match" | "new";
}) {
  const bar =
    tone === "match"
      ? "border-orange-200 bg-orange-50/80"
      : tone === "new"
        ? "border-sky-200 bg-sky-50/80"
        : "border-[var(--border)] bg-[var(--canvas)]";
  return (
    <div className={`border-b px-3.5 py-2.5 ${bar}`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
        {eyebrow}
      </p>
      <p
        className="mt-0.5 truncate text-[13.5px] font-semibold text-[var(--ink)]"
        title={title}
      >
        {title}
      </p>
      {size != null && (
        <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
          {formatBytes(size)}
        </p>
      )}
    </div>
  );
}

function ComparePane({
  pane,
  tone,
  lockedMessage,
}: {
  pane: UrlComparePane | null;
  tone: "match" | "new";
  lockedMessage?: string;
}) {
  if (!pane) {
    return (
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,23,32,0.04)]">
        <div className="flex h-[min(74dvh,48rem)] flex-col items-center justify-center gap-2 bg-[var(--canvas)] px-6 text-center text-[var(--muted)]">
          <Lock className="size-8" strokeWidth={1.5} />
          <p className="text-[13.5px] font-medium text-[var(--ink)]">
            Preview unavailable
          </p>
          {lockedMessage && (
            <p className="max-w-sm text-[12.5px] leading-relaxed">
              {lockedMessage}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,23,32,0.04)]">
      <PaneHeader
        eyebrow={pane.eyebrow}
        title={pane.title}
        size={pane.size}
        tone={tone}
      />
      <PreviewFrame
        url={pane.url}
        filename={previewFilename(pane.filename, pane.title)}
      />
      <div className="border-t border-[var(--border)] px-3.5 py-2">
        <a
          href={pane.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)] hover:text-[var(--accent)]"
        >
          {pane.openLabel || "Open in new tab"}
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </a>
      </div>
    </section>
  );
}

/**
 * Side-by-side compare for intake matches and duplicate-review queue items.
 * Left = matched original, right = uploaded / selected duplicate.
 */
export function IntakeCompareModal({ open, target, onClose }: Props) {
  const [blobUrls, setBlobUrls] = useState<{
    left?: string;
    right?: string;
  }>({});

  const isReview = target?.kind === "review";

  const leftCorpusURL = useMemo(() => {
    if (!target || target.kind === "review") return null;
    if (target.check.peerSlot != null) return null;
    return corpusOriginalURL(target.check);
  }, [target]);

  useEffect(() => {
    if (!open || !target || target.kind === "review") {
      setBlobUrls({});
      return;
    }

    const next: { left?: string; right?: string } = {};
    next.right = URL.createObjectURL(target.selected);

    if (target.check.peerSlot != null && target.peerFile) {
      next.left = URL.createObjectURL(target.peerFile);
    }

    setBlobUrls(next);
    return () => {
      if (next.left) URL.revokeObjectURL(next.left);
      if (next.right) URL.revokeObjectURL(next.right);
    };
  }, [open, target]);

  if (!open || !target) return null;

  let left: UrlComparePane | null = null;
  let right: UrlComparePane | null = null;
  let decision = "Exact match";
  let description = "";
  let lockedMessage: string | undefined;

  if (isReview) {
    left = target.left;
    right = target.right;
    decision = target.decision || "Exact duplicate · review";
    description = target.description || "";
  } else {
    const { check, selected, peerFile } = target;
    const leftTitle =
      check.peerSlot != null
        ? peerFile?.name || `Source ${check.peerSlot}`
        : check.title || check.filename || "Matched document";
    const leftPreviewName = previewFilename(
      check.filename,
      peerFile?.name,
      selected.name,
      leftTitle,
    );
    const leftEyebrow =
      check.peerSlot != null
        ? `Matched · Source ${check.peerSlot}`
        : check.near
          ? "Matched original (near)"
          : "Matched original (exact)";
    const leftURL = check.peerSlot != null ? blobUrls.left : leftCorpusURL;
    const rightURL = blobUrls.right;

    decision = check.near ? "Near match" : "Exact match";
    description = [
      decision,
      check.similarity != null
        ? `${Math.round(check.similarity * 100)}% similar`
        : null,
      check.peerSlot != null
        ? `Source ${check.peerSlot} in this form`
        : check.filename && check.filename !== check.title
          ? check.filename
          : null,
    ]
      .filter(Boolean)
      .join(" · ");

    if (leftURL) {
      left = {
        url: leftURL,
        title: leftTitle,
        filename: leftPreviewName,
        size: peerFile?.size,
        eyebrow: leftEyebrow,
        openLabel: "Open original in new tab",
      };
    } else {
      lockedMessage =
        "This match belongs to another member. You can still review your selected file on the right, then request an admin review after upload if you need to keep it.";
    }

    if (rightURL) {
      right = {
        url: rightURL,
        title: selected.name,
        filename: selected.name,
        size: selected.size,
        eyebrow: "Your selection · not uploaded yet",
        openLabel: "Open selection in new tab",
      };
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isReview ? "Compare review documents" : "Compare match"}
      description={description}
      size="full"
      headerAction={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent)]">
          <GitCompare className="size-3.5" strokeWidth={1.75} />
          Side-by-side
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11.5px] font-medium text-orange-800">
            {decision}
          </span>
          {!isReview &&
            "check" in target &&
            target.check.similarity != null && (
              <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[var(--ink)]">
                {Math.round(target.check.similarity * 100)}% similar
              </span>
            )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
          <ComparePane pane={left} tone="match" lockedMessage={lockedMessage} />
          {right ? (
            <ComparePane pane={right} tone="new" />
          ) : (
            <div className="flex h-[min(74dvh,48rem)] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--canvas)] text-[var(--muted)]">
              Loading preview…
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
