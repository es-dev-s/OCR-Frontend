/** Types + client helpers for the PDF Extract title API (via Next.js proxy). */

export type TitlePagesChecked = {
  page: number;
  is_empty: boolean;
  title: string | null;
  confidence: number;
  source: string;
  char_count: number;
};

export type TitleResponse = {
  ok: boolean;
  request_id?: string;
  filename?: string;
  document_title: string | null;
  document_title_source?: string;
  document_title_confidence?: number;
  document_title_page?: number | null;
  pages_scanned_for_title?: number;
  title_pages_checked?: TitlePagesChecked[];
  page_count?: number;
  is_encrypted?: boolean;
  metadata?: Record<string, string>;
  elapsed_ms?: number;
  error?: string;
};

const TITLE_MAX = 200;

/** Normalize API title for the intake form (trim, collapse space, cap length). */
export function normalizeDetectedTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
}

/**
 * Detect document title via Next.js `/api/pdf/title` → PDF Extract API.
 * Returns "" on failure so callers can fall back without breaking the form.
 */
export async function detectPdfTitle(
  file: File,
  opts?: { signal?: AbortSignal },
): Promise<{ title: string; fromApi: boolean; error?: string }> {
  const looksPdf =
    Boolean(file) &&
    (file.type === "application/pdf" ||
      file.type === "" ||
      /\.pdf$/i.test(file.name));
  if (!looksPdf) {
    return { title: "", fromApi: false, error: "not a pdf" };
  }

  const body = new FormData();
  body.append("file", file, file.name);

  try {
    const res = await fetch("/api/pdf/title", {
      method: "POST",
      body,
      signal: opts?.signal,
    });
    const data = (await res.json()) as TitleResponse;
    if (!res.ok || !data?.ok) {
      return {
        title: "",
        fromApi: false,
        error: data?.error || `title api ${res.status}`,
      };
    }
    const title = normalizeDetectedTitle(data.document_title);
    return { title, fromApi: Boolean(title) };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { title: "", fromApi: false, error: "aborted" };
    }
    return {
      title: "",
      fromApi: false,
      error: err instanceof Error ? err.message : "title detection failed",
    };
  }
}
