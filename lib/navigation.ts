import { FileText, ShieldQuestion, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
  },
  {
    label: "Review",
    href: "/review",
    icon: ShieldQuestion,
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
    adminOnly: true,
  },
];

export function navItemsForRole(role?: string | null): NavItem[] {
  const isAdmin = role === "admin";
  return PRIMARY_NAV.filter((item) => !item.adminOnly || isAdmin);
}

export function getPageTitle(pathname: string): string {
  const match = PRIMARY_NAV.find(
    (item) =>
      pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? "OCR Engine";
}
