"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search } from "lucide-react";
import { getPageTitle } from "@/lib/navigation";
import { SearchPopover } from "@/components/navbar/SearchPopover";
import { NotificationsPopover } from "@/components/navbar/NotificationsPopover";
import { ProfilePopover } from "@/components/navbar/ProfilePopover";
import {
  selectNotificationsOpen,
  selectSearchOpen,
  selectUserMenuOpen,
  useUIStore,
} from "@/store/ui-store";
import { selectAuthUser, useAuthStore } from "@/store/auth-store";
import { useNotificationsStore } from "@/store/notifications-store";

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

export function Navbar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const user = useAuthStore(selectAuthUser);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  const searchOpen = useUIStore(selectSearchOpen);
  const userMenuOpen = useUIStore(selectUserMenuOpen);
  const notificationsOpen = useUIStore(selectNotificationsOpen);

  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const toggleUserMenu = useUIStore((s) => s.toggleUserMenu);
  const closeUserMenu = useUIStore((s) => s.closeUserMenu);
  const toggleNotifications = useUIStore((s) => s.toggleNotifications);
  const closeNotifications = useUIStore((s) => s.closeNotifications);
  const closeNavbarOverlays = useUIStore((s) => s.closeNavbarOverlays);
  const openMobileSidebar = useUIStore((s) => s.openMobileSidebar);

  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const notifyTriggerRef = useRef<HTMLButtonElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);

  // Global shortcut — only toggles search; never touches sidebar
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleSearch();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleSearch]);

  // Route change closes overlays only
  useEffect(() => {
    closeNavbarOverlays();
  }, [pathname, closeNavbarOverlays]);

  return (
    <header className="page-x sticky top-0 z-30 flex h-[var(--navbar-height)] shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]">
      <button
        type="button"
        onClick={openMobileSidebar}
        className="inline-flex size-9 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-[18px]" strokeWidth={1.75} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-1">
        <button
          ref={searchTriggerRef}
          type="button"
          onClick={toggleSearch}
          className={[
            "inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-[var(--muted)]",
            "transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            searchOpen ? "bg-[var(--surface-muted)] text-[var(--ink)]" : "",
          ].join(" ")}
          aria-label="Search"
          aria-expanded={searchOpen}
          aria-haspopup="dialog"
        >
          <Search className="size-4" strokeWidth={1.75} />
          <span className="hidden text-[12.5px] font-medium tracking-[-0.01em] md:inline">
            Search
          </span>
          <kbd className="ml-0.5 hidden rounded-md border border-[var(--border)] bg-white px-1.5 py-0.5 font-sans text-[10.5px] text-[var(--muted-soft)] md:inline">
            ⌘K
          </kbd>
        </button>

        <button
          ref={notifyTriggerRef}
          type="button"
          onClick={toggleNotifications}
          className={[
            "relative inline-flex size-9 items-center justify-center rounded-xl text-[var(--muted)]",
            "transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            notificationsOpen ? "bg-[var(--surface-muted)] text-[var(--ink)]" : "",
          ].join(" ")}
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
        >
          <Bell className="size-4" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        <button
          ref={userTriggerRef}
          type="button"
          onClick={toggleUserMenu}
          className={[
            "inline-flex size-9 items-center justify-center rounded-xl",
            "transition-colors hover:bg-[var(--surface-muted)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            userMenuOpen ? "bg-[var(--surface-muted)]" : "",
          ].join(" ")}
          aria-label="Account menu"
          aria-expanded={userMenuOpen}
          aria-haspopup="dialog"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-[var(--ink)] text-[11px] font-semibold text-white">
            {initials(user?.name || "User", user?.email || "")}
          </span>
        </button>
      </div>

      <SearchPopover
        open={searchOpen}
        onClose={closeSearch}
        triggerRef={searchTriggerRef}
      />
      <NotificationsPopover
        open={notificationsOpen}
        onClose={closeNotifications}
        triggerRef={notifyTriggerRef}
      />
      <ProfilePopover
        open={userMenuOpen}
        onClose={closeUserMenu}
        triggerRef={userTriggerRef}
      />
    </header>
  );
}
