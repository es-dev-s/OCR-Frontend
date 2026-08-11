"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ScanText } from "lucide-react";
import { navItemsForRole } from "@/lib/navigation";
import {
  selectHasHydrated,
  selectSidebarCollapsed,
  useUIStore,
} from "@/store/ui-store";
import { selectAuthUser, useAuthStore } from "@/store/auth-store";

type SidebarProps = {
  variant?: "desktop" | "mobile";
};

/**
 * Premium sidebar geometry:
 * - One vertical icon axis from logo → nav → footer (never re-centers on collapse)
 * - Labels reveal to the right; icons keep the same left offset in both states
 * - Collapse/expand control appears on the logo mark on hover
 * - Width transition only after hydrate so hard reloads do not animate the shell
 */
export function Sidebar({ variant = "desktop" }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useUIStore(selectSidebarCollapsed);
  const hasHydrated = useUIStore(selectHasHydrated);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const closeMobileSidebar = useUIStore((s) => s.closeMobileSidebar);
  const user = useAuthStore(selectAuthUser);
  const navItems = navItemsForRole(user?.role);

  const isMobile = variant === "mobile";
  const isCollapsed = isMobile ? false : collapsed;

  return (
    <aside
      className={[
        "group/sidebar flex h-full flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface)]",
        isMobile
          ? "h-dvh w-[var(--sidebar-expanded)] shadow-[var(--shadow-elevated)]"
          : [
              "fixed inset-y-0 left-0 z-40 w-[var(--sidebar-current)]",
              hasHydrated
                ? "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                : "",
            ].join(" "),
      ].join(" ")}
      data-collapsed={isCollapsed ? "true" : "false"}
      aria-label="Primary"
    >
      {/* Brand row: [logo] [name········] [toggle at trailing edge] */}
      <div className="flex h-[var(--navbar-height)] shrink-0 items-center border-b border-[var(--border)] px-[var(--sidebar-inset)]">
        <div className="flex w-full items-center gap-2.5">
          {/* Collapsed: hover logo → same-size expand control */}
          <div className="group/logo relative size-10 shrink-0">
            <Link
              href="/documents"
              onClick={isMobile ? closeMobileSidebar : undefined}
              className={[
                "flex size-10 items-center justify-center rounded-[12px] bg-[var(--ink)] text-white",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] outline-none",
                "transition-opacity duration-200",
                "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                !isMobile && isCollapsed
                  ? "group-hover/logo:pointer-events-none group-hover/logo:opacity-0"
                  : "",
              ].join(" ")}
              aria-label="OCR Engine home"
            >
              <ScanText className="size-[18px]" strokeWidth={1.75} aria-hidden />
            </Link>

            {!isMobile && isCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                className={[
                  "absolute inset-0 z-10 flex size-10 items-center justify-center rounded-[12px]",
                  "bg-[var(--surface-muted)] text-[var(--ink)]",
                  "opacity-0 pointer-events-none transition-opacity duration-200",
                  "group-hover/logo:pointer-events-auto group-hover/logo:opacity-100",
                  "focus-visible:pointer-events-auto focus-visible:opacity-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                ].join(" ")}
                aria-label="Expand sidebar"
                aria-expanded={false}
              >
                <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div
            className={[
              "min-w-0 flex-1 overflow-hidden transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isCollapsed
                ? "pointer-events-none w-0 translate-x-1 opacity-0"
                : "translate-x-0 opacity-100",
            ].join(" ")}
            aria-hidden={isCollapsed}
          >
            <p className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              OCR Engine
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">Document AI</p>
          </div>

          {/* Expanded: minimal toggle flush to the trailing edge of the row */}
          {!isMobile && !isCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className={[
                "ml-auto flex size-10 shrink-0 items-center justify-center rounded-[12px]",
                "text-[var(--muted)] transition-colors duration-200",
                "hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              ].join(" ")}
              aria-label="Collapse sidebar"
              aria-expanded
            >
              <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Nav — fixed icon column; labels occupy overflow space to the right */}
      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-[var(--sidebar-inset)] py-3"
        aria-label="Main"
      >
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={isMobile ? closeMobileSidebar : undefined}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={[
                "group/nav relative flex h-10 w-full items-center rounded-[12px]",
                "transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                active
                  ? "bg-[var(--surface-muted)] text-[var(--ink)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-muted)]/80 hover:text-[var(--ink)]",
              ].join(" ")}
            >
              {/* Active accent bar — only in expanded for polish; icon-only uses fill */}
              {active && !isCollapsed && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-[var(--ink)]"
                  aria-hidden
                />
              )}

              <span className="relative flex size-10 shrink-0 items-center justify-center">
                <Icon
                  className={[
                    "size-[18px] transition-colors duration-200",
                    active
                      ? "text-[var(--ink)]"
                      : "text-[var(--muted-soft)] group-hover/nav:text-[var(--ink)]",
                  ].join(" ")}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>

              <span
                className={[
                  "truncate pr-3 text-[13.5px] font-medium tracking-[-0.01em]",
                  "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  isCollapsed
                    ? "pointer-events-none w-0 translate-x-1 opacity-0"
                    : "flex-1 translate-x-0 opacity-100",
                ].join(" ")}
              >
                {item.label}
              </span>

              {/* Collapsed tooltip */}
              {isCollapsed && (
                <span
                  className={[
                    "pointer-events-none absolute left-[calc(100%+0.65rem)] top-1/2 z-50 -translate-y-1/2",
                    "whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-[12px] font-medium text-white",
                    "opacity-0 shadow-[var(--shadow-elevated)] transition-opacity duration-150",
                    "group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100",
                  ].join(" ")}
                  role="tooltip"
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer — same icon axis as logo/nav */}
      <div className="mt-auto shrink-0 border-t border-[var(--border)] px-[var(--sidebar-inset)] py-3">
        <div
          className={[
            "flex h-10 items-center rounded-[12px]",
            isCollapsed ? "" : "bg-[var(--surface-muted)] pr-3",
          ].join(" ")}
        >
          <span className="flex size-10 shrink-0 items-center justify-center">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--ink)] text-[10.5px] font-semibold tracking-wide text-white">
              PE
            </span>
          </span>
          <div
            className={[
              "min-w-0 overflow-hidden transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isCollapsed
                ? "pointer-events-none w-0 translate-x-1 opacity-0"
                : "flex-1 translate-x-0 opacity-100",
            ].join(" ")}
            aria-hidden={isCollapsed}
          >
            <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--ink)]">
              Pro Edition
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">Workspace ready</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
