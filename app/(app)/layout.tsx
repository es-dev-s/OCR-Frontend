import { AppShell } from "@/components/layout/AppShell";

/**
 * Authenticated workspace chrome. This layout stays mounted across
 * /documents, /review, /users — only the page segment inside <main> changes.
 */
export default function AppWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
