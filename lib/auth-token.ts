import type { AuthUser } from "@/lib/api";

const TOKEN_KEY = "ocr_session_token";
const USER_KEY = "ocr_session_user";

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
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

/** @deprecated use clearAuthSession */
export function clearAuthToken(): void {
  clearAuthSession();
}
