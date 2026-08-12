"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { AuthGate } from "@/components/auth/AuthGate";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import {
  markSidebarReady,
  readSidebarCollapsed,
  selectHasHydrated,
  selectMobileSidebarOpen,
  selectSidebarCollapsed,
  syncSidebarDom,
  useUIStore,
} from "@/store/ui-store";
import {
  selectAuthReady,
  selectAuthUser,
  useAuthStore,
} from "@/store/auth-store";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Persistent app chrome (sidebar + navbar + realtime).
 * Mounted by the (app) route-group layout so client navigations never remount
 * the shell — only `<main>` page content swaps. Notifications stay live via
 * RealtimeProvider (SSE), which is tied to the session, not the route.
 */
export function AppShell({ children }: AppShellProps) {
  const collapsed = useUIStore(selectSidebarCollapsed);
  const mobileOpen = useUIStore(selectMobileSidebarOpen);
  const hasHydrated = useUIStore(selectHasHydrated);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
  const setHasHydrated = useUIStore((s) => s.setHasHydrated);

  const authReady = useAuthStore(selectAuthReady);
  const user = useAuthStore(selectAuthUser);
  const token = useAuthStore((s) => s.token);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  // Once chrome has been shown for a session, keep it mounted across route
  // changes (and brief auth revalidations) so sidebar/navbar don't remount.
  const [chromeLive, setChromeLive] = useState(false);
  const showChrome = authReady && Boolean(user || token);

  useLayoutEffect(() => {
    hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (showChrome) {
      setChromeLive(true);
      return;
    }
    if (authReady && !user && !token) {
      setChromeLive(false);
    }
  }, [showChrome, authReady, user, token]);

  // Before paint: align Zustand with boot script / localStorage so hard reload
  // never flashes the opposite sidebar width.
  useLayoutEffect(() => {
    const preferred = readSidebarCollapsed();
    useUIStore.setState({ sidebarCollapsed: preferred });
    syncSidebarDom(preferred);

    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      const next = useUIStore.getState().sidebarCollapsed;
      syncSidebarDom(next);
      setHasHydrated(true);
      markSidebarReady();
    };

    void Promise.resolve(useUIStore.persist.rehydrate()).then(finish, finish);

    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!hasHydrated) return;
    syncSidebarDom(collapsed);
  }, [collapsed, hasHydrated]);

  // Neutral canvas while auth resolves — never paint chrome for guests.
  if (!chromeLive) {
    return (
      <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
        <AuthGate>{children}</AuthGate>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      {/* Static chrome — stays mounted while navigating /documents ↔ /review ↔ /users */}
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

      <div className="shell-main flex h-dvh flex-col lg:pl-[var(--sidebar-current)]">
        <Navbar />
        {/* Session-scoped SSE — not tied to the active page */}
        <RealtimeProvider />
        <main className="relative min-h-0 flex-1 overflow-hidden bg-[var(--surface)]">
          <AuthGate>{children}</AuthGate>
        </main>
      </div>
    </div>
  );
}
