import { AppShell } from "@/components/layout/AppShell";

/**
 * Authenticated workspace chrome. Kept static (no cookies()/headers()) so
 * Next.js does not dynamically re-render this layout on every navigation —
 * AppShell stays mounted and only the page segment inside <main> swaps.
 */
export default function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
