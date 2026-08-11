"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ExternalLink,
  GitCompare,
  Hourglass,
  Loader2,
  ShieldQuestion,
  Trash2,
  X,
} from "lucide-react";
import {
  IntakeCompareModal,
  type ReviewCompareTarget,
} from "@/components/files/IntakeCompareModal";
import {
  isActionableReview,
  reviewCompareTarget,
  reviewStatusChip,
  type ReviewChangedInfo,
} from "@/components/files/reviewShared";
import {
  approveReview,
  discardReview,
  fetchReviewQueue,
  fileContentURL,
  rejectReview,
  requestReview,
  type FileRecord,
  type ReviewItem,
} from "@/lib/api";
import { formatBytes, formatUploadedAt } from "@/lib/files";
import { onReviewRefresh } from "@/lib/realtime";
import { useNotificationsStore } from "@/store/notifications-store";

export type { ReviewChangedInfo };

type Props = {
  isAdmin: boolean;
  /** Bump to force an immediate refetch (e.g. right after an upload prompt). */
  refreshKey: number;
  onNotice?: (message: string) => void;
  /** Fired after review decisions (and when a new approval appears via poll). */
  onReviewChanged?: (info: ReviewChangedInfo) => void;
};

const POLL_MS_LIVE = 60_000;
const POLL_MS_FALLBACK = 15_000;

/**
 * Compact documents-table banner: only items that still need a decision.
 * Full history lives on /review.
 */
export function ReviewQueuePanel({
  isAdmin,
  refreshKey,
  onNotice,
  onReviewChanged,
}: Props) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] =
    useState<ReviewCompareTarget | null>(null);
  const seqRef = useRef(0);
  const approvedIdsRef = useRef<Set<string>>(new Set());
  const approvedPrimedRef = useRef(false);
  const onReviewChangedRef = useRef(onReviewChanged);
  onReviewChangedRef.current = onReviewChanged;

  const reload = useCallback(async (signal?: AbortSignal) => {
    const seq = ++seqRef.current;
    try {
      const res = await fetchReviewQueue({ signal });
      if (seq !== seqRef.current) return;
      setItems(res.items);
      setError(null);
      const approvedIds = new Set(
        res.items
          .filter((i) => i.review_status === "approved")
          .map((i) => i.id),
      );
      if (!approvedPrimedRef.current) {
        approvedPrimedRef.current = true;
        approvedIdsRef.current = approvedIds;
      } else {
        let grew = false;
        for (const id of approvedIds) {
          if (!approvedIdsRef.current.has(id)) {
            grew = true;
            break;
          }
        }
        approvedIdsRef.current = approvedIds;
        if (grew) {
          onReviewChangedRef.current?.({ action: "sync" });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load review queue");
    }
  }, []);

  const live = useNotificationsStore((s) => s.live);

  useEffect(() => {
    const controller = new AbortController();
    const kickoff = window.setTimeout(() => void reload(controller.signal), 0);
    const pollMs = live ? POLL_MS_LIVE : POLL_MS_FALLBACK;
    const interval = window.setInterval(() => void reload(), pollMs);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    const offRealtime = onReviewRefresh(() => void reload());
    return () => {
      controller.abort();
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      offRealtime();
    };
  }, [reload, refreshKey, live]);

  const actionable = useMemo(
    () => items.filter((item) => isActionableReview(item, isAdmin)),
    [items, isAdmin],
  );

  const act = useCallback(
    async (
      item: ReviewItem,
      action: "request" | "approve" | "reject" | "discard",
    ) => {
      if (busyId) return;
      setBusyId(item.id);
      try {
        let message = "";
        let original: FileRecord | null | undefined;
        let updatedItem: ReviewItem | undefined = item;
        if (action === "request") {
          const res = await requestReview(item.id);
          message = res.message;
          updatedItem = res.item ?? item;
        } else if (action === "approve") {
          const res = await approveReview(item.id);
          message = res.message;
          updatedItem = res.item ?? item;
          original = res.original;
        } else if (action === "reject") {
          const res = await rejectReview(item.id);
          message = res.message;
        } else {
          const res = await discardReview(item.id);
          message = res.message;
        }
        onNotice?.(message);
        if (action === "approve") {
          approvedIdsRef.current.add(item.id);
        }
        await reload();
        onReviewChanged?.({ action, item: updatedItem, original });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Review action failed");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, onNotice, onReviewChanged, reload],
  );

  if (actionable.length === 0 && !error) return null;

  return (
    <>
      <section
        aria-label="Duplicate review actions"
        className="border-b border-[var(--border)] bg-[var(--canvas)] px-4 py-3 sm:px-5"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ShieldQuestion
            className="size-4 text-[var(--accent)]"
            strokeWidth={1.75}
          />
          <h2 className="text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
            Needs review
          </h2>
          <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--muted)]">
            {actionable.length}
          </span>
          <Link
            href="/review"
            className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
          >
            View all reviews
            <ArrowRight className="size-3.5" strokeWidth={1.75} />
          </Link>
        </div>

        {error && (
          <p role="alert" className="mb-2 text-[12px] text-red-600">
            {error}
          </p>
        )}

        <ul className="space-y-1.5">
          {actionable.map((item) => {
            const chip = reviewStatusChip(item);
            const busy = busyId === item.id;
            const canCompare = isAdmin && Boolean(item.original_file_id);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--ink)]">
                    <Hourglass className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p
                      className="truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--ink)]"
                      title={item.title}
                    >
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                      {isAdmin && item.uploader_name
                        ? `${item.uploader_name} · `
                        : ""}
                      {formatBytes(item.byte_size)} · duplicate of{" "}
                      <span className="font-medium text-[var(--ink)]">
                        {item.original_title || "an existing document"}
                      </span>
                      {formatUploadedAt(item.created_at)
                        ? ` · uploaded ${formatUploadedAt(item.created_at)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
                >
                  {chip.label}
                </span>

                <div className="flex shrink-0 items-center gap-1">
                  {canCompare && (
                    <button
                      type="button"
                      onClick={() => setCompareTarget(reviewCompareTarget(item))}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-orange-50 px-2 text-[12px] font-medium text-orange-800 hover:bg-orange-100"
                      title="Compare original and submitted duplicate side by side"
                    >
                      <GitCompare className="size-3" strokeWidth={1.75} />
                      Compare
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        fileContentURL(item.id),
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                    className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                  >
                    Open
                    <ExternalLink className="size-3" strokeWidth={1.75} />
                  </button>

                  {isAdmin && item.review_status === "requested" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(item, "approve")}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" strokeWidth={2} />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(item, "reject")}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-600 px-2.5 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <X className="size-3" strokeWidth={2} />
                        )}
                        Reject
                      </button>
                    </>
                  )}

                  {!isAdmin && item.review_status === "prompt" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(item, "request")}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--ink)] px-2.5 text-[12px] font-medium text-white hover:bg-black disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <BadgeCheck className="size-3" strokeWidth={1.75} />
                      )}
                      Request review
                    </button>
                  )}

                  {!isAdmin && item.review_status === "prompt" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(item, "discard")}
                      className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      aria-label={`Discard ${item.title}`}
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" strokeWidth={1.75} />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <IntakeCompareModal
        open={compareTarget != null}
        target={compareTarget}
        onClose={() => setCompareTarget(null)}
      />
    </>
  );
}
