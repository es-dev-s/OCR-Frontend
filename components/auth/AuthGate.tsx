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
 * Redirects run in useLayoutEffect (before paint) so guests never see the
 * dashboard shell flash before /login.
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

  // Before paint: bounce anonymous users off protected routes.
  useLayoutEffect(() => {
    if (!ready || isPublic) return;
    if (!user && !token) {
      const next = encodeURIComponent(pathname + (window.location.search || ""));
      router.replace(`/login?next=${next}`);
    }
  }, [ready, user, token, isPublic, pathname, router]);

  // Signed-in users on /login → workspace (also covered by middleware cookie).
  useLayoutEffect(() => {
    if (!ready || !isPublic || !user) return;
    router.replace(safeNextDest());
  }, [ready, isPublic, user, router]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (!ready) {
    return <MainSkeleton />;
  }

  if (user) {
    return <>{children}</>;
  }

  if (token && validating) {
    return <MainSkeleton />;
  }

  return <MainSkeleton />;
}
