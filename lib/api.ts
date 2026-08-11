import { clearAuthSession, getAuthToken } from "@/lib/auth-token";
import {
  appendSourcesToFormData,
  SOURCE_SLOTS,
  type DocumentSourcesInput,
  type SourceSlotNum,
} from "@/lib/sources";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type { DocumentSourcesInput, SourceSlotNum };

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
};

export type LoginResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

export type DocumentMetaInput = {
  title?: string;
  client_name: string;
  erp_code: string;
  anzsco?: string;
  team: string;
  member: string;
};

export type DocumentSource = {
  id: string;
  file_id: string;
  slot: SourceSlotNum | number;
  label: string;
  original_filename: string;
  byte_size: number;
  sha256_hash: string;
  created_at: string;
  match_status: "pending" | "processing" | "completed" | "failed" | "skipped_no_text" | string;
  similarity?: number | null;
  confidence_percent?: number | null;
  match_tier?: number | null;
  decision?: string | null;
  decision_label?: string | null;
  decision_detail?: string | null;
  matched_at?: string | null;
};

export type DuplicateRecord = {
  id: string;
  title?: string;
  original_filename: string;
  client_name?: string;
  erp_code?: string;
  anzsco?: string;
  team?: string;
  member?: string;
  byte_size: number;
  sha256_hash: string;
  match_tier: number;
  similarity: number;
  confidence_percent: number;
  source: "upload" | "file";
  created_at: string;
  open_file_id: string;
  review_status?: string;
  uploader_name?: string;
};

/** A member's duplicate upload parked for admin review. */
export type ReviewItem = {
  id: string;
  title: string;
  original_filename: string;
  client_name: string;
  erp_code: string;
  anzsco: string;
  team: string;
  member: string;
  byte_size: number;
  created_at: string;
  review_status: "prompt" | "requested" | "approved" | string;
  uploaded_by?: string;
  uploader_name?: string;
  original_file_id: string;
  original_title: string;
  reviewed_by_name?: string;
  reviewed_at?: string | null;
};

export type FileRecord = {
  id: string;
  title: string;
  original_filename: string;
  client_name: string;
  erp_code: string;
  anzsco: string;
  team: string;
  member: string;
  storage_path: string;
  byte_size: number;
  sha256_hash: string;
  status: string;
  status_label: string;
  needs_ocr: boolean;
  parent_file_id?: string | null;
  parent_title?: string;
  uploaded_by?: string;
  uploader_name?: string;
  uploaded_at: string;
  duplicate_count: number;
  duplicates?: DuplicateRecord[];
  sources?: DocumentSource[];
  source_count?: number;
  /** Lean list flag — true when any source is still validating */
  sources_pending?: boolean;
};

export type ListFilesResponse = {
  files: FileRecord[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  q?: string;
};

export function displayTitle(file: {
  title?: string | null;
  original_filename: string;
}): string {
  return (file.title && file.title.trim()) || file.original_filename;
}

export type MatchRecord = {
  id: string;
  file_id: string;
  matched_file_id: string;
  matched_filename: string;
  matched_client_name?: string;
  matched_erp_code?: string;
  matched_anzsco?: string;
  matched_byte_size: number;
  matched_sha256: string;
  matched_uploaded_at: string;
  similarity: number;
  confidence_percent: number;
  match_tier: number;
  tier_label: string;
  decision: string;
  decision_label: string;
  decision_detail: string;
  created_at: string;
};

export type UploadResponse = {
  file: FileRecord;
  duplicate?: DuplicateRecord;
  tier0_duplicate: boolean;
  message: string;
  /** Member upload matched someone else's document — parked for review. */
  review_prompt?: boolean;
  review?: ReviewItem;
};

export type StatusResponse = {
  file: FileRecord;
  matches: MatchRecord[];
  terminal: boolean;
};

export class ApiError extends Error {
  status: number;
  matchedFileId?: string;
  matchedTitle?: string;
  matchedFilename?: string;
  matchedContentUrl?: string;

  constructor(
    message: string,
    status: number,
    extras?: {
      matchedFileId?: string;
      matchedTitle?: string;
      matchedFilename?: string;
      matchedContentUrl?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.matchedFileId = extras?.matchedFileId;
    this.matchedTitle = extras?.matchedTitle;
    this.matchedFilename = extras?.matchedFilename;
    this.matchedContentUrl = extras?.matchedContentUrl;
  }
}

/** Duck-type check — Next can break `instanceof` across module copies. */
export function getApiError(err: unknown): ApiError | null {
  if (!err || typeof err !== "object") return null;
  if (err instanceof ApiError) return err;
  const e = err as Partial<ApiError> & { name?: string; message?: string };
  if (e.name === "ApiError" || typeof e.matchedFileId === "string") {
    return e as ApiError;
  }
  return null;
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

let redirectingToLogin = false;

function handleUnauthorized(status: number): void {
  if (status !== 401 || typeof window === "undefined") return;
  // Don't bounce the login form itself on a failed credential check.
  if (window.location.pathname.startsWith("/login")) return;
  // Prevent stampede when many parallel requests get 401.
  if (redirectingToLogin) return;
  redirectingToLogin = true;
  clearAuthSession();
  const next = encodeURIComponent(
    window.location.pathname + window.location.search,
  );
  window.location.assign(`/login?next=${next}`);
}

async function parseJSON<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    handleUnauthorized(res.status);
    const body = data as {
      error?: string;
      matched_file_id?: string;
      matched_title?: string;
      matched_filename?: string;
      matched_content_url?: string;
    };
    const msg =
      typeof body === "object" && body && body.error
        ? String(body.error)
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, {
      matchedFileId: body.matched_file_id || undefined,
      matchedTitle: body.matched_title || undefined,
      matchedFilename: body.matched_filename || undefined,
      matchedContentUrl: body.matched_content_url || undefined,
    });
  }
  return data as T;
}

function withAccessToken(url: string): string {
  const token = getAuthToken();
  if (!token) return url;
  const u = new URL(url);
  u.searchParams.set("access_token", token);
  return u.toString();
}

export function fileContentURL(id: string): string {
  return withAccessToken(`${API_URL}/api/files/${id}/content`);
}

export function sourceContentURL(
  fileId: string,
  slot: SourceSlotNum | number,
): string {
  return withAccessToken(
    `${API_URL}/api/files/${fileId}/sources/${slot}/content`,
  );
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJSON<LoginResponse>(res);
}

export async function logoutRequest(): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{ message: string }>(res);
}

export async function fetchMe(): Promise<{ user: AuthUser }> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  return parseJSON<{ user: AuthUser }>(res);
}

export async function listUsers(): Promise<{ users: AuthUser[] }> {
  const res = await fetch(`${API_URL}/api/users/`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  return parseJSON<{ users: AuthUser[] }>(res);
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  role: "admin" | "member";
}): Promise<{ user: AuthUser }> {
  const res = await fetch(`${API_URL}/api/users/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  return parseJSON<{ user: AuthUser }>(res);
}

export async function patchUser(
  id: string,
  patch: { name?: string; role?: "admin" | "member"; is_active?: boolean },
): Promise<{ user: AuthUser }> {
  const res = await fetch(`${API_URL}/api/users/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(patch),
  });
  return parseJSON<{ user: AuthUser }>(res);
}

export async function resetUserPassword(
  id: string,
  password: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/users/${id}/reset-password`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ password }),
  });
  return parseJSON<{ message: string }>(res);
}

export async function uploadFile(
  meta: DocumentMetaInput,
  sources: DocumentSourcesInput,
): Promise<UploadResponse> {
  const body = new FormData();
  body.append("client_name", meta.client_name);
  body.append("erp_code", meta.erp_code);
  body.append("anzsco", meta.anzsco ?? "");
  body.append("team", meta.team);
  body.append("member", meta.member);
  appendSourcesToFormData(body, sources);
  const res = await fetch(`${API_URL}/api/files/upload`, {
    method: "POST",
    headers: authHeaders(),
    body,
  });
  return parseJSON<UploadResponse>(res);
}

export async function getFileStatus(
  id: string,
  opts?: { signal?: AbortSignal; light?: boolean },
): Promise<StatusResponse> {
  const qs = opts?.light ? "?light=1" : "";
  const res = await fetch(`${API_URL}/api/files/${id}/status${qs}`, {
    cache: "no-store",
    headers: authHeaders(),
    signal: opts?.signal,
  });
  return parseJSON<StatusResponse>(res);
}

export async function getMatches(id: string): Promise<{ matches: MatchRecord[] }> {
  const res = await fetch(`${API_URL}/api/files/${id}/matches`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  return parseJSON<{ matches: MatchRecord[] }>(res);
}

export async function requestDeepScan(id: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/api/files/${id}/deep-scan`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{ message: string }>(res);
}

export async function listFiles(opts?: {
  page?: number;
  pageSize?: number;
  q?: string;
  signal?: AbortSignal;
}): Promise<ListFilesResponse> {
  const params = new URLSearchParams();
  if (opts?.page != null) params.set("page", String(opts.page));
  if (opts?.pageSize != null) params.set("page_size", String(opts.pageSize));
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString();
  const res = await fetch(`${API_URL}/api/files/${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: authHeaders(),
    signal: opts?.signal,
  });
  const data = await parseJSON<ListFilesResponse>(res);
  // Backward-compatible defaults if an older API is still running.
  return {
    files: data.files ?? [],
    total: data.total ?? data.files?.length ?? 0,
    page: data.page ?? opts?.page ?? 1,
    page_size: data.page_size ?? opts?.pageSize ?? 25,
    has_more: data.has_more ?? false,
    q: data.q ?? opts?.q ?? "",
  };
}

export async function deleteFile(
  id: string,
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_URL}/api/files/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return parseJSON<{ id: string; message: string }>(res);
}

export async function replaceFile(
  id: string,
  file: File,
): Promise<{ file: FileRecord; message: string }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_URL}/api/files/${id}/replace`, {
    method: "PUT",
    headers: authHeaders(),
    body,
  });
  return parseJSON<{ file: FileRecord; message: string }>(res);
}

export async function updateFileName(
  id: string,
  title: string,
): Promise<{ file: FileRecord; message: string }> {
  const res = await fetch(`${API_URL}/api/files/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title }),
  });
  return parseJSON<{ file: FileRecord; message: string }>(res);
}

export async function updateFileMeta(
  id: string,
  meta: Partial<DocumentMetaInput>,
): Promise<{ file: FileRecord; message: string }> {
  const res = await fetch(`${API_URL}/api/files/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(meta),
  });
  return parseJSON<{ file: FileRecord; message: string }>(res);
}

export async function updateFileSources(
  id: string,
  sources: DocumentSourcesInput,
): Promise<{ file: FileRecord; message: string }> {
  const body = new FormData();
  appendSourcesToFormData(body, sources);
  const res = await fetch(`${API_URL}/api/files/${id}/sources`, {
    method: "PUT",
    headers: authHeaders(),
    body,
  });
  return parseJSON<{ file: FileRecord; message: string }>(res);
}

export type DuplicateMatch = {
  file_id: string;
  title: string;
  original_filename: string;
  client_name?: string;
  matched_filename: string;
  kind: "file" | "source" | string;
  slot?: number;
};

export type CheckDuplicateResponse = {
  duplicate: boolean;
  /** True when the match belongs to the caller (or caller is admin). */
  owned?: boolean;
  /** True when keeping this upload will require an admin review. */
  review_required?: boolean;
  match?: Partial<DuplicateMatch> & { kind?: string };
};

export async function fetchReviewQueue(opts?: {
  signal?: AbortSignal;
}): Promise<{ items: ReviewItem[] }> {
  const res = await fetch(`${API_URL}/api/files/review-queue`, {
    cache: "no-store",
    headers: authHeaders(),
    signal: opts?.signal,
  });
  const data = await parseJSON<{ items: ReviewItem[] }>(res);
  return { items: data.items ?? [] };
}

export async function requestReview(
  id: string,
): Promise<{ item: ReviewItem; message: string }> {
  const res = await fetch(`${API_URL}/api/files/review/${id}/request`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{ item: ReviewItem; message: string }>(res);
}

export async function approveReview(
  id: string,
): Promise<{ item: ReviewItem; original?: FileRecord | null; message: string }> {
  const res = await fetch(`${API_URL}/api/files/review/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{
    item: ReviewItem;
    original?: FileRecord | null;
    message: string;
  }>(res);
}

export async function rejectReview(
  id: string,
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_URL}/api/files/review/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{ id: string; message: string }>(res);
}

export async function discardReview(
  id: string,
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_URL}/api/files/review/${id}/discard`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON<{ id: string; message: string }>(res);
}

export async function sha256Hex(file: File): Promise<string> {
  // Yield so the UI can paint "Checking…" before a large read blocks the main thread.
  await new Promise<void>((r) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => r());
    } else {
      setTimeout(r, 0);
    }
  });

  // Stream into one buffer in chunks — keeps peak memory flatter for large PDFs.
  const chunkSize = 2 * 1024 * 1024;
  if (file.size <= chunkSize || typeof file.stream !== "function") {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const buf = new Uint8Array(file.size);
  let offset = 0;
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    buf.set(value, offset);
    offset += value.byteLength;
    // Periodic yield during large reads.
    if (offset % (8 * 1024 * 1024) < value.byteLength) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkDuplicate(
  sha256: string,
  opts?: { excludeFileId?: string; signal?: AbortSignal },
): Promise<CheckDuplicateResponse> {
  const res = await fetch(`${API_URL}/api/files/check-duplicate`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      sha256,
      exclude_file_id: opts?.excludeFileId ?? "",
    }),
    signal: opts?.signal,
  });
  return parseJSON<CheckDuplicateResponse>(res);
}

export type CheckSimilarResponse = {
  similar: boolean;
  similarity?: number;
  decision?: string;
  reason?: string;
  owned?: boolean;
  review_required?: boolean;
  match?: Partial<DuplicateMatch> & {
    kind?: string;
    similarity?: number;
    decision?: string;
    peer_slot?: number;
    slot?: number;
  };
};

/** Near-duplicate check against peer sources + corpus after exact SHA miss. */
export async function checkSimilar(
  file: File,
  opts?: {
    excludeFileId?: string;
    peerFiles?: Partial<Record<SourceSlotNum, File | null>>;
    peerSlot?: SourceSlotNum;
    signal?: AbortSignal;
  },
): Promise<CheckSimilarResponse> {
  const body = new FormData();
  body.append("file", file);
  if (opts?.excludeFileId) {
    body.append("exclude_file_id", opts.excludeFileId);
  }
  if (opts?.peerSlot) {
    body.append("peer_slot", String(opts.peerSlot));
  }
  for (const slot of SOURCE_SLOTS) {
    const peer = opts?.peerFiles?.[slot];
    if (peer && slot !== opts?.peerSlot) {
      body.append(`peer_${slot}`, peer);
    }
  }
  const res = await fetch(`${API_URL}/api/files/check-similar`, {
    method: "POST",
    headers: authHeaders(),
    body,
    signal: opts?.signal,
  });
  return parseJSON<CheckSimilarResponse>(res);
}

export type AppNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  entity_type?: string;
  entity_id?: string;
  read_at?: string | null;
  created_at: string;
};

export type StreamEvent = {
  type: string;
  at: string;
  notification?: AppNotification | null;
  entity_id?: string;
};

export function eventsStreamURL(): string {
  return withAccessToken(`${API_URL}/api/events`);
}

export async function fetchNotifications(opts?: {
  signal?: AbortSignal;
}): Promise<{ items: AppNotification[]; unread_count: number }> {
  const res = await fetch(`${API_URL}/api/notifications`, {
    headers: authHeaders(),
    cache: "no-store",
    signal: opts?.signal,
  });
  return parseJSON(res);
}

export async function markNotificationRead(
  id: string,
): Promise<{ ok: boolean; unread_count: number }> {
  const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON(res);
}

export async function markAllNotificationsRead(): Promise<{
  ok: boolean;
  marked: number;
  unread_count: number;
}> {
  const res = await fetch(`${API_URL}/api/notifications/read-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  return parseJSON(res);
}
