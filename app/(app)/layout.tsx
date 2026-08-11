import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-pref";

/**
 * Authenticated workspace chrome. This layout stays mounted across
 * /documents, /review, /users — only the page segment inside <main> changes.
 */
export default async function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const initialSidebarCollapsed =
    jar.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";

  return (
    <AppShell initialSidebarCollapsed={initialSidebarCollapsed}>
      {children}
    </AppShell>
  );
}
