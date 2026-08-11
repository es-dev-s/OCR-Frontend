"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

const PUBLIC_PATHS = new Set(["/login"]);

function safeNextDest(): string {
  if (typeof window === "undefined") return "/documents";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/documents";
}

/**
 * Gates page content inside the persistent app chrome.
 * Never replaces the sidebar/navbar — only the main content area can show
 * redirect/loading states, so a hard reload does not “reload” the shell.
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

  useEffect(() => {
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

  // Anonymous — chrome stays mounted; only main shows redirect.
  if (!user && !token) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)] text-[13px] text-[var(--muted)]">
        Redirecting…
      </div>
    );
  }

  // Token without cached user yet: keep chrome, show light main placeholder.
  if (!user && validating) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)] text-[13px] text-[var(--muted)]">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--surface)] text-[13px] text-[var(--muted)]">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}
