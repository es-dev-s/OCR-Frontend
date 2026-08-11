"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { PopoverPanel } from "@/components/ui/PopoverPanel";
import { selectAuthUser, useAuthStore } from "@/store/auth-store";

type ProfilePopoverProps = {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
};

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return (email.slice(0, 2) || "U").toUpperCase();
}

export function ProfilePopover({
  open,
  onClose,
  triggerRef,
}: ProfilePopoverProps) {
  const router = useRouter();
  const user = useAuthStore(selectAuthUser);
  const logout = useAuthStore((s) => s.logout);

  const name = user?.name || "User";
  const email = user?.email || "";
  const role = user?.role || "";

  return (
    <PopoverPanel
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      width={260}
      label="Account"
    >
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-semibold text-white">
          {initials(name, email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
            {name}
          </p>
          <p className="truncate text-[12px] text-[var(--muted)]">{email}</p>
          {role ? (
            <p className="mt-0.5 text-[11px] font-medium capitalize text-[var(--muted-soft)]">
              {role}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={async () => {
            onClose();
            await logout();
            router.replace("/login");
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13.5px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
        >
          <LogOut className="size-4" strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </PopoverPanel>
  );
}
