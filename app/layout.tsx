import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-pref";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "optional",
  adjustFontFallback: true,
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: {
    default: "OCR Engine",
    template: "%s · OCR Engine",
  },
  description: "Premium document intelligence workspace",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs before first paint. Migrates localStorage → cookie when needed, and
 * re-applies collapsed width if hydration would otherwise flash expanded.
 */
const sidebarBootScript = `
(function () {
  try {
    var COOKIE = "ocr-sidebar-collapsed";
    function readCookie() {
      var m = document.cookie.match(/(?:^|; )ocr-sidebar-collapsed=([^;]*)/);
      return m ? m[1] : "";
    }
    function writeCookie(collapsed) {
      document.cookie =
        COOKIE +
        "=" +
        (collapsed ? "1" : "0") +
        "; path=/; max-age=34560000; SameSite=Lax";
    }
    function apply(collapsed) {
      document.documentElement.style.setProperty(
        "--sidebar-current",
        collapsed ? "var(--sidebar-collapsed)" : "var(--sidebar-expanded)"
      );
      document.documentElement.dataset.sidebarCollapsed = collapsed
        ? "true"
        : "false";
    }

    var collapsed = false;
    var fromCookie = readCookie();
    if (fromCookie === "1" || fromCookie === "0") {
      collapsed = fromCookie === "1";
    } else {
      var raw = localStorage.getItem("ocr-engine-ui");
      if (raw) {
        var parsed = JSON.parse(raw);
        collapsed = !!(parsed && parsed.state && parsed.state.sidebarCollapsed);
      }
      writeCookie(collapsed);
    }
    apply(collapsed);
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const collapsed = jar.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
  const sidebarStyle = {
    "--sidebar-current": collapsed
      ? "var(--sidebar-collapsed)"
      : "var(--sidebar-expanded)",
  } as CSSProperties;

  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      style={sidebarStyle}
      suppressHydrationWarning
    >
      <head>
        <script
          id="sidebar-boot"
          dangerouslySetInnerHTML={{ __html: sidebarBootScript }}
        />
      </head>
      <body className="min-h-full font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
