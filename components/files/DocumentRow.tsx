"use client";

import { Fragment, memo, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import {
  displayTitle,
  type DuplicateRecord,
  type FileRecord,
  type MatchRecord,
} from "@/lib/api";
import { formatUploadedAt, statusMeta } from "@/lib/files";
import { copyShareURL, isShareToken } from "@/lib/share";
import { useToast } from "@/components/ui/Toast";
import { RowDetailAccordion } from "@/components/files/RowDetailAccordion";
import { RowActionsMenu } from "@/components/files/RowActionsMenu";
import { docsCell } from "@/components/files/docsTableLayout";
import { ExpandPanel } from "@/components/ui/ExpandPanel";

export type RowDetail = {
  matches: MatchRecord[];
  message: string | null;
  loading: boolean;
  error?: string | null;
};

type Props = {
  file: FileRecord;
  open: boolean;
  detail?: RowDetail;
  deepScanning: boolean;
  replacing: boolean;
  deleting: boolean;
  deletingDupId?: string | null;
  onToggle: (file: FileRecord) => void;
  onOpenFile: (id: string) => void;
  onPrefetch?: (id: string) => void;
  onRequestDelete: (file: FileRecord) => void;
  onRequestDeleteDuplicate?: (parent: FileRecord, dup: DuplicateRecord) => void;
  onDeepScan: (id: string) => void;
  onRequestReplace: (id: string, next: File) => void;
  onEdit: (file: FileRecord) => void;
};

function DocumentRowImpl({
  file,
  open,
  detail,
  deepScanning,
  replacing,
  deleting,
  deletingDupId = null,
  onToggle,
  onOpenFile,
  onPrefetch,
  onRequestDelete,
  onRequestDeleteDuplicate,
  onDeepScan,
  onRequestReplace,
  onEdit,
}: Props) {
  const meta = statusMeta(file);
  const count = file.duplicate_count ?? file.duplicates?.length ?? 0;
  const sourceCount = file.source_count ?? file.sources?.length ?? 0;
  const clientDocCount = file.client_document_count ?? 0;
  const panelId = `doc-panel-${file.id}`;
  const uploading = file.status === "uploading";
  const docTitle = displayTitle(file);
  const uploaderName = (file.uploader_name || "").trim() || "—";
  const uploadedLabel = formatUploadedAt(file.uploaded_at);
  const { toast } = useToast();
  const [linkCopied, setLinkCopied] = useState(false);
  const shareToken = (file.share_token || "").trim().toLowerCase();
  const canCopyShare = isShareToken(shareToken) && !uploading;

  const onCopyShare = async () => {
    if (!canCopyShare) return;
    const ok = await copyShareURL(shareToken);
    if (!ok) {
      toast("Could not copy URL", "neutral");
      return;
    }
    setLinkCopied(true);
    toast("Copied URL");
    window.setTimeout(() => setLinkCopied(false), 2000);
  };
  // Name column shows the uploader only; keep time / dup hints in the subtitle.
  const subtitle = file.parent_file_id
    ? [
        `Duplicate of ${file.parent_title || "another document"}`,
        uploadedLabel ? `uploaded ${uploadedLabel}` : null,
        count > 0
          ? `${count} duplicate${count === 1 ? "" : "s"} of original`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : [
          uploadedLabel ? `uploaded ${uploadedLabel}` : null,
          count > 0
            ? `${count} duplicate${count === 1 ? "" : "s"}`
            : file.needs_ocr
              ? "Deep Scan required"
              : null,
        ]
          .filter(Boolean)
          .join(" · ") || "—";
  const subtitleTitle = file.parent_file_id
    ? subtitle
    : count > 0
      ? `${count} accepted duplicate${count === 1 ? "" : "s"} nested under this document`
      : undefined;

  return (
    <Fragment>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={panelId}
        onMouseEnter={() => onPrefetch?.(file.id)}
        onFocus={() => onPrefetch?.(file.id)}
        onClick={() => {
          if (uploading) return;
          onToggle(file);
        }}
        onKeyDown={(e) => {
          if (uploading) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(file);
          }
        }}
        className={[
          "border-b border-[var(--border)] transition-colors duration-200 outline-none",
          "focus-visible:bg-[var(--canvas)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
          uploading ? "cursor-wait opacity-80" : "cursor-pointer",
          open ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--canvas)]",
        ].join(" ")}
      >
        <td className={docsCell.name}>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={[
                "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] duration-300 motion-reduce:transition-none",
                open
                  ? "bg-white text-[var(--accent)] shadow-sm"
                  : "text-[var(--muted)]",
              ].join(" ")}
            >
              <ChevronDown
                className={[
                  "size-3.5 transition-transform duration-300 motion-reduce:transition-none",
                  open ? "rotate-0" : "-rotate-90",
                ].join(" ")}
                strokeWidth={1.75}
              />
            </span>
            <span
              className={[
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
                open
                  ? "bg-white text-[var(--accent)] shadow-sm"
                  : "bg-[var(--surface-muted)] text-[var(--ink)]",
              ].join(" ")}
            >
              <FileText className="size-3.5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p
                className="truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--ink)]"
                title={uploaderName}
              >
                {uploaderName}
              </p>
              <p
                className={[
                  "mt-0.5 truncate text-[11px]",
                  open
                    ? "font-medium text-[var(--accent)]"
                    : "text-[var(--muted)]",
                ].join(" ")}
                title={subtitleTitle}
              >
                {subtitle}
              </p>
            </div>
          </div>
        </td>
        <td
          className={`${docsCell.client} text-[12.5px] text-[var(--ink)]`}
          title={
            file.client_name
              ? clientDocCount > 0
                ? `${file.client_name} · ${clientDocCount} document${clientDocCount === 1 ? "" : "s"}`
                : file.client_name
              : undefined
          }
        >
          {file.client_name ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate">{file.client_name}</span>
              {clientDocCount > 0 ? (
                <span className="inline-flex shrink-0 items-center rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-[var(--muted)]">
                  {clientDocCount}
                </span>
              ) : null}
            </div>
          ) : (
            <span className="block truncate text-[var(--muted-soft)]">—</span>
          )}
        </td>
        <td
          className={`${docsCell.erp} text-[12.5px] text-[var(--ink)]`}
          title={file.erp_code || undefined}
        >
          <span className="block truncate">{file.erp_code || "—"}</span>
        </td>
        <td
          className={`${docsCell.team} text-[12.5px] text-[var(--ink)]`}
          title={file.team || undefined}
        >
          <span className="block truncate">{file.team || "—"}</span>
        </td>
        <td
          className={`${docsCell.anzsco} text-[12.5px] tabular-nums text-[var(--ink)]`}
          title={file.anzsco || undefined}
        >
          <span className="block truncate">{file.anzsco || "—"}</span>
        </td>
        <td className={docsCell.status}>
          <span
            className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
          >
            {meta.label}
          </span>
        </td>
        <td className={docsCell.sources}>
          {sourceCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              {sourceCount}/4
            </span>
          ) : (
            <span className="text-[12.5px] text-[var(--muted-soft)]">0/4</span>
          )}
        </td>
        <td className={`${docsCell.uploaded} text-[12px] text-[var(--muted)]`}>
          <span className="block truncate">
            {new Date(file.uploaded_at).toLocaleString()}
          </span>
        </td>
        <td
          className={docsCell.actions}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="inline-flex w-full justify-end">
            <RowActionsMenu
              docTitle={docTitle}
              openRow={open}
              uploading={uploading}
              deleting={deleting}
              canCopyShare={canCopyShare}
              linkCopied={linkCopied}
              onCopyShare={onCopyShare}
              onOpen={() => onOpenFile(file.id)}
              onEdit={() => onEdit(file)}
              onDelete={() => onRequestDelete(file)}
              onPrefetch={() => onPrefetch?.(file.id)}
            />
          </div>
        </td>
      </tr>

      <tr className={open ? "bg-[var(--accent-soft)]" : undefined}>
        <td
          colSpan={9}
          className={[
            "p-0",
            open ? "border-b border-[var(--border)]" : "",
          ].join(" ")}
        >
          <ExpandPanel open={open} id={panelId}>
            <RowDetailAccordion
              file={file}
              matches={detail?.matches ?? []}
              loading={detail?.loading ?? false}
              message={detail?.message}
              detailError={detail?.error}
              deepScanning={deepScanning}
              replacing={replacing}
              deleting={deleting}
              deletingDupId={deletingDupId}
              onDeepScan={() => onDeepScan(file.id)}
              onReplace={(next) => onRequestReplace(file.id, next)}
              onDelete={() => onRequestDelete(file)}
              onDeleteDuplicate={
                onRequestDeleteDuplicate
                  ? (dup) => onRequestDeleteDuplicate(file, dup)
                  : undefined
              }
              onEdit={() => onEdit(file)}
            />
          </ExpandPanel>
        </td>
      </tr>
    </Fragment>
  );
}

/**
 * Memoised so a status poll touching one document does not re-render every
 * other row. All callbacks must be referentially stable in the parent or this
 * degrades back to a full-table render.
 */
export const DocumentRow = memo(DocumentRowImpl);
