"use client";

import { useLayoutEffect, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

const PUBLIC_PATHS = new Set(["/login"]);

function safeNextDest(): string {
  if (typeof window === "undefined") return "/documents";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/documents";
}

function MainSkeleton() {
  return <div className="auth-skeleton" aria-hidden />;
}

/**
 * Gates page content inside the persistent app chrome.
 * Never replaces the sidebar/navbar — only the main content area can show
 * loading states, so a hard reload does not “reload” the shell.
 *
 * Hydration runs in useLayoutEffect so a cached session paints content
 * before the browser’s first paint — no “Redirecting…” flash for signed-in users.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrate = useAuthStore((s) => s.hydrate);
  const validating = useAuthStore((s) => s.validating);

  const isPublic = PUBLIC_PATHS.has(pathname);

  useLayoutEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || isPublic) return;
    if (!user && !token) {
      const next = encodeURIComponent(pathname + (window.location.search || ""));
      router.replace(`/login?next=${next}`);
    }
  }, [ready, user, token, isPublic, pathname, router]);

  useEffect(() => {
    if (!ready || !isPublic || !user) return;
    router.replace(safeNextDest());
  }, [ready, isPublic, user, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  // SSR + first client frame share this skeleton (ready starts false).
  if (!ready) {
    return <MainSkeleton />;
  }

  // Cached user → paint page immediately (revalidate may still run quietly).
  if (user) {
    return <>{children}</>;
  }

  // Token without user yet, or anonymous redirect in flight.
  if (token && validating) {
    return <MainSkeleton />;
  }

  return <MainSkeleton />;
}
