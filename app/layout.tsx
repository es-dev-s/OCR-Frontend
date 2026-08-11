import type { Metadata } from "next";
import Script from "next/script";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OCR Engine",
    template: "%s · OCR Engine",
  },
  description: "Premium document intelligence workspace",
};

const sidebarBootScript = `
(function () {
  try {
    var raw = localStorage.getItem("ocr-engine-ui");
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (parsed && parsed.state && parsed.state.sidebarCollapsed) {
      document.documentElement.style.setProperty(
        "--sidebar-current",
        "var(--sidebar-collapsed)"
      );
      document.documentElement.dataset.sidebarCollapsed = "true";
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <Script id="sidebar-boot" strategy="beforeInteractive">
          {sidebarBootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
