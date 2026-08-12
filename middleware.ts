import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_FLAG = "ocr_has_session";

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

function isPublicSharePath(pathname: string): boolean {
  return pathname === "/s" || pathname.startsWith("/s/");
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (isPublicSharePath(pathname)) return false;
  return (
    pathname === "/documents" ||
    pathname.startsWith("/documents/") ||
    pathname === "/review" ||
    pathname.startsWith("/review/") ||
    pathname === "/users" ||
    pathname.startsWith("/users/")
  );
}

/**
 * Auth routing before HTML paints:
 * - no session -> /login (never flash the dashboard shell)
 * - session on / or /login -> /documents
 * - /s/{token} is public (page validates token; invalid → login)
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.get(SESSION_FLAG)?.value === "1";

  if (pathname === "/") {
    const dest = hasSession ? "/documents" : "/login";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (isPublicSharePath(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !hasSession) {
    const login = new URL("/login", request.url);
    const next = pathname + (request.nextUrl.search || "");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  if (isLoginPath(pathname) && hasSession) {
    const next = request.nextUrl.searchParams.get("next");
    const dest =
      next && next.startsWith("/") && !next.startsWith("//")
        ? next
        : "/documents";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/login/:path*",
    "/documents/:path*",
    "/review/:path*",
    "/users/:path*",
    "/documents",
    "/review",
    "/users",
    "/s",
    "/s/:path*",
  ],
};
