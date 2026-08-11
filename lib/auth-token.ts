import type { AuthUser } from "@/lib/api";
import { SESSION_FLAG_COOKIE } from "@/lib/auth-session";

const TOKEN_KEY = "ocr_session_token";
const USER_KEY = "ocr_session_user";
export { SESSION_FLAG_COOKIE };

/** Presence cookie for Next middleware (not the bearer token). */
function writeSessionFlag(on: boolean) {
  if (typeof document === "undefined") return;
  if (on) {
    document.cookie = `${SESSION_FLAG_COOKIE}=1; path=/; max-age=604800; SameSite=Lax`;
  } else {
    document.cookie = `${SESSION_FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore quota / private mode
  }
  writeSessionFlag(true);
}

export function getCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as AuthUser;
    if (!user?.id || !user?.email || !user?.role) return null;
    return user;
  } catch {
    return null;
  }
}

export function setCachedUser(user: AuthUser): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
  writeSessionFlag(true);
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
  writeSessionFlag(false);
}

/** Keep middleware cookie aligned with sessionStorage (call on hydrate). */
export function syncSessionCookie(): void {
  writeSessionFlag(Boolean(getAuthToken()));
}

/** @deprecated use clearAuthSession */
export function clearAuthToken(): void {
  clearAuthSession();
}
