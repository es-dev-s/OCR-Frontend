import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared document",
  description: "Public view of a shared OCR Engine document",
  robots: { index: false, follow: false },
};

/** Public share surface — no app chrome, no AuthGate. */
export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
