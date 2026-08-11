"use client";

import { ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { sourceContentURL, type DocumentSource } from "@/lib/api";

type SourcePreviewModalProps = {
  fileId: string;
  source: DocumentSource | null;
  onClose: () => void;
};

export function SourcePreviewModal({
  fileId,
  source,
  onClose,
}: SourcePreviewModalProps) {
  if (!source) return null;

  const url = sourceContentURL(fileId, source.slot);
  const isPdf = /\.pdf$/i.test(source.original_filename);

  return (
    <Modal
      open
      onClose={onClose}
      title={source.original_filename}
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
        {isPdf ? (
          <iframe
            key={url}
            title={source.original_filename}
            src={url}
            className="h-[min(78dvh,44rem)] w-full bg-white"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={source.original_filename}
            className="mx-auto max-h-[min(78dvh,44rem)] w-auto object-contain py-4"
          />
        )}
      </div>
    </Modal>
  );
}
