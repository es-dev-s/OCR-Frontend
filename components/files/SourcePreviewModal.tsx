"use client";

import { useState } from "react";
import { ExternalLink, FileWarning } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { sourceContentURL, type DocumentSource } from "@/lib/api";

type SourcePreviewModalProps = {
  fileId: string;
  source: DocumentSource | null;
  /** Parent document PDF title (preferred modal heading over filename). */
  documentTitle?: string;
  onClose: () => void;
};

export function SourcePreviewModal({
  fileId,
  source,
  documentTitle,
  onClose,
}: SourcePreviewModalProps) {
  const [loadError, setLoadError] = useState(false);

  if (!source) return null;

  const url = sourceContentURL(fileId, source.slot);
  const isPdf = /\.pdf$/i.test(source.original_filename);
  const heading =
    (documentTitle && documentTitle.trim()) || source.original_filename;

  return (
    <Modal
      open
      onClose={onClose}
      title={heading}
      description={source.label}
      size="xl"
      headerAction={
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
        >
          Open in tab
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </a>
      }
    >
      <div className="-mx-5 -my-3 sm:-mx-6 sm:-my-4">
        {loadError ? (
          <div className="flex h-[min(78dvh,44rem)] flex-col items-center justify-center gap-2 px-6 text-center">
            <FileWarning
              className="size-8 text-[var(--muted-soft)]"
              strokeWidth={1.5}
            />
            <p className="text-[13.5px] font-medium text-[var(--ink)]">
              Couldn’t preview this file
            </p>
            <p className="max-w-sm text-[12.5px] text-[var(--muted)]">
              The file may still be available — try Open in tab, or re-upload if
              the original is missing from storage.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-white px-3 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--canvas)]"
            >
              Open in tab
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </a>
          </div>
        ) : isPdf ? (
          <iframe
            key={url}
            title={heading}
            src={url}
            className="h-[min(78dvh,44rem)] w-full bg-white"
            onError={() => setLoadError(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={heading}
            className="mx-auto max-h-[min(78dvh,44rem)] w-auto object-contain py-4"
            onError={() => setLoadError(true)}
          />
        )}
      </div>
    </Modal>
  );
}
