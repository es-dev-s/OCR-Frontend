"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { PopoverPanel } from "@/components/ui/PopoverPanel";
import { formatUploadedAt } from "@/lib/files";
import { useNotificationsStore } from "@/store/notifications-store";

type NotificationsPopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

function kindTone(kind: string): string {
  switch (kind) {
    case "review.approved":
      return "bg-emerald-50 text-emerald-800";
    case "review.rejected":
      return "bg-red-50 text-red-700";
    case "review.requested":
      return "bg-[#fffaeb] text-[#b54708]";
    case "review.prompt":
      return "bg-[#eff6ff] text-[#1d4ed8]";
    default:
      return "bg-[var(--surface-muted)] text-[var(--muted)]";
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "review.approved":
      return "Approved";
    case "review.rejected":
      return "Rejected";
    case "review.requested":
      return "Requested";
    case "review.prompt":
      return "Action needed";
    default:
      return "Update";
  }
}

export function NotificationsPopover({
  open,
  onClose,
  triggerRef,
}: NotificationsPopoverProps) {
  const router = useRouter();
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const loading = useNotificationsStore((s) => s.loading);
  const live = useNotificationsStore((s) => s.live);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  return (
    <PopoverPanel
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      width={360}
      label="Notifications"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
            Notifications
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-soft)]">
            {live ? "Live" : "Reconnecting…"}
            {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
              title="Mark all as read"
            >
              <CheckCheck className="size-3.5" strokeWidth={1.75} />
              Read all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="px-4 py-10 text-center text-[12.5px] text-[var(--muted)]">
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--muted)]">
            <Bell className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-[13.5px] font-medium tracking-[-0.01em] text-[var(--ink)]">
            You’re all caught up
          </p>
          <p className="mt-1 max-w-[16rem] text-[12.5px] leading-relaxed text-[var(--muted)]">
            Review requests, approvals, and other alerts appear here in real time.
          </p>
        </div>
      ) : (
        <ul className="max-h-[min(24rem,60vh)] overflow-y-auto py-1">
          {items.map((n) => {
            const unread = !n.read_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    void markRead(n.id);
                    onClose();
                    const href = n.href || "/review";
                    router.push(href);
                  }}
                  className={[
                    "flex w-full gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--canvas)]",
                    unread ? "bg-[var(--accent-soft)]/40" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "mt-1 size-2 shrink-0 rounded-full",
                      unread ? "bg-[var(--accent)]" : "bg-transparent",
                    ].join(" ")}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${kindTone(n.kind)}`}
                      >
                        {kindLabel(n.kind)}
                      </span>
                      <span className="text-[10.5px] text-[var(--muted-soft)]">
                        {formatUploadedAt(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] font-medium text-[var(--ink)]">
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--muted)]">
                        {n.body}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-[var(--border)] px-4 py-2">
        <Link
          href="/review"
          onClick={onClose}
          className="text-[12px] font-medium text-[var(--accent)] hover:underline"
        >
          Open review page
        </Link>
      </div>
    </PopoverPanel>
  );
}
