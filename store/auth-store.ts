"use client";

import { create } from "zustand";
import {
  clearAuthSession,
  getAuthToken,
  getCachedUser,
  setAuthToken,
  setCachedUser,
} from "@/lib/auth-token";
import {
  fetchMe,
  loginRequest,
  logoutRequest,
  type AuthUser,
} from "@/lib/api";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  /** True once local session has been read (sync). Never blocks login UI. */
  ready: boolean;
  /** True while a background /me revalidation is in flight. */
  validating: boolean;
  hydrate: () => void;
  revalidate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
};

function readLocalSession(): { token: string | null; user: AuthUser | null } {
  const token = getAuthToken();
  if (!token) return { token: null, user: null };
  return { token, user: getCachedUser() };
}

let revalidateSeq = 0;
let revalidateInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  ...(() => {
    if (typeof window === "undefined") {
      return { user: null, token: null, ready: true, validating: false };
    }
    const local = readLocalSession();
    return {
      user: local.user,
      token: local.token,
      ready: true,
      validating: Boolean(local.token && !local.user),
    };
  })(),

  setUser: (user) => {
    if (user) setCachedUser(user);
    set({ user });
  },

  hydrate: () => {
    const local = readLocalSession();
    set({
      token: local.token,
      user: local.user,
      ready: true,
      validating: Boolean(local.token && !local.user),
    });
    if (local.token) {
      void get().revalidate();
    }
  },

  revalidate: async () => {
    // Single-flight + generation guard — overlapping /me must not clear a good session.
    if (revalidateInFlight) return revalidateInFlight;

    const seq = ++revalidateSeq;
    const tokenAtStart = get().token ?? getAuthToken();
    if (!tokenAtStart) {
      set({ user: null, token: null, validating: false, ready: true });
      return;
    }

    set({ validating: Boolean(!get().user), ready: true });

    revalidateInFlight = (async () => {
      try {
        const { user } = await fetchMe();
        if (seq !== revalidateSeq) return;
        // Token changed (login/logout) while in flight — ignore.
        if ((get().token ?? getAuthToken()) !== tokenAtStart) return;
        setCachedUser(user);
        set({ user, token: tokenAtStart, validating: false, ready: true });
      } catch {
        if (seq !== revalidateSeq) return;
        if ((get().token ?? getAuthToken()) !== tokenAtStart) return;
        // Only clear when we still hold the same failed token.
        clearAuthSession();
        set({ user: null, token: null, validating: false, ready: true });
      } finally {
        if (seq === revalidateSeq) revalidateInFlight = null;
      }
    })();

    return revalidateInFlight;
  },

  login: async (email, password) => {
    revalidateSeq += 1; // invalidate any in-flight /me
    revalidateInFlight = null;
    const res = await loginRequest(email, password);
    setAuthToken(res.token);
    setCachedUser(res.user);
    set({
      token: res.token,
      user: res.user,
      ready: true,
      validating: false,
    });
  },

  logout: async () => {
    revalidateSeq += 1;
    revalidateInFlight = null;
    const token = get().token ?? getAuthToken();
    try {
      if (token) await logoutRequest();
    } catch {
      // Always clear locally.
    } finally {
      clearAuthSession();
      set({ user: null, token: null, ready: true, validating: false });
    }
  },
}));

export const selectAuthUser = (s: AuthState) => s.user;
export const selectAuthReady = (s: AuthState) => s.ready;
export const selectIsAdmin = (s: AuthState) => s.user?.role === "admin";
