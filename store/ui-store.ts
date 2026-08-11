"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-pref";

export { SIDEBAR_COLLAPSED_COOKIE };

/**
 * Isolated UI surface state.
 * Each surface owns its own fields + actions so one interaction
 * cannot accidentally mutate unrelated chrome.
 */
type SidebarSlice = {
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  openMobileSidebar: () => void;
  closeMobileSidebar: () => void;
};

type NavbarSlice = {
  searchOpen: boolean;
  userMenuOpen: boolean;
  notificationsOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  openUserMenu: () => void;
  closeUserMenu: () => void;
  toggleUserMenu: () => void;
  openNotifications: () => void;
  closeNotifications: () => void;
  toggleNotifications: () => void;
  /** Close popovers only — never touches sidebar geometry. */
  closeNavbarOverlays: () => void;
};

type HydrationSlice = {
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
};

export type UIStore = SidebarSlice & NavbarSlice & HydrationSlice;

function writeSidebarCookie(collapsed: boolean) {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 400; // ~13 months
  document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Sync read so hard reload matches boot-script / SSR CSS (no shell width flash). */
export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const fromDom = document.documentElement.dataset.sidebarCollapsed;
    if (fromDom === "true") return true;
    if (fromDom === "false") return false;
    const raw = localStorage.getItem("ocr-engine-ui");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      state?: { sidebarCollapsed?: boolean };
    };
    return Boolean(parsed?.state?.sidebarCollapsed);
  } catch {
    return false;
  }
}

export function syncSidebarDom(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sidebarCollapsed = collapsed
    ? "true"
    : "false";
  document.documentElement.style.setProperty(
    "--sidebar-current",
    collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
  );
  writeSidebarCookie(collapsed);
}

export function markSidebarReady() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sidebarReady = "true";
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Always false on SSR so server HTML is stable. Client syncs in
      // AppShell useLayoutEffect from boot script / localStorage before paint.
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      toggleSidebar: () => {
        const next = !get().sidebarCollapsed;
        set({ sidebarCollapsed: next });
        syncSidebarDom(next);
      },
      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
        syncSidebarDom(collapsed);
      },
      openMobileSidebar: () => set({ mobileSidebarOpen: true }),
      closeMobileSidebar: () => set({ mobileSidebarOpen: false }),

      // Navbar overlays — mutually exclusive among themselves only
      searchOpen: false,
      userMenuOpen: false,
      notificationsOpen: false,
      openSearch: () =>
        set({
          searchOpen: true,
          userMenuOpen: false,
          notificationsOpen: false,
        }),
      closeSearch: () => set({ searchOpen: false }),
      toggleSearch: () => {
        const next = !get().searchOpen;
        set({
          searchOpen: next,
          ...(next
            ? { userMenuOpen: false, notificationsOpen: false }
            : {}),
        });
      },
      openUserMenu: () =>
        set({
          userMenuOpen: true,
          searchOpen: false,
          notificationsOpen: false,
        }),
      closeUserMenu: () => set({ userMenuOpen: false }),
      toggleUserMenu: () => {
        const next = !get().userMenuOpen;
        set({
          userMenuOpen: next,
          ...(next
            ? { searchOpen: false, notificationsOpen: false }
            : {}),
        });
      },
      openNotifications: () =>
        set({
          notificationsOpen: true,
          searchOpen: false,
          userMenuOpen: false,
        }),
      closeNotifications: () => set({ notificationsOpen: false }),
      toggleNotifications: () => {
        const next = !get().notificationsOpen;
        set({
          notificationsOpen: next,
          ...(next ? { searchOpen: false, userMenuOpen: false } : {}),
        });
      },
      closeNavbarOverlays: () =>
        set({
          searchOpen: false,
          userMenuOpen: false,
          notificationsOpen: false,
        }),

      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "ocr-engine-ui",
      storage: createJSONStorage(() => localStorage),
      // Persist layout preference only — never ephemeral overlays
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      // Manual rehydrate after layout sync so boot CSS wins first paint
      skipHydration: true,
    },
  ),
);

/** Narrow selectors — components re-render only for their surface. */
export const selectSidebarCollapsed = (s: UIStore) => s.sidebarCollapsed;
export const selectMobileSidebarOpen = (s: UIStore) => s.mobileSidebarOpen;
export const selectSearchOpen = (s: UIStore) => s.searchOpen;
export const selectUserMenuOpen = (s: UIStore) => s.userMenuOpen;
export const selectNotificationsOpen = (s: UIStore) => s.notificationsOpen;
export const selectHasHydrated = (s: UIStore) => s.hasHydrated;
