"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  GitCompare,
  Hourglass,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  Trash2,
  X,
} from "lucide-react";
import {
  IntakeCompareModal,
  type ReviewCompareTarget,
} from "@/components/files/IntakeCompareModal";
import {
  reviewCompareTarget,
  reviewStatusChip,
} from "@/components/files/reviewShared";
import {
  approveReview,
  discardReview,
  fetchReviewQueue,
  fileContentURL,
  rejectReview,
  requestReview,
  type ReviewItem,
} from "@/lib/api";
import { formatBytes, formatUploadedAt } from "@/lib/files";
import { onReviewRefresh } from "@/lib/realtime";
import { useNotificationsStore } from "@/store/notifications-store";

type FilterKey = "action" | "waiting" | "approved" | "all";

type Props = {
  isAdmin: boolean;
};

function matchesFilter(
  item: ReviewItem,
  filter: FilterKey,
  isAdmin: boolean,
): boolean {
  switch (filter) {
    case "action":
      return isAdmin
        ? item.review_status === "requested"
        : item.review_status === "prompt";
    case "waiting":
      // Members: waiting on admin. Admins: same as action (requested).
      return item.review_status === "requested";
    case "approved":
      return item.review_status === "approved";
    case "all":
    default:
      return true;
  }
}

/**
 * Full review history for members (own uploads) and admins (queue + decisions).
 */
export function ReviewWorkspace({ isAdmin }: Props) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [filterReady, setFilterReady] = useState(false);
  const [compareTarget, setCompareTarget] =
    useState<ReviewCompareTarget | null>(null);
  const seqRef = useRef(0);
  const noticeTimer = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4500);
  }, []);

  const reload = useCallback(async (signal?: AbortSignal, soft = false) => {
    const seq = ++seqRef.current;
    if (!soft) setLoading(true);
    try {
      const res = await fetchReviewQueue({ signal });
      if (seq !== seqRef.current) return;
      setItems(res.items);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (seq !== seqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load reviews");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  const live = useNotificationsStore((s) => s.live);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    const pollMs = live ? 60_000 : 15_000;
    const interval = window.setInterval(
      () => void reload(undefined, true),
      pollMs,
    );
    const onFocus = () => void reload(undefined, true);
    window.addEventListener("focus", onFocus);
    const offRealtime = onReviewRefresh(() => void reload(undefined, true));
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      offRealtime();
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, [reload, live]);

  const counts = useMemo(() => {
    let action = 0;
    let waiting = 0;
    let approved = 0;
    for (const item of items) {
      if (item.review_status === "approved") approved += 1;
      if (item.review_status === "requested") waiting += 1;
      if (isAdmin) {
        if (item.review_status === "requested") action += 1;
      } else if (item.review_status === "prompt") {
        action += 1;
      }
    }
    return { action, waiting, approved, all: items.length };
  }, [items, isAdmin]);

  // First load: prefer Needs action when something needs a decision.
  useEffect(() => {
    if (loading || filterReady) return;
    setFilter(counts.action > 0 ? "action" : "all");
    setFilterReady(true);
  }, [loading, filterReady, counts.action]);

  const visible = useMemo(
    () => items.filter((item) => matchesFilter(item, filter, isAdmin)),
    [items, filter, isAdmin],
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
        if (action === "request") {
          message = (await requestReview(item.id)).message;
        } else if (action === "approve") {
          message = (await approveReview(item.id)).message;
        } else if (action === "reject") {
          message = (await rejectReview(item.id)).message;
        } else {
          message = (await discardReview(item.id)).message;
        }
        showNotice(message);
        await reload(undefined, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Review action failed");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, reload, showNotice],
  );

  const tabs: { key: FilterKey; label: string; count: number; hide?: boolean }[] =
    [
      { key: "action", label: "Needs action", count: counts.action },
      {
        key: "waiting",
        label: isAdmin ? "Requested" : "Waiting on admin",
        count: counts.waiting,
        // Admin already has "Needs action" == requested.
        hide: isAdmin,
      },
      { key: "approved", label: "Approved", count: counts.approved },
      { key: "all", label: "All", count: counts.all },
    ];

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldQuestion
                className="size-4 text-[var(--accent)]"
                strokeWidth={1.75}
              />
              <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                Duplicate review
              </h1>
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">
              {isAdmin
                ? "Approve or reject member duplicate requests, and browse past decisions."
                : "Request admin review for exact duplicates, and track approvals."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload(undefined, true)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-white px-3 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" strokeWidth={1.75} />
            )}
            Refresh
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5 sm:px-6">
          {tabs
            .filter((tab) => !tab.hide)
            .map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={[
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition-colors",
                    active
                      ? "bg-[var(--ink)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
                  ].join(" ")}
                >
                  {tab.label}
                  <span
                    className={[
                      "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                      active
                        ? "bg-white/15 text-white"
                        : "bg-[var(--surface-muted)] text-[var(--muted)]",
                    ].join(" ")}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
        </div>

        {notice && (
          <div className="shrink-0 border-b border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-[13px] text-emerald-800 sm:px-6">
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="shrink-0 border-b border-red-200/80 bg-red-50/90 px-4 py-2 text-[13px] text-red-700 sm:px-6"
          >
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {loading && items.length === 0 ? (
            <div className="flex h-40 items-center justify-center gap-2 text-[13px] text-[var(--muted)]">
              <Loader2 className="size-4 animate-spin" />
              Loading reviews…
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--canvas)] px-6 text-center">
              <p className="text-[13.5px] font-medium text-[var(--ink)]">
                {filter === "all"
                  ? "No duplicate reviews yet"
                  : "Nothing in this filter"}
              </p>
              <p className="mt-1 max-w-sm text-[12.5px] text-[var(--muted)]">
                {isAdmin
                  ? "When members request review for an exact duplicate, items appear here."
                  : "If you upload a file that exactly matches someone else’s document, it will show up here."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((item) => {
                const chip = reviewStatusChip(item);
                const busy = busyId === item.id;
                const canOpenOriginal =
                  isAdmin || item.review_status === "approved";
                const canCompare =
                  Boolean(item.original_file_id) &&
                  (isAdmin || item.review_status === "approved");
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-[var(--border)] bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)]"
                  >
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-muted)] text-[var(--ink)]">
                        {item.review_status === "approved" ? (
                          <Copy className="size-4" strokeWidth={1.75} />
                        ) : (
                          <Hourglass className="size-4" strokeWidth={1.75} />
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p
                            className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]"
                            title={item.title}
                          >
                            {item.title}
                          </p>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
                          >
                            {chip.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
                          {isAdmin && item.uploader_name ? (
                            <>
                              <span className="font-medium text-[var(--ink)]">
                                {item.uploader_name}
                              </span>
                              {" · "}
                            </>
                          ) : null}
                          {formatBytes(item.byte_size)}
                          {item.client_name ? ` · ${item.client_name}` : ""}
                          {" · duplicate of "}
                          {canOpenOriginal ? (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  fileContentURL(item.original_file_id),
                                  "_blank",
                                  "noopener,noreferrer",
                                )
                              }
                              className="inline font-medium text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
                            >
                              {item.original_title || "original document"}
                            </button>
                          ) : (
                            <span className="font-medium text-[var(--ink)]">
                              {item.original_title || "an existing document"}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[11.5px] text-[var(--muted-soft)]">
                          {[
                            formatUploadedAt(item.created_at)
                              ? `Uploaded ${formatUploadedAt(item.created_at)}`
                              : null,
                            item.review_status === "approved" &&
                            formatUploadedAt(item.reviewed_at)
                              ? `Approved ${formatUploadedAt(item.reviewed_at)}${
                                  item.reviewed_by_name
                                    ? ` by ${item.reviewed_by_name}`
                                    : ""
                                }`
                              : null,
                            item.review_status === "requested"
                              ? "Waiting for admin decision"
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                        {canCompare && (
                          <button
                            type="button"
                            onClick={() =>
                              setCompareTarget(reviewCompareTarget(item))
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-orange-50 px-2.5 text-[12px] font-medium text-orange-800 hover:bg-orange-100"
                          >
                            <GitCompare
                              className="size-3.5"
                              strokeWidth={1.75}
                            />
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
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                        >
                          Open
                          <ExternalLink
                            className="size-3.5"
                            strokeWidth={1.75}
                          />
                        </button>

                        {isAdmin && item.review_status === "requested" && (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(item, "approve")}
                              className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" strokeWidth={2} />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(item, "reject")}
                              className="inline-flex h-8 items-center gap-1 rounded-lg bg-red-600 px-2.5 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <X className="size-3.5" strokeWidth={2} />
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
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--ink)] px-2.5 text-[12px] font-medium text-white hover:bg-black disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <BadgeCheck
                                className="size-3.5"
                                strokeWidth={1.75}
                              />
                            )}
                            Request review
                          </button>
                        )}

                        {!isAdmin &&
                          (item.review_status === "prompt" ||
                            item.review_status === "requested") && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void act(item, "discard")}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              aria-label={`Discard ${item.title}`}
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2
                                  className="size-3.5"
                                  strokeWidth={1.75}
                                />
                              )}
                            </button>
                          )}

                        {isAdmin && item.review_status === "approved" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void act(item, "discard")}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Remove ${item.title}`}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" strokeWidth={1.75} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <IntakeCompareModal
        open={compareTarget != null}
        target={compareTarget}
        onClose={() => setCompareTarget(null)}
      />
    </>
  );
}
