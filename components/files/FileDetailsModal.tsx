"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  displaySourceTitle,
  displayTitle,
  fileContentURL,
  getFileStatus,
  type DocumentSource,
  type DuplicateRecord,
  type FileRecord,
  type MatchRecord,
} from "@/lib/api";
import { formatBytes, formatUploadedAt } from "@/lib/files";
import { SOURCE_SLOT_COUNT } from "@/lib/sources";

export type FileDetailsTarget =
  | { kind: "duplicate"; dup: DuplicateRecord }
  | { kind: "match"; match: MatchRecord }
  | { kind: "file"; file: FileRecord };

type Props = {
  open: boolean;
  target: FileDetailsTarget | null;
  onClose: () => void;
};

type DetailView = {
  id: string;
  title: string;
  original_filename: string;
  client_name: string;
  erp_code: string;
  anzsco: string;
  team: string;
  member: string;
  byte_size: number;
  sha256_hash: string;
  status?: string;
  status_label?: string;
  uploaded_at?: string;
  uploader_name?: string;
  sources?: DocumentSource[];
  match_note?: string;
};

function seedFromTarget(target: FileDetailsTarget): DetailView {
  if (target.kind === "duplicate") {
    const d = target.dup;
    const conf =
      d.confidence_percent ??
      (d.similarity != null ? d.similarity * 100 : null);
    return {
      id: d.open_file_id || d.id,
      title: displayTitle(d),
      original_filename: d.original_filename || "",
      client_name: d.client_name || "",
      erp_code: d.erp_code || "",
      anzsco: d.anzsco || "",
      team: d.team || "",
      member: d.member || "",
      byte_size: d.byte_size,
      sha256_hash: d.sha256_hash || "",
      uploaded_at: d.created_at,
      uploader_name: d.uploader_name,
      match_note: [
        d.review_status === "approved"
          ? "Approved exact duplicate"
          : d.match_tier === 0
            ? "Exact byte duplicate"
            : `Tier ${d.match_tier || 1} match`,
        conf != null ? `${conf.toFixed(0)}% confidence` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (target.kind === "match") {
    const m = target.match;
    const conf =
      m.confidence_percent ??
      (m.similarity != null ? m.similarity * 100 : null);
    return {
      id: m.matched_file_id,
      title: m.matched_filename || "Matched document",
      original_filename: m.matched_filename || "",
      client_name: m.matched_client_name || "",
      erp_code: m.matched_erp_code || "",
      anzsco: m.matched_anzsco || "",
      team: "",
      member: "",
      byte_size: m.matched_byte_size,
      sha256_hash: m.matched_sha256 || "",
      uploaded_at: m.matched_uploaded_at,
      match_note: [
        m.decision_label || m.decision,
        m.tier_label,
        conf != null ? `${conf.toFixed(0)}% confidence` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  const f = target.file;
  return {
    id: f.id,
    title: displayTitle(f),
    original_filename: f.original_filename,
    client_name: f.client_name || "",
    erp_code: f.erp_code || "",
    anzsco: f.anzsco || "",
    team: f.team || "",
    member: f.member || "",
    byte_size: f.byte_size,
    sha256_hash: f.sha256_hash || "",
    status: f.status,
    status_label: f.status_label,
    uploaded_at: f.uploaded_at,
    uploader_name: f.uploader_name,
    sources: f.sources,
  };
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const empty = !value.trim();
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-soft)]">
        {label}
      </p>
      <p
        className={[
          "mt-1 break-words text-[13px] leading-snug text-[var(--ink)]",
          mono ? "font-mono text-[12px]" : "font-medium tracking-[-0.01em]",
          empty ? "text-[var(--muted-soft)]" : "",
        ].join(" ")}
        title={empty ? undefined : value}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

function shortHash(hash: string): string {
  if (!hash) return "—";
  if (hash.length <= 24) return hash;
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

/**
 * Read-only modal of document form fields + file metadata for a matched
 * duplicate or corpus match.
 */
export function FileDetailsModal({ open, target, onClose }: Props) {
  const [view, setView] = useState<DetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) {
      setView(null);
      setError(null);
      setLoading(false);
      return;
    }

    const seed = seedFromTarget(target);
    setView(seed);
    setError(null);

    const fileId = seed.id;
    if (!fileId) return;

    const ac = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const status = await getFileStatus(fileId, { signal: ac.signal });
        const f = status.file;
        if (ac.signal.aborted || !f) return;
        setView((prev) => ({
          id: f.id,
          title: displayTitle(f),
          original_filename: f.original_filename || prev?.original_filename || "",
          client_name: f.client_name || prev?.client_name || "",
          erp_code: f.erp_code || prev?.erp_code || "",
          anzsco: f.anzsco || prev?.anzsco || "",
          team: f.team || prev?.team || "",
          member: f.member || prev?.member || "",
          byte_size: f.byte_size || prev?.byte_size || 0,
          sha256_hash: f.sha256_hash || prev?.sha256_hash || "",
          status: f.status,
          status_label: f.status_label || f.status,
          uploaded_at: f.uploaded_at || prev?.uploaded_at,
          uploader_name: f.uploader_name || prev?.uploader_name,
          sources: f.sources,
          match_note: prev?.match_note,
        }));
      } catch (err) {
        if (ac.signal.aborted) return;
        // Keep seed data if hydrate fails (e.g. nested upload without file row).
        setError(
          err instanceof Error
            ? err.message
            : "Could not load full document details",
        );
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [open, target]);

  const title = view?.title || "Document details";
  const sourceCount = view?.sources?.length ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Document details"
      description={title}
      size="lg"
      headerAction={
        view?.id ? (
          <button
            type="button"
            onClick={() =>
              window.open(fileContentURL(view.id), "_blank", "noopener,noreferrer")
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-white px-2.5 text-[12.5px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)]"
          >
            Open
            <ExternalLink className="size-3.5" strokeWidth={1.75} />
          </button>
        ) : null
      }
    >
      {!view ? (
        <div className="flex h-32 items-center justify-center gap-2 text-[13px] text-[var(--muted)]">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-5 pb-1">
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--ink)]">
              <FileText className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {view.title}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                {view.original_filename || "—"}
                {view.match_note ? ` · ${view.match_note}` : ""}
              </p>
              {loading && (
                <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-[var(--muted-soft)]">
                  <Loader2 className="size-3 animate-spin" />
                  Refreshing latest fields…
                </p>
              )}
              {error && (
                <p className="mt-1 text-[11.5px] text-amber-700">{error}</p>
              )}
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
              Form details
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="PDF title" value={view.title} />
              <Field label="Client name" value={view.client_name} />
              <Field label="ERP code" value={view.erp_code} mono />
              <Field label="ANZSCO" value={view.anzsco} mono />
              <Field label="Team" value={view.team} />
              <Field label="Member" value={view.member} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
              File information
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Original filename" value={view.original_filename} />
              <Field
                label="Size"
                value={view.byte_size ? formatBytes(view.byte_size) : ""}
              />
              <Field
                label="Status"
                value={view.status_label || view.status || ""}
              />
              <Field label="Uploaded by" value={view.uploader_name || ""} />
              <Field
                label="Uploaded"
                value={
                  view.uploaded_at
                    ? formatUploadedAt(view.uploaded_at) ||
                      new Date(view.uploaded_at).toLocaleString()
                    : ""
                }
              />
              <Field
                label="SHA-256"
                value={shortHash(view.sha256_hash)}
                mono
              />
            </div>
          </section>

          {(sourceCount > 0 || view.sources) && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                Sources
                <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--muted-soft)]">
                  {sourceCount}/{SOURCE_SLOT_COUNT}
                </span>
              </h3>
              {sourceCount === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-[12.5px] text-[var(--muted)]">
                  No source files attached.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
                  {(view.sources ?? []).map((s) => (
                    <li
                      key={`${s.slot}-${s.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium text-[var(--ink)]">
                          Source {s.slot}
                        </p>
                        <p
                          className="truncate text-[11.5px] text-[var(--muted)]"
                          title={s.original_filename}
                        >
                          {displaySourceTitle(view, s)}
                          {s.byte_size
                            ? ` · ${formatBytes(s.byte_size)}`
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--muted)]">
                        {s.decision_label ||
                          s.match_status ||
                          s.decision ||
                          "Attached"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
