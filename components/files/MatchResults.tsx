"use client";

import {
  ExternalLink,
  FileText,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { fileContentURL, type FileRecord, type MatchRecord } from "@/lib/api";

type MatchResultsProps = {
  sourceFile: FileRecord;
  matches: MatchRecord[];
  tier0Duplicate?: boolean;
};

function formatBytes(n: number): string {
  if (!n || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function shortHash(hash: string): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function decisionIcon(decision: string) {
  if (decision === "exact_bytes" || decision === "auto_duplicate") {
    return ShieldAlert;
  }
  if (decision === "needs_review") {
    return ShieldQuestion;
  }
  return ShieldCheck;
}

function decisionTone(decision: string): {
  badge: string;
  bar: string;
  ring: string;
} {
  if (decision === "exact_bytes" || decision === "auto_duplicate") {
    return {
      badge: "bg-[#fff1f0] text-[#b42318] border-[#ffd6d3]",
      bar: "bg-[#d92d20]",
      ring: "border-[#ffd6d3]",
    };
  }
  if (decision === "needs_review") {
    return {
      badge: "bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]",
      bar: "bg-[#ea580c]",
      ring: "border-[#fed7aa]",
    };
  }
  return {
    badge: "bg-[var(--surface-muted)] text-[var(--muted)] border-[var(--border)]",
    bar: "bg-[var(--muted-soft)]",
    ring: "border-[var(--border)]",
  };
}

function openMatchedFile(fileId: string) {
  window.open(fileContentURL(fileId), "_blank", "noopener,noreferrer");
}

function ConfidenceMeter({
  percent,
  barClass,
}: {
  percent: number;
  barClass: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="min-w-[9rem] flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-[var(--muted)]">
          Match confidence
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)] tabular-nums">
          {clamped.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${barClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function MatchCard({
  match,
  sourceName,
}: {
  match: MatchRecord;
  sourceName: string;
}) {
  const tone = decisionTone(match.decision);
  const Icon = decisionIcon(match.decision);
  const confidence = match.confidence_percent ?? match.similarity * 100;

  return (
    <article
      className={`rounded-2xl border bg-white p-4 sm:p-5 ${tone.ring}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${tone.badge}`}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {match.decision_label || match.decision}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--muted)]">
              <Fingerprint className="size-3.5" strokeWidth={1.75} />
              {match.tier_label || `Tier ${match.match_tier}`}
            </span>
          </div>

          <p className="text-[12px] text-[var(--muted)]">Matched against</p>
          <button
            type="button"
            onClick={() => openMatchedFile(match.matched_file_id)}
            className="group mt-1 flex max-w-full items-center gap-2 text-left"
            title="Open matched file"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--ink)]">
              <FileText className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)] underline-offset-2 group-hover:underline group-hover:text-[var(--accent)]">
                {match.matched_filename || "Unknown file"}
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                Click to open · compared with{" "}
                <span className="text-[var(--ink)]">{sourceName}</span>
              </span>
            </span>
            <ExternalLink
              className="size-3.5 shrink-0 text-[var(--muted-soft)] transition-colors group-hover:text-[var(--accent)]"
              strokeWidth={1.75}
            />
          </button>

          {match.decision_detail && (
            <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-[var(--muted)]">
              {match.decision_detail}
            </p>
          )}
        </div>

        <ConfidenceMeter percent={confidence} barClass={tone.bar} />
      </div>

      <dl className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            File size
          </dt>
          <dd className="mt-1 text-[13px] text-[var(--ink)]">
            {formatBytes(match.matched_byte_size)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            Uploaded
          </dt>
          <dd className="mt-1 text-[13px] text-[var(--ink)]">
            {match.matched_uploaded_at
              ? new Date(match.matched_uploaded_at).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            SHA-256
          </dt>
          <dd
            className="mt-1 font-mono text-[12px] text-[var(--ink)]"
            title={match.matched_sha256}
          >
            {shortHash(match.matched_sha256)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openMatchedFile(match.matched_file_id)}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--ink)] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-black"
        >
          Open matched file
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => openMatchedFile(match.file_id)}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-white px-3.5 text-[12.5px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
        >
          Open uploaded file
        </button>
      </div>
    </article>
  );
}

function Tier0Card({ file }: { file: FileRecord }) {
  const tone = decisionTone("exact_bytes");
  return (
    <article className={`rounded-2xl border bg-white p-4 sm:p-5 ${tone.ring}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${tone.badge}`}
            >
              <ShieldAlert className="size-3.5" strokeWidth={1.75} />
              Exact byte match
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--muted)]">
              <Fingerprint className="size-3.5" strokeWidth={1.75} />
              Tier 0 · Exact bytes
            </span>
          </div>

          <p className="text-[12px] text-[var(--muted)]">Matched against existing file</p>
          <button
            type="button"
            onClick={() => openMatchedFile(file.id)}
            className="group mt-1 flex max-w-full items-center gap-2 text-left"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--ink)]">
              <FileText className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)] underline-offset-2 group-hover:underline group-hover:text-[var(--accent)]">
                {file.original_filename}
              </span>
              <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                Identical SHA-256 — click to open the stored original
              </span>
            </span>
            <ExternalLink
              className="size-3.5 shrink-0 text-[var(--muted-soft)] group-hover:text-[var(--accent)]"
              strokeWidth={1.75}
            />
          </button>

          <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-[var(--muted)]">
            Postgres rejected a second insert for this hash. The upload is the same
            bytes as an existing document (rename-safe exact duplicate).
          </p>
        </div>
        <ConfidenceMeter percent={100} barClass={tone.bar} />
      </div>

      <dl className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            File size
          </dt>
          <dd className="mt-1 text-[13px] text-[var(--ink)]">
            {formatBytes(file.byte_size)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            Uploaded
          </dt>
          <dd className="mt-1 text-[13px] text-[var(--ink)]">
            {new Date(file.uploaded_at).toLocaleString()}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-[var(--muted-soft)]">
            SHA-256
          </dt>
          <dd className="mt-1 font-mono text-[12px] text-[var(--ink)]" title={file.sha256_hash}>
            {shortHash(file.sha256_hash)}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => openMatchedFile(file.id)}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--ink)] px-3.5 text-[12.5px] font-medium text-white transition-colors hover:bg-black"
        >
          Open matched file
          <ExternalLink className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

export function MatchResults({
  sourceFile,
  matches,
  tier0Duplicate = false,
}: MatchResultsProps) {
  const hasMatches = matches.length > 0 || tier0Duplicate;

  if (!hasMatches) {
    return (
      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/50 px-4 py-5">
        <p className="text-[13.5px] font-medium text-[var(--ink)]">No matches found</p>
        <p className="mt-1 text-[12.5px] text-[var(--muted)]">
          When Tier 1 or Deep Scan finds similar documents, you’ll see each matched
          filename, confidence score, and a link to open that file.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Match details
          </h3>
          <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
            {tier0Duplicate
              ? "Exact byte duplicate of an existing file"
              : `${matches.length} document${matches.length === 1 ? "" : "s"} compared against ${sourceFile.original_filename}`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {tier0Duplicate && <Tier0Card file={sourceFile} />}
        {matches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            sourceName={sourceFile.original_filename}
          />
        ))}
      </div>
    </div>
  );
}
