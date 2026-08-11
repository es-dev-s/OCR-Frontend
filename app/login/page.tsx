"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ScanText } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

function postLoginDestination(): string {
  if (typeof window === "undefined") return "/documents";
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/documents";
}

function friendlyLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return "Too many attempts. Please wait a moment and try again.";
    }
    if (err.status === 401 || /invalid email or password/i.test(err.message)) {
      return "Email or password is incorrect.";
    }
    if (err.status >= 500 || /unavailable/i.test(err.message)) {
      return "Sign-in is temporarily unavailable. Try again shortly.";
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not sign in. Check your details and try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const emailId = useId();
  const passwordId = useId();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmed, password);
      // Navigate immediately — avoid AuthGate "Redirecting…" splash.
      router.replace(postLoginDestination());
    } catch (err) {
      setError(friendlyLoginError(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--canvas)] px-5 py-10">
      {/* Soft atmosphere — no clutter */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%), radial-gradient(ellipse 45% 35% at 85% 110%, color-mix(in srgb, var(--ink) 4%, transparent), transparent 55%)",
        }}
      />

      <div
        className="relative w-full max-w-[360px]"
        style={{ animation: "fadeRise 420ms ease-out both" }}
      >
        {/* Brand first */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-[14px] bg-[var(--ink)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
            <ScanText className="size-[22px]" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--ink)]">
            OCR Engine
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
            Sign in with your work email
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor={emailId}
              className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.01em] text-[var(--ink)]"
            >
              Email
            </label>
            <input
              ref={emailRef}
              id={emailId}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              spellCheck={false}
              required
              value={email}
              disabled={submitting}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="name@company.com"
              className={[
                "h-12 w-full rounded-[12px] border bg-[var(--surface)] px-3.5 text-[15px] text-[var(--ink)]",
                "placeholder:text-[var(--muted-soft)]",
                "outline-none transition-[border-color,box-shadow] duration-200",
                "focus:border-[var(--ink)]/25 focus:ring-[3px] focus:ring-[var(--ring)]",
                "disabled:opacity-60",
                error
                  ? "border-red-300"
                  : "border-[var(--border-strong)]",
              ].join(" ")}
            />
          </div>

          <div>
            <label
              htmlFor={passwordId}
              className="mb-1.5 block text-[12.5px] font-medium tracking-[-0.01em] text-[var(--ink)]"
            >
              Password
            </label>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                disabled={submitting}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter your password"
                className={[
                  "h-12 w-full rounded-[12px] border bg-[var(--surface)] py-0 pl-3.5 pr-11 text-[15px] text-[var(--ink)]",
                  "placeholder:text-[var(--muted-soft)]",
                  "outline-none transition-[border-color,box-shadow] duration-200",
                  "focus:border-[var(--ink)]/25 focus:ring-[3px] focus:ring-[var(--ring)]",
                  "disabled:opacity-60",
                  error
                    ? "border-red-300"
                    : "border-[var(--border-strong)]",
                ].join(" ")}
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={submitting}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                {showPassword ? (
                  <EyeOff className="size-4" strokeWidth={1.75} />
                ) : (
                  <Eye className="size-4" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="text-[13px] leading-snug text-red-600"
              style={{ animation: "fadeRise 220ms ease-out both" }}
            >
              {error}
            </p>
          ) : (
            <p className="text-[12.5px] leading-snug text-[var(--muted-soft)]">
              Accounts are created by an admin — use the credentials you were
              given.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={[
              "mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px]",
              "bg-[var(--ink)] text-[15px] font-semibold tracking-[-0.01em] text-white",
              "transition-[opacity,transform] duration-200",
              "hover:opacity-[0.92] active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
              "disabled:pointer-events-none disabled:opacity-55",
            ].join(" ")}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
