import type { FileRecord } from "@/lib/api";

const CACHE_KEY = "ocr-docs-list-v1";
const MAX_AGE_MS = 5 * 60 * 1000;

export type DocsListCache = {
  files: FileRecord[];
  total: number;
  has_more: boolean;
  q: string;
  savedAt: number;
};

export function readDocsListCache(q = ""): DocsListCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DocsListCache;
    if (!parsed || !Array.isArray(parsed.files)) return null;
    if ((parsed.q || "") !== (q || "")) return null;
    if (Date.now() - (parsed.savedAt || 0) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDocsListCache(cache: Omit<DocsListCache, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload: DocsListCache = { ...cache, savedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearDocsListCache() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}
