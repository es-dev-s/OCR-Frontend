"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Loader2,
  ScanText,
} from "lucide-react";
import {
  ApiError,
  fetchPublicShare,
  fetchPublicShareContentURL,
  publicShareContentURL,
  publicShareSourceContentURL,
  type PublicShareRecord,
} from "@/lib/api";
import { formatBytes } from "@/lib/files";
import { isShareToken } from "@/lib/share";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const raw = typeof params.token === "string" ? params.token : "";
  const token = raw.trim().toLowerCase();

  const [doc, setDoc] = useState<PublicShareRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const validFormat = useMemo(() => isShareToken(token), [token]);

  useEffect(() => {
    if (!validFormat) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await fetchPublicShare(token);
        if (!cancelled) {
          setDoc(data);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        // Tweaked / unknown tokens → login only (no data leak).
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
          router.replace("/login");
          return;
        }
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, validFormat, router]);

  const openPrimary = async () => {
    if (!doc) return;
    setOpening(true);
    try {
      const { url } = await fetchPublicShareContentURL(token);
      window.open(url || publicShareContentURL(token), "_blank", "noopener,noreferrer");
    } catch {
      window.open(publicShareContentURL(token), "_blank", "noopener,noreferrer");
    } finally {
      setOpening(false);
    }
  };

  if (!validFormat || loading || !doc) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--canvas)] px-4">
        <div className="inline-flex items-center gap-2 text-[13px] text-[var(--muted)]">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
          Opening shared document…
        </div>
      </div>
    );
  }

  const title = (doc.title || "").trim() || doc.original_filename;
  const sources = doc.sources ?? [];

  return (
    <div className="relative min-h-full overflow-hidden bg-[var(--canvas)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,113,227,0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(0,0,0,0.03), transparent 50%)",
        }}
      />
      <header className="relative border-b border-[var(--border)] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 text-[var(--ink)]">
            <ScanText className="size-5 text-[var(--accent)]" strokeWidth={1.75} />
            <span className="text-[14px] font-semibold tracking-tight">OCR Engine</span>
          </div>
          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
            Shared view
          </span>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="animate-[fadeRise_0.45s_var(--shell-ease)_both]">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--muted-soft)]">
            Public document
          </p>
          <h1 className="mt-2 text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-[2rem]">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
            This link shows only this document. It is not signed in to the workspace.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void openPrimary()}
              disabled={opening}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-60"
            >
              {opening ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
              )}
              Open file
            </button>
            <span className="text-[12.5px] text-[var(--muted)]">
              {formatBytes(doc.byte_size)}
              <span className="mx-1.5 text-[var(--border-strong)]">·</span>
              {doc.status_label || doc.status}
            </span>
          </div>
        </div>

        <section
          className="mt-10 animate-[fadeRise_0.55s_var(--shell-ease)_both] rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6"
          style={{ animationDelay: "60ms" }}
        >
          <h2 className="text-[13px] font-semibold text-[var(--ink)]">Intake details</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Client", doc.client_name],
                ["ERP code", doc.erp_code],
                ["ANZSCO", doc.anzsco],
                ["Team", doc.team],
                ["Member", doc.member],
                ["Uploaded", formatWhen(doc.uploaded_at)],
                ["By", (doc.uploader_name || "").trim() || "—"],
                ["Filename", doc.original_filename],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--muted-soft)]">
                  {label}
                </dt>
                <dd className="mt-1 break-words text-[13.5px] text-[var(--ink)]">
                  {(value || "").trim() || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {sources.length > 0 ? (
          <section
            className="mt-5 animate-[fadeRise_0.55s_var(--shell-ease)_both] rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6"
            style={{ animationDelay: "120ms" }}
          >
            <h2 className="text-[13px] font-semibold text-[var(--ink)]">
              Sources{" "}
              <span className="font-normal text-[var(--muted-soft)]">
                ({sources.length}/4)
              </span>
            </h2>
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {sources.map((s) => {
                const srcTitle =
                  (s.title || "").trim() ||
                  s.original_filename ||
                  s.label ||
                  `Source ${s.slot}`;
                return (
                  <li
                    key={s.slot}
                    className="flex items-center gap-3 py-3 first:pt-1 last:pb-0"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--canvas)] text-[11px] font-semibold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
                      {s.slot}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--ink)]">
                        {srcTitle}
                      </p>
                      <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                        {s.original_filename}
                        <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                        {formatBytes(s.byte_size)}
                      </p>
                    </div>
                    <a
                      href={publicShareSourceContentURL(token, s.slot)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--canvas)] hover:text-[var(--ink)]"
                      aria-label={`Open ${srcTitle}`}
                    >
                      <FileText className="size-3.5" strokeWidth={1.75} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <p className="mt-8 text-center text-[12px] text-[var(--muted-soft)]">
          Access is limited to this shared document. Workspace login is required for anything else.
        </p>
      </main>
    </div>
  );
}
