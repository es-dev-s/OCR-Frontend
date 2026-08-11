"use client";

import { AuthGate } from "@/components/auth/AuthGate";

/** Login stays outside the app chrome; AuthGate only handles signed-in redirects. */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGate>{children}</AuthGate>;
}
