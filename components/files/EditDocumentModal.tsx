"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Save } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  displayTitle,
  updateFileMeta,
  updateFileSources,
  type DocumentMetaInput,
  type FileRecord,
} from "@/lib/api";
import { validateDocumentFile } from "@/lib/files";
import { detectPdfTitle } from "@/lib/pdfTitle";
import {
  Field,
  MAX_META,
  SourceSlot,
  inputBorder,
  inputClass,
  normalizeMeta,
  validateField,
  type FieldErrors,
  type FieldKey,
  SOURCE_SLOTS,
  sourceKey,
  type SourceKey,
  type SourceSlotNum,
  type TextFields,
} from "@/components/files/documentFormShared";
import {
  IntakeCompareModal,
  type SideBySideCompareTarget,
} from "@/components/files/IntakeCompareModal";
import {
  checkSourceFile,
  idleChecks,
  reconcilePeerChecks,
  type DuplicateCheck,
  type SlotChecks,
} from "@/lib/sourceCheck";
import {
  emptySourceFiles,
  hasAnySource,
  isSourceSlot,
} from "@/lib/sources";

type EditDocumentModalProps = {
  open: boolean;
  file: FileRecord | null;
  onClose: () => void;
  onSaved: (file: FileRecord, opts?: { sourcesChanged?: boolean; message?: string }) => void;
};

type FormState = TextFields & Record<SourceKey, File | null>;

function formFromFile(file: FileRecord): FormState {
  return {
    title: displayTitle(file),
    client_name: file.client_name ?? "",
    erp_code: file.erp_code ?? "",
    anzsco: file.anzsco ?? "",
    team: file.team ?? "",
    member: file.member ?? "",
    ...emptySourceFiles(),
  };
}

function existingSourceName(
  file: FileRecord,
  slot: SourceSlotNum,
): string | null {
  const src = (file.sources ?? []).find((s) => s.slot === slot);
  return src?.original_filename ?? null;
}

export function EditDocumentModal({
  open,
  file,
  onClose,
  onSaved,
}: EditDocumentModalProps) {
  const baseId = useId();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [checks, setChecks] = useState<SlotChecks>(idleChecks);
  const [hashes, setHashes] = useState<Partial<Record<SourceSlotNum, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] =
    useState<SideBySideCompareTarget | null>(null);
  const submittingRef = useRef(false);
  const titleTouchedRef = useRef(false);
  const titleAbortRef = useRef<AbortController | null>(null);
  const titleSeqRef = useRef(0);
  const [titleDetecting, setTitleDetecting] = useState(false);
  const checkAbortRef = useRef<
    Partial<Record<SourceSlotNum, AbortController>>
  >({});
  const fileRef = useRef<FileRecord | null>(file);
  const onCloseRef = useRef(onClose);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  // Prefill only when the modal opens for a document — not on every poll refresh.
  useEffect(() => {
    if (!open) {
      setForm(null);
      setErrors({});
      setChecks(idleChecks());
      setHashes({});
      setSubmitting(false);
      setProgress(null);
      setCompareTarget(null);
      setTitleDetecting(false);
      submittingRef.current = false;
      titleTouchedRef.current = false;
      titleAbortRef.current?.abort();
      titleAbortRef.current = null;
      Object.values(checkAbortRef.current).forEach((c) => c?.abort());
      checkAbortRef.current = {};
      return;
    }
    if (!file) {
      // Row disappeared while editing (e.g. deleted elsewhere).
      onCloseRef.current();
      return;
    }
    setForm(formFromFile(file));
    setErrors({});
    setChecks(idleChecks());
    const seeded: Partial<Record<SourceSlotNum, string>> = {};
    for (const src of file.sources ?? []) {
      if (isSourceSlot(src.slot) && src.sha256_hash) {
        seeded[src.slot] = src.sha256_hash;
      }
    }
    setHashes(seeded);
    setSubmitting(false);
    setProgress(null);
    setTitleDetecting(false);
    submittingRef.current = false;
    titleTouchedRef.current = false;
    titleAbortRef.current?.abort();
    titleAbortRef.current = null;
    Object.values(checkAbortRef.current).forEach((c) => c?.abort());
    checkAbortRef.current = {};
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally key on file.id only
  }, [open, file?.id]);

  const checking = useMemo(
    () => SOURCE_SLOTS.some((s) => checks[s].status === "checking"),
    [checks],
  );

  const handleClose = useCallback(() => {
    if (submittingRef.current) return;
    onCloseRef.current();
  }, []);

  const setTextField = useCallback((key: FieldKey, value: string) => {
    if (key === "title") titleTouchedRef.current = true;
    const next = value.length > MAX_META ? value.slice(0, MAX_META) : value;
    setForm((prev) => (prev ? { ...prev, [key]: next } : prev));
    setErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const { [key]: _drop, form: _form, ...rest } = prev;
      return rest;
    });
  }, []);

  const detectTitleFromFile = useCallback((picked: File) => {
    if (titleTouchedRef.current) return;
    titleAbortRef.current?.abort();
    const controller = new AbortController();
    titleAbortRef.current = controller;
    const seq = ++titleSeqRef.current;
    setTitleDetecting(true);
    void (async () => {
      const result = await detectPdfTitle(picked, { signal: controller.signal });
      if (controller.signal.aborted || seq !== titleSeqRef.current) return;
      setTitleDetecting(false);
      if (!result.title || titleTouchedRef.current) return;
      setForm((prev) => (prev ? { ...prev, title: result.title } : prev));
      setErrors((prev) => {
        if (!prev.title) return prev;
        const { title: _t, ...rest } = prev;
        return rest;
      });
    })();
  }, []);

  const onPickSource = useCallback(
    (slot: SourceSlotNum, picked: File | null) => {
      const key = sourceKey(slot);
      checkAbortRef.current[slot]?.abort();

      if (!picked) {
        setForm((prev) => (prev ? { ...prev, [key]: null } : prev));
        setHashes((prev) => {
          const next = { ...prev };
          delete next[slot];
          const attached = (fileRef.current?.sources ?? []).find(
            (s) => s.slot === slot,
          );
          if (attached?.sha256_hash) next[slot] = attached.sha256_hash;
          return next;
        });
        setChecks((prev) => ({ ...prev, [slot]: { status: "idle" } }));
        setErrors((prev) => {
          if (!prev.sources) return prev;
          const { sources: _s, ...rest } = prev;
          return rest;
        });
        return;
      }
      const msg = validateDocumentFile(picked);
      if (msg) {
        setErrors((prev) => ({ ...prev, sources: `Source ${slot}: ${msg}` }));
        return;
      }
      setForm((prev) => (prev ? { ...prev, [key]: picked } : prev));
      setErrors((prev) => {
        if (!prev.sources && !prev.form) return prev;
        const { sources: _s, form: _f, ...rest } = prev;
        return rest;
      });
      setChecks((prev) => ({ ...prev, [slot]: { status: "checking" } }));
      detectTitleFromFile(picked);

      const controller = new AbortController();
      checkAbortRef.current[slot] = controller;
      const excludeFileId = fileRef.current?.id;
      const current = fileRef.current;
      const nextNames: Partial<Record<SourceSlotNum, string>> = {};
      for (const s of SOURCE_SLOTS) {
        const pickedFile =
          s === slot ? picked : form?.[sourceKey(s)] ?? null;
        if (pickedFile) {
          nextNames[s] = pickedFile.name;
          continue;
        }
        const attached = (current?.sources ?? []).find((src) => src.slot === s);
        if (attached) nextNames[s] = attached.original_filename;
      }
      // Include hashes of attached peers so new uploads match existing sources.
      const nextHashes: Partial<Record<SourceSlotNum, string>> = { ...hashes };
      for (const src of current?.sources ?? []) {
        if (isSourceSlot(src.slot) && src.sha256_hash && !nextHashes[src.slot]) {
          nextHashes[src.slot] = src.sha256_hash;
        }
      }
      const peerFiles: Partial<Record<SourceSlotNum, File | null>> = {};
      for (const s of SOURCE_SLOTS) {
        peerFiles[s] = s === slot ? picked : form?.[sourceKey(s)] ?? null;
      }
      void (async () => {
        try {
          const { sha, check } = await checkSourceFile({
            slot,
            file: picked,
            hashes: nextHashes,
            names: nextNames,
            peerFiles,
            excludeFileId,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setHashes((prev) => {
            const merged = { ...prev, ...nextHashes, [slot]: sha };
            setChecks((prevChecks) =>
              reconcilePeerChecks(merged, nextNames, {
                ...prevChecks,
                [slot]: check,
              }),
            );
            return merged;
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setChecks((prev) => ({
            ...prev,
            [slot]: {
              status: "error",
              message:
                err instanceof Error
                  ? err.message
                  : "Could not check this source for duplicates",
            },
          }));
        }
      })();
    },
    [form, hashes, detectTitleFromFile],
  );

  const validateAll = useCallback((state: FormState): FieldErrors => {
    const next: FieldErrors = {};
    (["title", "client_name", "erp_code", "team", "member", "anzsco"] as FieldKey[]).forEach(
      (key) => {
        const msg = validateField(key, state[key]);
        if (msg) next[key] = msg;
      },
    );
    for (const slot of SOURCE_SLOTS) {
      const f = state[sourceKey(slot)];
      if (!f) continue;
      const msg = validateDocumentFile(f);
      if (msg) {
        next.sources = `Source ${slot}: ${msg}`;
        break;
      }
    }
    return next;
  }, []);

  const metaChanged = (state: FormState, current: FileRecord) => {
    return (
      normalizeMeta(state.title) !== normalizeMeta(displayTitle(current)) ||
      normalizeMeta(state.client_name) !== normalizeMeta(current.client_name ?? "") ||
      normalizeMeta(state.erp_code) !== normalizeMeta(current.erp_code ?? "") ||
      normalizeMeta(state.anzsco) !== normalizeMeta(current.anzsco ?? "") ||
      normalizeMeta(state.team) !== normalizeMeta(current.team ?? "") ||
      normalizeMeta(state.member) !== normalizeMeta(current.member ?? "")
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || checking || !form || !fileRef.current) return;
    const current = fileRef.current;

    const nextErrors = validateAll(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstKey = Object.keys(nextErrors)[0];
      if (
        firstKey === "title" ||
        firstKey === "client_name" ||
        firstKey === "erp_code" ||
        firstKey === "anzsco" ||
        firstKey === "team" ||
        firstKey === "member"
      ) {
        document.getElementById(`${baseId}-${firstKey}`)?.focus();
      }
      return;
    }

    const hasSourceUploads = hasAnySource(form);
    const hasMetaChanges = metaChanged(form, current);
    if (!hasMetaChanges && !hasSourceUploads) {
      setErrors({ form: "No changes to save" });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    let latest = current;
    let sourcesChanged = false;
    let message = "Document updated";

    let metaSaved = false;
    try {
      if (hasMetaChanges) {
        setProgress("Saving details…");
        const meta: DocumentMetaInput = {
          title: normalizeMeta(form.title),
          client_name: normalizeMeta(form.client_name),
          erp_code: normalizeMeta(form.erp_code),
          anzsco: normalizeMeta(form.anzsco),
          team: normalizeMeta(form.team),
          member: normalizeMeta(form.member),
        };
        const res = await updateFileMeta(current.id, meta);
        latest = res.file;
        message = res.message;
        metaSaved = true;
        // Keep parent list in sync even if a later source upload fails.
        onSavedRef.current(latest, { sourcesChanged: false, message });
      }

      if (hasSourceUploads) {
        setProgress("Uploading sources…");
        const res = await updateFileSources(current.id, {
          source_1: form.source_1,
          source_2: form.source_2,
          source_3: form.source_3,
          source_4: form.source_4,
        });
        latest = {
          ...res.file,
          title: latest.title || res.file.title,
          client_name: latest.client_name || res.file.client_name,
          erp_code: latest.erp_code || res.file.erp_code,
          anzsco: latest.anzsco ?? res.file.anzsco,
          team: latest.team || res.file.team,
          member: latest.member || res.file.member,
        };
        sourcesChanged = true;
        message = res.message;
      }

      onSavedRef.current(latest, { sourcesChanged, message });
      onCloseRef.current();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to save document";
      setErrors({
        form: metaSaved
          ? `Details saved, but sources failed: ${msg}`
          : msg,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setProgress(null);
    }
  };

  if (!file || !form) {
    return (
      <Modal open={open} onClose={handleClose} title="Edit document" wide>
        <p className="pb-2 text-[13px] text-[var(--muted)]">Loading…</p>
      </Modal>
    );
  }

  const ids = {
    title: `${baseId}-title`,
    client_name: `${baseId}-client_name`,
    erp_code: `${baseId}-erp_code`,
    anzsco: `${baseId}-anzsco`,
    team: `${baseId}-team`,
    member: `${baseId}-member`,
  };

  const openCompare = (slot: SourceSlotNum, check: DuplicateCheck) => {
    if (!form) return;
    const selected = form[sourceKey(slot)];
    if (!selected) return;
    const peer =
      check.peerSlot != null && isSourceSlot(check.peerSlot)
        ? form[sourceKey(check.peerSlot)]
        : null;
    setCompareTarget({ kind: "intake", selected, check, peerFile: peer });
  };

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit document"
      description="Update intake details and add or replace source PDFs (slots 1–4)."
      wide
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3.5 pb-2" noValidate>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id={ids.title}
              label="PDF title"
              required
              error={errors.title}
              hint={
                titleDetecting
                  ? "Detecting title from the new source…"
                  : "Auto-filled from a new source via the title API (you can edit)."
              }
            >
              <div className="relative">
                <input
                  id={ids.title}
                  name="title"
                  autoComplete="off"
                  className={`${inputClass} ${inputBorder(errors.title)} ${
                    titleDetecting ? "pr-9" : ""
                  }`}
                  value={form.title}
                  onChange={(e) => setTextField("title", e.target.value)}
                  disabled={submitting}
                  maxLength={MAX_META}
                  aria-invalid={Boolean(errors.title)}
                />
                {titleDetecting ? (
                  <Loader2
                    className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--muted)]"
                    strokeWidth={1.75}
                  />
                ) : null}
              </div>
            </Field>
          </div>

          <Field
            id={ids.client_name}
            label="Client name"
            required
            error={errors.client_name}
          >
            <input
              id={ids.client_name}
              name="client_name"
              autoComplete="organization"
              className={`${inputClass} ${inputBorder(errors.client_name)}`}
              value={form.client_name}
              onChange={(e) => setTextField("client_name", e.target.value)}
              disabled={submitting}
              maxLength={MAX_META}
              aria-invalid={Boolean(errors.client_name)}
            />
          </Field>

          <Field id={ids.erp_code} label="ERP code" required error={errors.erp_code}>
            <input
              id={ids.erp_code}
              name="erp_code"
              autoComplete="off"
              className={`${inputClass} ${inputBorder(errors.erp_code)}`}
              value={form.erp_code}
              onChange={(e) => setTextField("erp_code", e.target.value)}
              disabled={submitting}
              maxLength={MAX_META}
              aria-invalid={Boolean(errors.erp_code)}
            />
          </Field>

          <Field id={ids.anzsco} label="ANZSCO" error={errors.anzsco}>
            <input
              id={ids.anzsco}
              name="anzsco"
              autoComplete="off"
              className={`${inputClass} ${inputBorder(errors.anzsco)}`}
              value={form.anzsco}
              onChange={(e) => setTextField("anzsco", e.target.value)}
              placeholder="Optional"
              disabled={submitting}
              maxLength={MAX_META}
            />
          </Field>

          <Field id={ids.team} label="Team" required error={errors.team}>
            <input
              id={ids.team}
              name="team"
              autoComplete="organization-title"
              className={`${inputClass} ${inputBorder(errors.team)}`}
              value={form.team}
              onChange={(e) => setTextField("team", e.target.value)}
              disabled={submitting}
              maxLength={MAX_META}
              aria-invalid={Boolean(errors.team)}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field id={ids.member} label="Member" required error={errors.member}>
              <input
                id={ids.member}
                name="member"
                autoComplete="name"
                className={`${inputClass} ${inputBorder(errors.member)}`}
                value={form.member}
                onChange={(e) => setTextField("member", e.target.value)}
                disabled={submitting}
                maxLength={MAX_META}
                aria-invalid={Boolean(errors.member)}
              />
            </Field>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">
            Sources{" "}
            <span className="font-normal text-[var(--muted-soft)]">
              (up to 4 · add or replace · revalidated on save)
            </span>
          </p>
          <div className="grid items-stretch gap-2 sm:grid-cols-2">
            {SOURCE_SLOTS.map((slot) => (
              <SourceSlot
                key={slot}
                slot={slot}
                file={form[sourceKey(slot)]}
                existingName={existingSourceName(file, slot)}
                disabled={submitting}
                check={checks[slot]}
                onPick={(f) => onPickSource(slot, f)}
                onClear={() => onPickSource(slot, null)}
                onViewOriginal={
                  checks[slot].status === "duplicate"
                    ? () => {
                        const c = checks[slot];
                        if (c.status === "duplicate") openCompare(slot, c);
                      }
                    : undefined
                }
              />
            ))}
          </div>
          <p
            role={errors.sources ? "alert" : undefined}
            className={[
              "mt-1.5 h-4 text-[11px]",
              errors.sources ? "text-red-600" : "text-transparent",
            ].join(" ")}
          >
            {errors.sources || "\u00a0"}
          </p>
        </div>

        {(errors.form || progress) && (
          <div
            role={errors.form ? "alert" : "status"}
            className={[
              "rounded-xl border px-3 py-2 text-[12.5px]",
              errors.form
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-[var(--border)] bg-[var(--canvas)] text-[var(--muted)]",
            ].join(" ")}
          >
            {errors.form || progress}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            disabled={submitting}
            onClick={handleClose}
            className="inline-flex h-9 items-center rounded-xl px-3.5 text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || checking}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[var(--ink)] px-3.5 text-[13px] font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {submitting || checking ? (
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
            ) : (
              <Save className="size-4" strokeWidth={1.75} />
            )}
            {checking ? "Checking…" : submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
    <IntakeCompareModal
      open={compareTarget != null}
      target={compareTarget}
      onClose={() => setCompareTarget(null)}
    />
    </>
  );
}
