"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  deleteFile,
  displayTitle,
  fileContentURL,
  getApiError,
  getFileStatus,
  listFiles,
  replaceFile,
  requestDeepScan,
  requestReview,
  type DuplicateRecord,
  type FileRecord,
  type ReviewItem,
  type UploadResponse,
} from "@/lib/api";
import { isTerminal } from "@/lib/files";
import { onReviewRefresh } from "@/lib/realtime";
import { openFileFast, prefetchContentURL } from "@/lib/contentCache";
import {
  readDocsListCache,
  writeDocsListCache,
} from "@/lib/docsListCache";
import { AddDocumentModal } from "@/components/files/AddDocumentModal";
import { DocumentRow, type RowDetail } from "@/components/files/DocumentRow";
import {
  DocsTableHead,
} from "@/components/files/docsTableLayout";
import { EditDocumentModal } from "@/components/files/EditDocumentModal";
import { ReviewQueuePanel } from "@/components/files/ReviewQueuePanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { selectIsAdmin, useAuthStore } from "@/store/auth-store";

/** First page + scroll batches — small for instant first paint. */
const SCROLL_PAGE_SIZE = 25;
/** Keep search queries bounded so the input and API stay snappy. */
const SEARCH_MAX = 120;

function sanitizeSearchInput(raw: string): string {
  // Strip control chars; keep user spacing until debounce trims.
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, SEARCH_MAX);
}

type ConfirmState =
  | {
      kind: "delete";
      fileId: string;
      label: string;
    }
  | {
      kind: "delete-dup";
      parentId: string;
      dup: DuplicateRecord;
      label: string;
    }
  | {
      kind: "replace";
      fileId: string;
      file: File;
    };

function openFile(id: string) {
  void openFileFast(id);
}

function sourcesPending(file: FileRecord): boolean {
  if (typeof file.sources_pending === "boolean") return file.sources_pending;
  return (file.sources ?? []).some(
    (s) => s.match_status === "pending" || s.match_status === "processing",
  );
}

function needsPolling(file: FileRecord): boolean {
  return (
    !isTerminal(file) ||
    (file.status === "pending" && file.needs_ocr) ||
    sourcesPending(file)
  );
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

export function DocumentsWorkspace() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIdsRef = useRef<Set<string>>(new Set());
  const pollInFlightRef = useRef(false);
  const pollAbortsRef = useRef<Set<AbortController>>(new Set());
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailSeqRef = useRef(0);
  const listSeqRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const pendingTempRef = useRef<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const [files, setFiles] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const queryRef = useRef("");
  const loadingMoreRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const [editFileId, setEditFileId] = useState<string | null>(null);
  const [deepScanningId, setDeepScanningId] = useState<string | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorMatch, setErrorMatch] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const isAdmin = useAuthStore(selectIsAdmin);
  /** Post-upload duplicate prompt (member matched someone else's document). */
  const [reviewPrompt, setReviewPrompt] = useState<ReviewItem | null>(null);
  const [reviewPromptBusy, setReviewPromptBusy] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  /** Only one row accordion open — prevents UI races across rows */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedIdRef = useRef<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, RowDetail>>({});

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  const stopPollingAll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollIdsRef.current.clear();
    pollInFlightRef.current = false;
    for (const c of pollAbortsRef.current) c.abort();
    pollAbortsRef.current.clear();
  }, []);

  const stopPollingId = useCallback(
    (fileId: string) => {
      pollIdsRef.current.delete(fileId);
      if (pollIdsRef.current.size === 0) stopPollingAll();
    },
    [stopPollingAll],
  );

  const mergeFile = useCallback((prev: FileRecord, next: FileRecord): FileRecord => {
    const duplicateCount = next.duplicate_count ?? prev.duplicate_count ?? 0;
    const sourceCount =
      next.source_count ??
      (Array.isArray(next.sources) ? next.sources.length : undefined) ??
      prev.source_count ??
      prev.sources?.length ??
      0;
    // Light polls omit/null sources — never wipe a previously loaded payload.
    const sources = Array.isArray(next.sources)
      ? next.sources
      : sourceCount === 0
        ? []
        : prev.sources;
    const sourcesPendingFlag =
      typeof next.sources_pending === "boolean"
        ? next.sources_pending
        : Array.isArray(next.sources)
          ? next.sources.some(
              (s) =>
                s.match_status === "pending" || s.match_status === "processing",
            )
          : prev.sources_pending;
    return {
      ...prev,
      ...next,
      title:
        next.title || prev.title || next.original_filename || prev.original_filename,
      original_filename: next.original_filename || prev.original_filename,
      client_name: next.client_name ?? prev.client_name ?? "",
      erp_code: next.erp_code ?? prev.erp_code ?? "",
      anzsco: next.anzsco ?? prev.anzsco ?? "",
      team: next.team ?? prev.team ?? "",
      member: next.member ?? prev.member ?? "",
      client_document_count:
        typeof next.client_document_count === "number"
          ? next.client_document_count
          : prev.client_document_count,
      // Provenance fields must survive light polls that omit them.
      parent_file_id:
        next.parent_file_id !== undefined
          ? next.parent_file_id
          : prev.parent_file_id,
      parent_title: next.parent_title || prev.parent_title,
      uploaded_at: next.uploaded_at || prev.uploaded_at,
      duplicates: Array.isArray(next.duplicates)
        ? next.duplicates
        : duplicateCount === 0
          ? []
          : prev.duplicates,
      duplicate_count: duplicateCount,
      sources,
      source_count: sourceCount,
      sources_pending: sourcesPendingFlag,
    };
  }, []);

  /** Reset to page 1 and replace the loaded window (search / refresh / upload). */
  const refreshList = useCallback(
    async (
      soft = false,
      overrides?: { q?: string },
    ): Promise<FileRecord[] | null> => {
      const seq = ++listSeqRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      listAbortRef.current?.abort();
      const controller = new AbortController();
      listAbortRef.current = controller;
      // Soft refresh keeps current rows visible (no full-page "Loading…" flash).
      if (soft) setRefreshing(true);
      else setLoading(true);
      const nextQ = overrides?.q ?? queryRef.current;
      try {
        const res = await listFiles({
          page: 1,
          pageSize: SCROLL_PAGE_SIZE,
          q: nextQ || undefined,
          signal: controller.signal,
        });
        if (seq !== listSeqRef.current || controller.signal.aborted) return null;
        const deleted = deletedIdsRef.current;
        const nextFiles = res.files.filter((f) => !deleted.has(f.id));
        for (const id of [...deleted]) {
          if (!res.files.some((f) => f.id === id)) deleted.delete(id);
        }
        setTotal(res.total);
        setPage(1);
        pageRef.current = 1;
        setHasMore(res.has_more);
        hasMoreRef.current = res.has_more;
        setFiles((prev) => {
          const prevById = new Map(prev.map((f) => [f.id, f]));
          return nextFiles.map((f) => {
            const existing = prevById.get(f.id);
            if (!existing) return f;
            return mergeFile(existing, f);
          });
        });
        writeDocsListCache({
          files: nextFiles,
          total: res.total,
          has_more: res.has_more,
          q: nextQ || "",
        });
        const openId = expandedIdRef.current;
        if (openId && !nextFiles.some((f) => f.id === openId)) {
          expandedIdRef.current = null;
          setExpandedId(null);
        }
        // Keep polling only for rows still in the reset window (or still processing).
        const keep = new Set(nextFiles.map((f) => f.id));
        for (const id of [...pollIdsRef.current]) {
          if (!keep.has(id)) pollIdsRef.current.delete(id);
        }
        if (pollIdsRef.current.size === 0) stopPollingAll();
        setError(null);
        setErrorMatch(null);
        return nextFiles;
      } catch (err) {
        if (
          seq !== listSeqRef.current ||
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return null;
        }
        setError(err instanceof Error ? err.message : "Failed to load documents");
        setErrorMatch(null);
        return null;
      } finally {
        if (seq === listSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [mergeFile, stopPollingAll],
  );

  // Live review decisions (approve / reject / request) soft-refresh the table.
  useEffect(() => {
    return onReviewRefresh(() => {
      void refreshList(true);
      setReviewVersion((v) => v + 1);
    });
  }, [refreshList]);

  /**
   * Apply several row updates in a single render.
   *
   * The poll fans out one request per processing document. Committing each
   * response separately re-rendered the whole table once per document per tick,
   * which is what made the UI stutter while a batch was processing.
   */
  const patchFiles = useCallback(
    (incoming: FileRecord[]) => {
      const deleted = deletedIdsRef.current;
      const byId = new Map<string, FileRecord>();
      for (const f of incoming) {
        if (!deleted.has(f.id)) byId.set(f.id, f);
      }
      if (byId.size === 0) return;

      setFiles((prev) => {
        let changed = false;
        const next = prev.map((f) => {
          const update = byId.get(f.id);
          if (!update) return f;
          const merged = mergeFile(f, update);
          changed = true;
          return merged;
        });
        // Never resurrect a row that isn't in the current list (e.g. after delete).
        return changed ? next : prev;
      });
    },
    [mergeFile],
  );

  const patchFile = useCallback(
    (file: FileRecord) => {
      patchFiles([file]);
    },
    [patchFiles],
  );

  const loadDetails = useCallback(
    async (
      fileId: string,
      opts?: {
        message?: string | null;
        silent?: boolean;
        soft?: boolean;
        /** Return the status without committing it; the caller batches. */
        defer?: boolean;
      },
    ) => {
      const silent = opts?.silent === true;
      const soft = opts?.soft === true;

      // Silent polls use per-request controllers so multi-file polling
      // never cancels an in-flight expand/detail load.
      if (silent) {
        const controller = new AbortController();
        pollAbortsRef.current.add(controller);
        try {
          const status = await getFileStatus(fileId, {
            signal: controller.signal,
            light: true,
          });
          if (
            controller.signal.aborted ||
            deletedIdsRef.current.has(fileId)
          ) {
            return null;
          }
          if (!opts?.defer) patchFile(status.file);
          if (expandedIdRef.current === fileId) {
            setDetailsById((prev) => ({
              ...prev,
              [fileId]: {
                matches: prev[fileId]?.matches ?? [],
                message: opts?.message ?? prev[fileId]?.message ?? null,
                loading: false,
                error: null,
              },
            }));
          }
          return status;
        } catch (err) {
          if (
            controller.signal.aborted ||
            (err instanceof DOMException && err.name === "AbortError")
          ) {
            return null;
          }
          if (expandedIdRef.current === fileId) {
            setDetailsById((prev) => ({
              ...prev,
              [fileId]: {
                matches: prev[fileId]?.matches ?? [],
                message: opts?.message ?? prev[fileId]?.message ?? null,
                loading: false,
                error:
                  err instanceof Error ? err.message : "Failed to refresh status",
              },
            }));
          }
          return null;
        } finally {
          pollAbortsRef.current.delete(controller);
        }
      }

      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      const seq = ++detailSeqRef.current;

      // Soft expand: paint list data immediately; don't gate the accordion on a spinner.
      if (!soft) {
        setDetailsById((prev) => ({
          ...prev,
          [fileId]: {
            matches: prev[fileId]?.matches ?? [],
            message: opts?.message ?? prev[fileId]?.message ?? null,
            loading: true,
            error: null,
          },
        }));
      }

      try {
        // Full status on expand — sources + matches for the accordion.
        const status = await getFileStatus(fileId, {
          signal: controller.signal,
          light: false,
        });
        if (
          controller.signal.aborted ||
          seq !== detailSeqRef.current ||
          deletedIdsRef.current.has(fileId)
        ) {
          return null;
        }

        patchFile(status.file);
        setDetailsById((prev) => ({
          ...prev,
          [fileId]: {
            matches: status.matches ?? [],
            message: opts?.message ?? prev[fileId]?.message ?? null,
            loading: false,
            error: null,
          },
        }));
        return status;
      } catch (err) {
        if (
          controller.signal.aborted ||
          seq !== detailSeqRef.current ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return null;
        }
        const msg =
          err instanceof Error ? err.message : "Failed to load details";
        if (seq === detailSeqRef.current) {
          setDetailsById((prev) => ({
            ...prev,
            [fileId]: {
              matches: prev[fileId]?.matches ?? [],
              message: opts?.message ?? prev[fileId]?.message ?? null,
              loading: false,
              error: msg,
            },
          }));
        }
        return null;
      }
    },
    [patchFile],
  );

  const startPolling = useCallback(
    (fileId: string) => {
      pollIdsRef.current.add(fileId);
      if (pollRef.current) return;

      const tick = async () => {
        if (pollInFlightRef.current) return;
        const ids = [...pollIdsRef.current].filter(
          (id) => !deletedIdsRef.current.has(id),
        );
        if (ids.length === 0) {
          stopPollingAll();
          return;
        }
        pollInFlightRef.current = true;
        let needsStructureRefresh = false;
        try {
          const results = await Promise.all(
            ids.map((id) => loadDetails(id, { silent: true, defer: true })),
          );

          // One commit for the whole tick, regardless of how many documents
          // are in flight.
          patchFiles(
            results.filter((s): s is NonNullable<typeof s> => !!s).map((s) => s.file),
          );

          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const status = results[i];
            if (!status) continue;
            // Nested away from roots — list shape changed.
            if (status.file.parent_file_id) {
              pollIdsRef.current.delete(id);
              needsStructureRefresh = true;
              continue;
            }
            if (isTerminal(status.file) && !sourcesPending(status.file)) {
              pollIdsRef.current.delete(id);
              // Final full hydrate so open rows get source decisions/matches.
              if (expandedIdRef.current === id) {
                void loadDetails(id);
              }
            }
          }
          if (pollIdsRef.current.size === 0) stopPollingAll();
          if (needsStructureRefresh) void refreshList(true);
        } finally {
          pollInFlightRef.current = false;
        }
      };

      void tick();
      // Slower cadence — light status is cheap, but R2/DB RTTs still add up.
      pollRef.current = setInterval(() => {
        void tick();
      }, 2500);
    },
    [loadDetails, patchFiles, refreshList, stopPollingAll],
  );

  /** Append the next page when the user scrolls near the bottom. */
  const loadMore = useCallback(async () => {
    if (
      loadingMoreRef.current ||
      !hasMoreRef.current ||
      loading ||
      refreshing
    ) {
      return;
    }
    const seqAtStart = listSeqRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    try {
      const res = await listFiles({
        page: nextPage,
        pageSize: SCROLL_PAGE_SIZE,
        q: queryRef.current || undefined,
      });
      // A reset (search/refresh) happened while we were fetching — drop this page.
      if (seqAtStart !== listSeqRef.current) return;

      const deleted = deletedIdsRef.current;
      const incoming = res.files.filter((f) => !deleted.has(f.id));
      setTotal(res.total);
      setPage(res.page);
      pageRef.current = res.page;
      setHasMore(res.has_more);
      hasMoreRef.current = res.has_more;

      setFiles((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        const appended: FileRecord[] = [];
        for (const f of incoming) {
          if (seen.has(f.id)) continue;
          seen.add(f.id);
          appended.push(f);
        }
        return appended.length ? [...prev, ...appended] : prev;
      });

      for (const f of incoming) {
        if (needsPolling(f)) startPolling(f.id);
      }
      setError(null);
    } catch (err) {
      if (seqAtStart !== listSeqRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to load more documents",
      );
    } finally {
      if (seqAtStart === listSeqRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [loading, refreshing, startPolling]);

  // Infinite scroll: load the next batch when the sentinel enters the viewport.
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "320px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading, hasMore, files.length]);

  // Instant paint from session cache, then soft-revalidate for accuracy.
  useEffect(() => {
    let cancelled = false;
    const cached = readDocsListCache(queryRef.current);
    if (cached && cached.files.length > 0) {
      setFiles(cached.files);
      setTotal(cached.total);
      setHasMore(cached.has_more);
      hasMoreRef.current = cached.has_more;
      setPage(1);
      pageRef.current = 1;
      setLoading(false);
      for (const f of cached.files) {
        if (needsPolling(f)) startPolling(f.id);
      }
    }
    (async () => {
      const next = await refreshList(Boolean(cached && cached.files.length > 0));
      if (cancelled || !next) return;
      for (const f of next) {
        if (needsPolling(f)) startPolling(f.id);
      }
    })();
    return () => {
      cancelled = true;
      listAbortRef.current?.abort();
      stopPollingAll();
      detailAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  const toggleRow = useCallback((file: FileRecord) => {
    if (file.status === "uploading") return;
    prefetchContentURL(file.id);
    if (expandedIdRef.current === file.id) {
      // Collapse — keep background polling so status stays live.
      expandedIdRef.current = null;
      setExpandedId(null);
      return;
    }

    expandedIdRef.current = file.id;
    setExpandedId(file.id);

    // Instant paint from list data — no "Updating…" gate.
    setDetailsById((prev) => ({
      ...prev,
      [file.id]: {
        matches: prev[file.id]?.matches ?? [],
        message: prev[file.id]?.message ?? null,
        loading: false,
        error: null,
      },
    }));

    void (async () => {
      const status = await loadDetails(file.id, { soft: true });
      if (expandedIdRef.current !== file.id) {
        const latest = status?.file ?? file;
        if (needsPolling(latest)) startPolling(file.id);
        return;
      }

      const latest = status?.file ?? file;
      if (needsPolling(latest)) {
        startPolling(file.id);
      } else {
        stopPollingId(file.id);
      }
    })();
  }, [loadDetails, startPolling, stopPollingId]);

  // Stable row callbacks — DocumentRow is memoised, so a new function identity
  // here would re-render every row on each parent update and undo the memo.
  const requestDelete = useCallback((file: FileRecord) => {
    setConfirm({
      kind: "delete",
      fileId: file.id,
      label: displayTitle(file),
    });
  }, []);

  const requestDeleteDuplicate = useCallback(
    (parent: FileRecord, dup: DuplicateRecord) => {
      setConfirm({
        kind: "delete-dup",
        parentId: parent.id,
        dup,
        label: displayTitle(dup),
      });
    },
    [],
  );

  const requestReplace = useCallback((fileId: string, next: File) => {
    setConfirm({ kind: "replace", fileId, file: next });
  }, []);

  const requestEdit = useCallback(
    (file: FileRecord) => {
      setEditFileId(file.id);
      // Lean list omits source rows — hydrate before the edit form needs them.
      if (
        (file.source_count ?? 0) > 0 &&
        !(file.sources && file.sources.length > 0)
      ) {
        void loadDetails(file.id, { silent: true });
      }
    },
    [loadDetails],
  );

  const handleUploaded = async (res: UploadResponse) => {
    // Drop any optimistic placeholder for this in-flight upload.
    const tempId = pendingTempRef.current;
    pendingTempRef.current = null;
    if (tempId) {
      setFiles((prev) => prev.filter((f) => f.id !== tempId));
    }

    // Member upload matched someone else's document — nothing was added to
    // the table. Ask whether to request an admin review.
    if (res.review_prompt && res.review) {
      setReviewPrompt(res.review);
      setReviewVersion((v) => v + 1);
      return;
    }

    const targetId = res.file.id;
    setError(null);
    deletedIdsRef.current.delete(targetId);
    expandedIdRef.current = targetId;
    setExpandedId(targetId);
    // New uploads belong on page 1 of the unfiltered list.
    pageRef.current = 1;
    setPage(1);
    setFiles((prev) => {
      const withoutTemp = tempId
        ? prev.filter((f) => f.id !== tempId)
        : prev;
      const idx = withoutTemp.findIndex((f) => f.id === targetId);
      if (idx === -1) return [res.file, ...withoutTemp];
      return withoutTemp.map((f, i) => (i === idx ? mergeFile(f, res.file) : f));
    });
    setDetailsById((prev) => ({
      ...prev,
      [targetId]: {
        matches: [],
        message: res.message,
        loading: false,
        error: null,
      },
    }));
    // Reset scroll window so the new/updated root is at the top accurately.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // Optimistic row already painted — soft revalidate in background (no block).
    void refreshList(true);
    prefetchContentURL(targetId);

    if (res.tier0_duplicate) {
      void loadDetails(targetId, { message: res.message, silent: true });
      return;
    }

    startPolling(targetId);
  };

  const handleUploadQueued = useCallback(
    (pending: {
      tempId: string;
      meta: {
        title?: string;
        client_name: string;
        erp_code: string;
        anzsco?: string;
        team: string;
        member: string;
      };
      filename: string;
      byteSize: number;
    }) => {
      pendingTempRef.current = pending.tempId;
      const row: FileRecord = {
        id: pending.tempId,
        title: pending.meta.title?.trim() || pending.filename,
        original_filename: pending.filename,
        client_name: pending.meta.client_name,
        erp_code: pending.meta.erp_code,
        anzsco: pending.meta.anzsco ?? "",
        team: pending.meta.team,
        member: pending.meta.member,
        storage_path: "",
        byte_size: pending.byteSize,
        sha256_hash: "",
        status: "uploading",
        status_label: "Uploading",
        needs_ocr: false,
        uploaded_at: new Date().toISOString(),
        uploader_name: useAuthStore.getState().user?.name || undefined,
        duplicate_count: 0,
        source_count: 1,
        sources_pending: false,
      };
      setFiles((prev) => [row, ...prev.filter((f) => f.id !== pending.tempId)]);
      setTotal((t) => t + 1);
      setError(null);
      showNotice(`Uploading ${pending.filename}…`);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    },
    // showNotice is stable enough via setState; avoid re-creating each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleUploadFailed = useCallback((tempId: string, message: string) => {
    if (pendingTempRef.current === tempId) pendingTempRef.current = null;
    setFiles((prev) => prev.filter((f) => f.id !== tempId));
    setTotal((t) => Math.max(0, t - 1));
    setError(message);
    setNotice(null);
  }, []);

  // Debounced server search — resets the infinite-scroll window.
  const searchReadyRef = useRef(false);
  const searchPending =
    queryInput.trim() !== query && (refreshing || loading);
  useEffect(() => {
    if (!searchReadyRef.current) {
      searchReadyRef.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      const next = sanitizeSearchInput(queryInput).trim();
      if (next === queryRef.current) return;
      setQuery(next);
      queryRef.current = next;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      void refreshList(true, { q: next });
    }, 280);
    return () => window.clearTimeout(handle);
  }, [queryInput, refreshList]);

  const onDeepScan = useCallback(async (fileId: string) => {
    setDeepScanningId(fileId);
    setError(null);
    if (expandedIdRef.current !== fileId) {
      expandedIdRef.current = fileId;
      setExpandedId(fileId);
    }
    try {
      const res = await requestDeepScan(fileId);
      if (expandedIdRef.current === fileId) {
        setDetailsById((prev) => ({
          ...prev,
          [fileId]: {
            matches: prev[fileId]?.matches ?? [],
            message: res.message,
            loading: prev[fileId]?.loading ?? false,
            error: null,
          },
        }));
      }
      // Continuity: poll even if the accordion was closed during the request.
      startPolling(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deep Scan failed");
    } finally {
      setDeepScanningId(null);
    }
  }, [startPolling]);

  const runReplace = async (fileId: string, next: File) => {
    setReplacingId(fileId);
    setError(null);
    setErrorMatch(null);
    try {
      const res = await replaceFile(fileId, next);
      patchFile({
        ...res.file,
        duplicates: [],
        duplicate_count: 0,
      });
      if (expandedIdRef.current === fileId) {
        setDetailsById((prev) => ({
          ...prev,
          [fileId]: {
            matches: [],
            message: res.message,
            loading: true,
            error: null,
          },
        }));
      }
      startPolling(fileId);
    } catch (err) {
      const apiErr = getApiError(err);
      if (apiErr?.matchedFileId) {
        setError("Replacement matches an existing document");
        setErrorMatch({
          id: apiErr.matchedFileId,
          title:
            apiErr.matchedTitle ||
            apiErr.matchedFilename ||
            "Original document",
        });
      } else {
        setError(err instanceof Error ? err.message : "Replace failed");
        setErrorMatch(null);
      }
    } finally {
      setReplacingId(null);
    }
  };

  const onEdited = (
    updated: FileRecord,
    opts?: { sourcesChanged?: boolean; message?: string },
  ) => {
    patchFile(updated);
    const fileId = updated.id;
    if (expandedIdRef.current === fileId) {
      setDetailsById((prev) => ({
        ...prev,
        [fileId]: {
          matches: prev[fileId]?.matches ?? [],
          message: opts?.message ?? "Document updated",
          loading: Boolean(opts?.sourcesChanged) || (prev[fileId]?.loading ?? false),
          error: null,
        },
      }));
    }
    if (opts?.sourcesChanged || needsPolling(updated)) {
      startPolling(fileId);
    }
  };

  const editFile =
    editFileId != null
      ? (files.find((f) => f.id === editFileId) ?? null)
      : null;

  const runDelete = async (fileId: string) => {
    setDeletingId(fileId);
    setError(null);
    deletedIdsRef.current.add(fileId);
    if (editFileId === fileId) setEditFileId(null);
    stopPollingId(fileId);
    // Only abort the in-flight expand load if it belongs to this row.
    if (expandedIdRef.current === fileId) {
      detailAbortRef.current?.abort();
    }
    try {
      await deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      setDetailsById((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      if (expandedIdRef.current === fileId) {
        expandedIdRef.current = null;
        setExpandedId(null);
      }
      await refreshList(true);
    } catch (err) {
      deletedIdsRef.current.delete(fileId);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const runDeleteDuplicate = async (parentId: string, dup: DuplicateRecord) => {
    const label = displayTitle(dup);
    setDeletingId(dup.id);
    setError(null);
    try {
      await deleteFile(dup.id);
      if (expandedIdRef.current === parentId) {
        await loadDetails(parentId, {
          message: `Removed duplicate “${label}”`,
        });
      }
      await refreshList(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const onConfirm = async () => {
    if (!confirm || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirm.kind === "delete") {
        await runDelete(confirm.fileId);
      } else if (confirm.kind === "delete-dup") {
        await runDeleteDuplicate(confirm.parentId, confirm.dup);
      } else {
        await runReplace(confirm.fileId, confirm.file);
      }
      setConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const listFailed = Boolean(error && !loading && files.length === 0 && total === 0);
  const loadedCount = files.length;
  const countValue =
    loading && files.length === 0 && !query
      ? "—"
      : formatCount(total);
  const countSuffix = query ? "found" : "rows";

  // Server paginates millions of rows; this keeps the DOM small as the user
  // scrolls and accumulates pages in memory.
  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (files[index]?.id === expandedId ? 380 : 58),
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const padTop = virtualRows.length > 0 ? virtualRows[0]!.start : 0;
  const padBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1]!.end
      : 0;

  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedId, files.length, rowVirtualizer]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <AddDocumentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onUploaded={(res) => void handleUploaded(res)}
        onUploadQueued={handleUploadQueued}
        onUploadFailed={handleUploadFailed}
      />

      <EditDocumentModal
        open={editFileId != null}
        file={editFile}
        onClose={() => setEditFileId(null)}
        onSaved={onEdited}
      />

      {reviewPrompt && (
        <ConfirmDialog
          open
          busy={reviewPromptBusy}
          title="Duplicate detected"
          description={`“${reviewPrompt.title}” exactly matches “${
            reviewPrompt.original_title || "an existing document"
          }” uploaded by another member. Request an admin review to keep it — or decide later from the Duplicate review list.`}
          confirmLabel="Request admin review"
          cancelLabel="Decide later"
          onCancel={() => {
            if (!reviewPromptBusy) setReviewPrompt(null);
          }}
          onConfirm={() => {
            if (reviewPromptBusy) return;
            setReviewPromptBusy(true);
            void (async () => {
              try {
                const res = await requestReview(reviewPrompt.id);
                showNotice(res.message);
                setReviewVersion((v) => v + 1);
                setReviewPrompt(null);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Failed to request review",
                );
                setReviewPrompt(null);
              } finally {
                setReviewPromptBusy(false);
              }
            })();
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          danger={confirm.kind !== "replace"}
          busy={confirmBusy}
          title={
            confirm.kind === "replace"
              ? "Replace document file?"
              : confirm.kind === "delete-dup"
                ? "Delete nested duplicate?"
                : "Delete document?"
          }
          description={
            confirm.kind === "replace"
              ? "The original name stays the same, and nested duplicates for the old content are cleared."
              : confirm.kind === "delete-dup"
                ? `Delete nested duplicate “${confirm.label}”? This cannot be undone.`
                : `Delete “${confirm.label}”? This cannot be undone.`
          }
          confirmLabel={
            confirm.kind === "replace" ? "Replace file" : "Delete"
          }
          onCancel={() => {
            if (!confirmBusy) setConfirm(null);
          }}
          onConfirm={() => void onConfirm()}
        />
      )}

      <div className="page-x flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--border)] sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
          <label className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center text-[var(--muted-soft)]">
              {searchPending ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
              ) : (
                <Search className="size-3.5" strokeWidth={1.75} />
              )}
            </span>
            <input
              type="search"
              value={queryInput}
              maxLength={SEARCH_MAX}
              onChange={(e) => setQueryInput(sanitizeSearchInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Escape" && queryInput) {
                  e.preventDefault();
                  setQueryInput("");
                }
              }}
              placeholder="Search name, client, ERP, team…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search documents"
              className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] py-0 pl-8 pr-9 text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-soft)] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--ring)] [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="button"
              onClick={() => setQueryInput("")}
              disabled={!queryInput}
              className={[
                "absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-lg transition-opacity",
                queryInput
                  ? "text-[var(--muted)] opacity-100 hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                  : "pointer-events-none opacity-0",
              ].join(" ")}
              aria-label="Clear search"
              tabIndex={queryInput ? 0 : -1}
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          </label>

          {/* Fixed-width count chip — right of search, no layout shift */}
          <div
            className="inline-flex h-9 w-[6.75rem] shrink-0 items-center justify-end gap-1.5 rounded-xl border border-transparent px-2.5 sm:w-[7.25rem]"
            title={
              query
                ? `${formatCount(total)} matching row${total === 1 ? "" : "s"}`
                : `${formatCount(total)} row${total === 1 ? "" : "s"}`
            }
            aria-live="polite"
          >
            <span className="text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--ink)]">
              {countValue}
            </span>
            <span className="w-10 text-left text-[12px] text-[var(--muted)]">
              {countSuffix}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => void refreshList(true)}
            disabled={refreshing || loading}
            className="inline-flex size-9 items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label="Refresh"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              strokeWidth={1.75}
            />
          </button>
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--ink)] px-3 text-[13px] font-medium text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:px-3.5"
          >
            <Plus className="size-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Add document</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className="page-x flex h-11 items-center gap-2.5 border-b border-emerald-200/80 bg-emerald-50/90 text-[13px] text-emerald-800"
        >
          <span className="min-w-0 flex-1 truncate font-medium tracking-[-0.01em]">
            {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <ReviewQueuePanel
        isAdmin={isAdmin}
        refreshKey={reviewVersion}
        onNotice={showNotice}
        onReviewChanged={(info) => {
          // Soft-refresh the documents list so member synthetic rows and
          // admin duplicate counts appear right after approve / sync.
          void refreshList(true).then(() => {
            const originalId = info.original?.id;
            if (info.original) {
              patchFile(info.original);
            }
            const expandId = originalId || expandedIdRef.current;
            if (expandId && (info.action === "approve" || info.action === "sync" || info.action === "discard" || info.action === "reject")) {
              if (expandedIdRef.current === expandId) {
                void loadDetails(expandId, { silent: true });
              }
            }
          });
        }}
      />

      {error && !listFailed && (
        <div
          role="alert"
          className="page-x flex h-11 items-center gap-2.5 border-b border-red-200/80 bg-red-50/90 text-[13px] text-red-700"
        >
          <AlertTriangle className="size-4 shrink-0 text-red-600" strokeWidth={1.75} />
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span className="shrink-0 font-medium tracking-[-0.01em]">{error}</span>
            {errorMatch && (
              <>
                <span className="shrink-0 text-red-300" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => openFile(errorMatch.id)}
                  className="inline-flex min-w-0 max-w-full items-center gap-1.5 truncate font-semibold text-red-900 underline decoration-red-300/80 underline-offset-2 transition-colors hover:text-black hover:decoration-red-500"
                  title={`Open viewer: ${fileContentURL(errorMatch.id)}`}
                >
                  <span className="truncate">{errorMatch.title}</span>
                  <ExternalLink className="size-3.5 shrink-0 opacity-70" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setErrorMatch(null);
            }}
            aria-label="Dismiss"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-100 hover:text-red-800"
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        className="docs-scroll docs-scroll-stable min-h-0 flex-1 overflow-auto"
      >
        {loading && files.length === 0 ? (
          <div className="workspace-band">
            <table className="docs-table">
              <DocsTableHead />
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]">
                    <td className="page-pl page-pr py-3" colSpan={9}>
                      <div
                        className="h-9 animate-pulse rounded-lg bg-[var(--surface-muted)]"
                        style={{ width: `${72 - (i % 4) * 8}%` }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : listFailed ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle className="size-5" strokeWidth={1.75} />
            </span>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              Couldn’t load documents
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--muted)]">{error}</p>
            <button
              type="button"
              onClick={() => void refreshList(false)}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-white hover:bg-black"
            >
              <RefreshCw className="size-4" strokeWidth={1.75} />
              Try again
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--ink)]">
              {query ? (
                <Search className="size-5" strokeWidth={1.75} />
              ) : (
                <FileText className="size-5" strokeWidth={1.75} />
              )}
            </span>
            <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
              {query ? "No matching documents" : "No documents yet"}
            </p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--muted)]">
              {query
                ? `Nothing matched “${query}”. Try another name, client, or ERP code.`
                : "Unique files stay top-level. Duplicates nest under their original — the original name is never replaced."}
            </p>
            {query ? (
              <button
                type="button"
                onClick={() => setQueryInput("")}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)]"
              >
                Clear search
              </button>
            ) : (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-white hover:bg-black"
            >
              <Plus className="size-4" strokeWidth={1.75} />
              Add document
            </button>
            )}
          </div>
        ) : (
          <div className="workspace-band">
          <table className="docs-table">
            <DocsTableHead />
            <tbody>
              {padTop > 0 && (
                <tr aria-hidden>
                  <td colSpan={9} style={{ height: padTop, padding: 0 }} />
                </tr>
              )}
              {virtualRows.map((vRow) => {
                const file = files[vRow.index];
                if (!file) return null;
                return (
                  <DocumentRow
                    key={file.id}
                    file={file}
                    open={expandedId === file.id}
                    detail={detailsById[file.id]}
                    deepScanning={deepScanningId === file.id}
                    replacing={replacingId === file.id}
                    deleting={deletingId === file.id}
                    deletingDupId={
                      deletingId &&
                      (file.duplicates ?? []).some((d) => d.id === deletingId)
                        ? deletingId
                        : null
                    }
                    onToggle={toggleRow}
                    onOpenFile={openFile}
                    onPrefetch={prefetchContentURL}
                    onRequestDelete={requestDelete}
                    onRequestDeleteDuplicate={requestDeleteDuplicate}
                    onDeepScan={onDeepScan}
                    onRequestReplace={requestReplace}
                    onEdit={requestEdit}
                  />
                );
              })}
              {padBottom > 0 && (
                <tr aria-hidden>
                  <td colSpan={9} style={{ height: padBottom, padding: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          </div>
        )}

        {!loading && !listFailed && files.length > 0 && (
          <div
            ref={sentinelRef}
            className="flex min-h-12 flex-col items-center justify-center gap-1 px-4 py-4"
            aria-hidden={!loadingMore}
          >
            {loadingMore ? (
              <p className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)]">
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} />
                Loading more…
              </p>
            ) : hasMore ? (
              <p className="text-[12px] text-[var(--muted-soft)]">
                Scroll for more
              </p>
            ) : (
              <p className="text-[12px] text-[var(--muted-soft)]">
                {query ? "End of results" : "All documents loaded"}
              </p>
            )}
          </div>
        )}
      </div>

      {!loading && !listFailed && total > 0 && (
        <div className="page-x flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface)] py-2.5">
          <p className="text-[12px] tabular-nums text-[var(--muted)]">
            Loaded{" "}
            <span className="font-medium text-[var(--ink)]">
              {formatCount(loadedCount)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-[var(--ink)]">
              {formatCount(total)}
            </span>
            {hasMore ? (
              <span className="text-[var(--muted-soft)]"> · scroll for more</span>
            ) : null}
          </p>
          {hasMore && !loadingMore && (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="inline-flex h-8 items-center rounded-lg border border-[var(--border)] bg-white px-2.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
