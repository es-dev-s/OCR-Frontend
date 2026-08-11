import { getAuthToken } from "@/lib/auth-token";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

type CachedURL = {
  url: string;
  /** Epoch ms when we should stop using this URL. */
  expiresAt: number;
  direct: boolean;
};

const cache = new Map<string, CachedURL>();
const inflight = new Map<string, Promise<string>>();

/** Keep a safety margin so we never hand the browser an almost-expired URL. */
const SKEW_MS = 60_000;

function authHeaders(): HeadersInit {
  const headers = new Headers();
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/**
 * Resolve a ready-to-open document URL.
 *
 * Prefers a short-lived R2 presign (browser talks to object storage directly).
 * Results are cached until near expiry so Open / expand feel instant after the
 * first resolve — Netflix-style: mint once, stream from the edge.
 */
export async function resolveContentURL(
  fileId: string,
  opts?: { signal?: AbortSignal; force?: boolean },
): Promise<string> {
  if (!opts?.force) {
    const hit = cache.get(fileId);
    if (hit && hit.expiresAt > Date.now() + SKEW_MS) {
      return hit.url;
    }
  }

  const existing = inflight.get(fileId);
  if (existing && !opts?.force) return existing;

  const work = (async () => {
    const res = await fetch(`${API_URL}/api/files/${fileId}/content-url`, {
      headers: authHeaders(),
      cache: "no-store",
      signal: opts?.signal,
    });
    if (!res.ok) {
      throw new Error(`content-url failed (${res.status})`);
    }
    const body = (await res.json()) as {
      url?: string;
      expires_in?: number;
      direct?: boolean;
    };
    if (!body.url) throw new Error("content-url missing url");
    const ttlSec = Math.max(30, Number(body.expires_in) || 60);
    cache.set(fileId, {
      url: body.url,
      expiresAt: Date.now() + ttlSec * 1000,
      direct: body.direct !== false,
    });
    return body.url;
  })();

  inflight.set(fileId, work);
  try {
    return await work;
  } finally {
    inflight.delete(fileId);
  }
}

/** Warm the cache on hover / expand so a later click opens immediately. */
export function prefetchContentURL(fileId: string): void {
  if (!fileId || fileId.startsWith("tmp-") || fileId.startsWith("pending-")) {
    return;
  }
  const hit = cache.get(fileId);
  if (hit && hit.expiresAt > Date.now() + SKEW_MS) return;
  void resolveContentURL(fileId).catch(() => {
    /* prefetch is best-effort */
  });
}

export function invalidateContentURL(fileId: string): void {
  cache.delete(fileId);
}

/** Open the document in a new tab, using a cached direct URL when available. */
export async function openFileFast(fileId: string): Promise<void> {
  try {
    const url = await resolveContentURL(fileId);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // Fall back to the authenticated proxy route.
    const token = getAuthToken();
    const u = new URL(`${API_URL}/api/files/${fileId}/content`);
    if (token) u.searchParams.set("access_token", token);
    window.open(u.toString(), "_blank", "noopener,noreferrer");
  }
}
