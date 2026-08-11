"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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

/** Sync read so hard reload matches boot-script CSS (no shell width flash). */
function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
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

function syncSidebarDom(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.sidebarCollapsed = collapsed
    ? "true"
    : "false";
  document.documentElement.style.setProperty(
    "--sidebar-current",
    collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
  );
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Sidebar — layout geometry only (seeded from localStorage on client)
      sidebarCollapsed: readSidebarCollapsed(),
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
      // Manual rehydrate after mount so boot-script CSS wins on first paint
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
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
