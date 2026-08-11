"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanSearch,
  Upload,
} from "lucide-react";
import {
  getFileStatus,
  requestDeepScan,
  uploadFile,
} from "@/lib/api";
import { MatchResults } from "@/components/files/MatchResults";
import { useUploadStore } from "@/store/upload-store";

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Processing";
    case "tier1_done":
      return "Tier 1 complete";
    case "tier2_done":
      return "Deep Scan complete";
    case "duplicate":
      return "Duplicate flagged";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deepScanning, setDeepScanning] = useState(false);

  const activeFile = useUploadStore((s) => s.activeFile);
  const matches = useUploadStore((s) => s.matches);
  const tier0Duplicate = useUploadStore((s) => s.tier0Duplicate);
  const message = useUploadStore((s) => s.message);
  const error = useUploadStore((s) => s.error);
  const uploading = useUploadStore((s) => s.uploading);
  const polling = useUploadStore((s) => s.polling);
  const setUploading = useUploadStore((s) => s.setUploading);
  const setPolling = useUploadStore((s) => s.setPolling);
  const setFromUpload = useUploadStore((s) => s.setFromUpload);
  const setStatus = useUploadStore((s) => s.setStatus);
  const setError = useUploadStore((s) => s.setError);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, [setPolling]);

  const startPolling = useCallback(
    (fileId: string) => {
      stopPolling();
      setPolling(true);

      const tick = async () => {
        try {
          const status = await getFileStatus(fileId);
          setStatus(status.file, status.matches);
          if (status.terminal && !status.file.needs_ocr) {
            stopPolling();
          }
          // Keep polling while needs_ocr auto Deep Scan is in flight
          if (
            status.terminal &&
            status.file.needs_ocr &&
            status.file.status === "pending"
          ) {
            // still waiting on tier2 auto-queue
            return;
          }
          if (
            status.file.status === "tier2_done" ||
            status.file.status === "duplicate" ||
            status.file.status === "failed" ||
            (status.file.status === "tier1_done" && !status.file.needs_ocr)
          ) {
            stopPolling();
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Status poll failed");
          stopPolling();
        }
      };

      void tick();
      pollRef.current = setInterval(() => {
        void tick();
      }, 1500);
    },
    [setError, setPolling, setStatus, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleFiles = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    stopPolling();

    try {
      const res = await uploadFile(
        {
          client_name: "Legacy upload",
          erp_code: "N/A",
          anzsco: "",
          team: "Default",
          member: "System",
        },
        { source_1: file },
      );
      setFromUpload(res.file, res.tier0_duplicate, res.message);
      if (!res.tier0_duplicate) {
        startPolling(res.file.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDeepScan = async () => {
    if (!activeFile) return;
    setDeepScanning(true);
    setError(null);
    try {
      const res = await requestDeepScan(activeFile.id);
      setFromUpload(activeFile, false, res.message);
      startPolling(activeFile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deep Scan failed");
    } finally {
      setDeepScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="mb-5">
          <h2 className="text-[1.15rem] font-semibold tracking-[-0.03em] text-[var(--ink)]">
            Upload
          </h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Tier 0 checks bytes instantly. Tier 1 reads the PDF text layer only —
            Deep Scan runs OCR when you ask, or when a file has no text layer.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={[
            "flex min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
              : "border-[var(--border-strong)] bg-[var(--surface-muted)]/50",
          ].join(" ")}
        >
          <span className="mb-3 inline-flex size-11 items-center justify-center rounded-2xl bg-white text-[var(--ink)] shadow-[var(--shadow-soft)]">
            {uploading ? (
              <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Upload className="size-5" strokeWidth={1.75} />
            )}
          </span>
          <p className="text-[14.5px] font-medium tracking-[-0.01em] text-[var(--ink)]">
            {uploading ? "Uploading…" : "Drop a document here"}
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">
            PDF, PNG, JPG up to 50MB
          </p>
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[var(--ink)] px-4 text-[13px] font-medium text-white transition-[transform,background-color] duration-200 hover:bg-black disabled:opacity-50 active:scale-[0.98]"
          >
            Choose file
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.webp"
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] text-red-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}
      </section>

      {activeFile && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
                {activeFile.original_filename}
              </p>
              <p className="mt-1 font-mono text-[11.5px] text-[var(--muted)]">
                {activeFile.id}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--ink)]">
                  {(polling || uploading) && (
                    <Loader2 className="size-3 animate-spin" strokeWidth={2} />
                  )}
                  {statusLabel(activeFile.status)}
                </span>
                {tier0Duplicate && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--accent)]">
                    <CheckCircle2 className="size-3" strokeWidth={2} />
                    Tier 0 exact match
                  </span>
                )}
              </div>
              {message && (
                <p className="mt-2 text-[12.5px] text-[var(--muted)]">{message}</p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void onDeepScan()}
              disabled={deepScanning || uploading}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-white px-4 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            >
              {deepScanning ? (
                <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <ScanSearch className="size-4" strokeWidth={1.75} />
              )}
              Deep Scan
            </button>
          </div>

          {activeFile.needs_ocr && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-700"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-[13px] font-medium text-amber-900">
                  No text layer found — Deep Scan started automatically
                </p>
                <p className="mt-0.5 text-[12.5px] text-amber-800/80">
                  This looks like a scanned document. Full OCR is running so we
                  can fingerprint its content. This is not a silent background
                  action.
                </p>
              </div>
            </div>
          )}

          <MatchResults
            sourceFile={activeFile}
            matches={matches}
            tier0Duplicate={tier0Duplicate}
          />
        </section>
      )}
    </div>
  );
}
