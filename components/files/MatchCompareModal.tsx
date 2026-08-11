"use client";

import { useMemo } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  Fingerprint,
  GitCompare,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  displayTitle,
  fileContentURL,
  sourceContentURL,
  type DocumentSource,
  type FileRecord,
  type MatchRecord,
} from "@/lib/api";
import { formatBytes } from "@/lib/files";

export type SourceCompareTarget = {
  kind: "sources";
  left: DocumentSource;
  right: DocumentSource;
};

export type CorpusCompareTarget = {
  kind: "corpus";
  match: MatchRecord;
};

export type CompareTarget = SourceCompareTarget | CorpusCompareTarget;

type DocMeta = {
  clientName?: string | null;
  erpCode?: string | null;
  anzsco?: string | null;
};

type Props = {
  open: boolean;
  file: FileRecord;
  target: CompareTarget | null;
  onClose: () => void;
};

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

function confidenceOf(
  similarity?: number | null,
  percent?: number | null,
): number | null {
  if (percent != null) return percent;
  if (similarity != null) return similarity * 100;
  return null;
}

function displayCode(value?: string | null): string {
  const v = (value ?? "").trim();
  return v || "—";
}

function CodeChip({
  label,
  value,
  match,
}: {
  label: string;
  value: string;
  match?: boolean | null;
}) {
  return (
    <div
      className={[
        "min-w-0 rounded-lg border px-2.5 py-1.5",
        match === true
          ? "border-emerald-200 bg-emerald-50"
          : match === false
            ? "border-amber-200 bg-amber-50"
            : "border-[var(--border)] bg-white",
      ].join(" ")}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
        {label}
        {match === true && (
          <Check
            className="ml-1 inline size-3 text-emerald-600"
            strokeWidth={2.25}
            aria-label="codes match"
          />
        )}
      </p>
      <p
        className="mt-0.5 truncate font-mono text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)]"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function PaneMeta({
  eyebrow,
  title,
  size,
  hash,
  uploadedAt,
  meta,
  peerMeta,
}: {
  eyebrow: string;
  title: string;
  size: number;
  hash: string;
  uploadedAt?: string;
  meta: DocMeta;
  peerMeta?: DocMeta;
}) {
  const erp = displayCode(meta.erpCode);
  const anzsco = displayCode(meta.anzsco);
  const client = displayCode(meta.clientName);
  const peerErp = peerMeta ? displayCode(peerMeta.erpCode) : null;
  const peerAnzsco = peerMeta ? displayCode(peerMeta.anzsco) : null;

  const erpMatch =
    peerErp != null && erp !== "—" && peerErp !== "—" ? erp === peerErp : null;
  const anzscoMatch =
    peerAnzsco != null && anzsco !== "—" && peerAnzsco !== "—"
      ? anzsco === peerAnzsco
      : null;

  return (
    <div className="min-w-0 space-y-2.5 border-b border-[var(--border)] bg-[var(--canvas)] px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
          {eyebrow}
        </p>
        <p
          className="mt-0.5 truncate text-[14px] font-semibold tracking-[-0.015em] text-[var(--ink)]"
          title={title}
        >
          {title}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] tabular-nums text-[var(--muted)]">
          {formatBytes(size)}
          <span className="mx-1.5 text-[var(--border-strong)]">·</span>
          <span className="font-mono" title={hash}>
            {shortHash(hash)}
          </span>
          {uploadedAt ? (
            <>
              <span className="mx-1.5 text-[var(--border-strong)]">·</span>
              {new Date(uploadedAt).toLocaleString()}
            </>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <CodeChip label="Client" value={client} />
        <CodeChip label="ERP" value={erp} match={erpMatch} />
        <CodeChip label="ANZSCO" value={anzsco} match={anzscoMatch} />
      </div>
    </div>
  );
}

function PreviewFrame({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const isPdf = /\.pdf$/i.test(filename);
  const isImage = /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(filename);

  if (isPdf) {
    return (
      <iframe
        key={url}
        title={filename}
        src={url}
        className="h-[min(68dvh,40rem)] w-full bg-white"
      />
    );
  }
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt={filename}
        className="mx-auto max-h-[min(68dvh,40rem)] w-auto object-contain py-4"
      />
    );
  }
  return (
    <div className="flex h-[min(68dvh,40rem)] flex-col items-center justify-center gap-2 bg-[var(--canvas)] text-[var(--muted)]">
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

/**
 * Side-by-side compare: the current document/source on the left, the matched
 * peer on the right — details (ERP / ANZSCO) + live preview.
 */
export function MatchCompareModal({ open, file, target, onClose }: Props) {
  const summary = useMemo(() => {
    if (!target) return null;
    if (target.kind === "sources") {
      const conf = confidenceOf(
        target.left.similarity ?? target.right.similarity,
        target.left.confidence_percent ?? target.right.confidence_percent,
      );
      return {
        title: "Compare matched sources",
        description:
          target.left.decision_detail ||
          target.right.decision_detail ||
          `Source ${target.left.slot} compared with Source ${target.right.slot}`,
        decision:
          target.left.decision_label ||
          target.left.decision ||
          target.right.decision_label ||
          "Match",
        confidence: conf,
        tier:
          target.left.match_tier != null
            ? `Tier ${target.left.match_tier}`
            : target.right.match_tier != null
              ? `Tier ${target.right.match_tier}`
              : null,
      };
    }
    const conf = confidenceOf(
      target.match.similarity,
      target.match.confidence_percent,
    );
    return {
      title: "Compare matched documents",
      description:
        target.match.decision_detail ||
        `Compared against ${target.match.matched_filename}`,
      decision: target.match.decision_label || target.match.decision,
      confidence: conf,
      tier: target.match.tier_label || `Tier ${target.match.match_tier}`,
    };
  }, [target]);

  // Stable content URLs for this open target — avoids iframe reload races when
  // the parent row re-renders from status polls.
  const panes = useMemo(() => {
    if (!target) return null;
    const fileMeta: DocMeta = {
      clientName: file.client_name,
      erpCode: file.erp_code,
      anzsco: file.anzsco,
    };

    if (target.kind === "sources") {
      return {
        left: {
          url: sourceContentURL(file.id, target.left.slot),
          name: target.left.original_filename,
          size: target.left.byte_size,
          hash: target.left.sha256_hash,
          eyebrow: `This document · Source ${target.left.slot}`,
          uploadedAt: undefined as string | undefined,
          meta: fileMeta,
        },
        right: {
          url: sourceContentURL(file.id, target.right.slot),
          name: target.right.original_filename,
          size: target.right.byte_size,
          hash: target.right.sha256_hash,
          eyebrow: `Matched peer · Source ${target.right.slot}`,
          uploadedAt: undefined as string | undefined,
          meta: fileMeta,
        },
      };
    }

    const matchedMeta: DocMeta = {
      clientName: target.match.matched_client_name,
      erpCode: target.match.matched_erp_code,
      anzsco: target.match.matched_anzsco,
    };
    return {
      left: {
        url: fileContentURL(file.id),
        name: displayTitle(file),
        size: file.byte_size,
        hash: file.sha256_hash,
        eyebrow: "This document",
        uploadedAt: file.uploaded_at,
        meta: fileMeta,
      },
      right: {
        url: fileContentURL(target.match.matched_file_id),
        name: target.match.matched_filename,
        size: target.match.matched_byte_size,
        hash: target.match.matched_sha256,
        eyebrow: "Matched original",
        uploadedAt: target.match.matched_uploaded_at,
        meta: matchedMeta,
      },
    };
    // Intentionally keyed by stable ids/slots/codes — not the whole `file`
    // object — so status polls do not remount PDF iframes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    target,
    file.id,
    file.client_name,
    file.erp_code,
    file.anzsco,
    file.byte_size,
    file.sha256_hash,
    file.uploaded_at,
    file.title,
    file.original_filename,
  ]);

  if (!open || !target || !summary || !panes) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={summary.title}
      description={summary.description}
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11.5px] font-medium text-orange-800">
            {summary.decision}
          </span>
          {summary.tier && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--muted)]">
              <Fingerprint className="size-3.5" strokeWidth={1.75} />
              {summary.tier}
            </span>
          )}
          {summary.confidence != null && (
            <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-[var(--ink)]">
              {summary.confidence.toFixed(1)}% confidence
            </span>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,23,32,0.04)]">
            <PaneMeta
              eyebrow={panes.left.eyebrow}
              title={panes.left.name}
              size={panes.left.size}
              hash={panes.left.hash}
              uploadedAt={panes.left.uploadedAt}
              meta={panes.left.meta}
              peerMeta={panes.right.meta}
            />
            <PreviewFrame url={panes.left.url} filename={panes.left.name} />
            <div className="border-t border-[var(--border)] px-3.5 py-2">
              <a
                href={panes.left.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)] hover:text-[var(--accent)]"
              >
                Open left in new tab
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
              </a>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_1px_0_rgba(15,23,32,0.04)]">
            <PaneMeta
              eyebrow={panes.right.eyebrow}
              title={panes.right.name}
              size={panes.right.size}
              hash={panes.right.hash}
              uploadedAt={panes.right.uploadedAt}
              meta={panes.right.meta}
              peerMeta={panes.left.meta}
            />
            <PreviewFrame url={panes.right.url} filename={panes.right.name} />
            <div className="border-t border-[var(--border)] px-3.5 py-2">
              <a
                href={panes.right.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink)] hover:text-[var(--accent)]"
              >
                Open right in new tab
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
              </a>
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

/** Parse "Source N" from decision_detail produced by the source-validate worker. */
export function peerSlotFromDetail(detail?: string | null): 1 | 2 | 3 | 4 | null {
  if (!detail) return null;
  const m = detail.match(/Source\s+([1-4])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}
