"use client";

import { useEffect } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import {
  selectMobileSidebarOpen,
  selectSidebarCollapsed,
  useUIStore,
} from "@/store/ui-store";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Persistent app chrome (sidebar + navbar). Mounted by the (app) route-group
 * layout so client navigations never remount it — only `<main>` page content swaps.
 */
export function AppShell({ children }: AppShellProps) {
  const collapsed = useUIStore(selectSidebarCollapsed);
  const mobileOpen = useUIStore(selectMobileSidebarOpen);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
  const setHasHydrated = useUIStore((s) => s.setHasHydrated);

  useEffect(() => {
    // Keep DOM CSS vars aligned with persisted preference (boot script already set them).
    const bootCollapsed =
      document.documentElement.dataset.sidebarCollapsed === "true";
    if (bootCollapsed && !useUIStore.getState().sidebarCollapsed) {
      useUIStore.setState({ sidebarCollapsed: true });
    }
    void useUIStore.persist.rehydrate();
    setHasHydrated(true);
  }, [setHasHydrated]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileSidebar();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, closeMobileSidebar]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) closeMobileSidebar();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [closeMobileSidebar]);

  // Keep document-level vars in sync so hard reloads and nested layouts match.
  useEffect(() => {
    document.documentElement.dataset.sidebarCollapsed = collapsed
      ? "true"
      : "false";
    document.documentElement.style.setProperty(
      "--sidebar-current",
      collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)",
    );
  }, [collapsed]);

  const sidebarWidth = collapsed
    ? "var(--sidebar-collapsed)"
    : "var(--sidebar-expanded)";

  return (
    <div
      className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]"
      style={{ "--sidebar-current": sidebarWidth } as React.CSSProperties}
    >
      <div className="hidden lg:block">
        <Sidebar variant="desktop" />
      </div>

      <div
        className={[
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        ].join(" ")}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen || undefined}
      >
        <button
          type="button"
          className={[
            "absolute inset-0 bg-[rgba(15,23,32,0.28)] backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none",
            mobileOpen ? "opacity-100" : "opacity-0",
          ].join(" ")}
          aria-label="Close navigation overlay"
          onClick={closeMobileSidebar}
          tabIndex={mobileOpen ? 0 : -1}
        />
        <div
          className={[
            "absolute inset-y-0 left-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <Sidebar variant="mobile" />
        </div>
      </div>

      <div className="flex h-dvh flex-col lg:pl-[var(--sidebar-current)]">
        <Navbar />
        <RealtimeProvider />
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface)]">
          <AuthGate>{children}</AuthGate>
        </main>
      </div>
    </div>
  );
}
