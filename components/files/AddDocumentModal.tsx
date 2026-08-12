"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Loader2, Upload, Eye, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  uploadFile,
  type DocumentMetaInput,
  type MetaProfile,
  type UploadResponse,
} from "@/lib/api";
import { formatBytes, validateDocumentFile } from "@/lib/files";
import { detectPdfTitle } from "@/lib/pdfTitle";
import {
  Field,
  MAX_META,
  SOURCE_SLOTS,
  SourceDropzone,
  applyMetaProfile,
  inputBorder,
  inputClass,
  normalizeMeta,
  titleFromFilename,
  validateField,
  validateSources,
  type FieldErrors,
  type FieldKey,
  sourceKey,
  type SourceKey,
  type SourceSlotNum,
  type TextFields,
} from "@/components/files/documentFormShared";
import { MetaSuggestField } from "@/components/files/MetaSuggestField";
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
import { emptySourceFiles, SOURCE_SLOT_COUNT } from "@/lib/sources";

type AddDocumentModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: (res: UploadResponse) => void;
  /** Called the instant submit is accepted so the UI can paint an optimistic row. */
  onUploadQueued?: (pending: {
    tempId: string;
    meta: DocumentMetaInput;
    filename: string;
    byteSize: number;
  }) => void;
  onUploadFailed?: (tempId: string, message: string) => void;
};

type FormState = Omit<TextFields, "title"> & Record<SourceKey, File | null>;

const emptyForm: FormState = {
  client_name: "",
  erp_code: "",
  anzsco: "",
  team: "",
  member: "",
  ...emptySourceFiles(),
};

export function AddDocumentModal({
  open,
  onClose,
  onUploaded,
  onUploadQueued,
  onUploadFailed,
}: AddDocumentModalProps) {
  const baseId = useId();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [checks, setChecks] = useState<SlotChecks>(idleChecks);
  const [hashes, setHashes] = useState<Partial<Record<SourceSlotNum, string>>>(
    {},
  );
  const [submitting, setSubmitting] = useState(false);
  const [sourceTitles, setSourceTitles] = useState<
    Partial<Record<SourceSlotNum, string>>
  >({});
  const [detectingSlots, setDetectingSlots] = useState<
    Partial<Record<SourceSlotNum, boolean>>
  >({});
  const [compareTarget, setCompareTarget] =
    useState<SideBySideCompareTarget | null>(null);
  const submittingRef = useRef(false);
  const checkAbortRef = useRef<
    Partial<Record<SourceSlotNum, AbortController>>
  >({});
  const titleAbortBySlotRef = useRef<
    Partial<Record<SourceSlotNum, AbortController>>
  >({});
  const titleSeqBySlotRef = useRef<Partial<Record<SourceSlotNum, number>>>({});
  const onClosePropRef = useRef(onClose);
  const onUploadedRef = useRef(onUploaded);
  const onUploadQueuedRef = useRef(onUploadQueued);
  const onUploadFailedRef = useRef(onUploadFailed);

  useEffect(() => {
    onClosePropRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  useEffect(() => {
    onUploadQueuedRef.current = onUploadQueued;
  }, [onUploadQueued]);
  useEffect(() => {
    onUploadFailedRef.current = onUploadFailed;
  }, [onUploadFailed]);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setErrors({});
    setChecks(idleChecks());
    setHashes({});
    setSubmitting(false);
    setSourceTitles({});
    setDetectingSlots({});
    setCompareTarget(null);
    submittingRef.current = false;
    Object.values(titleAbortBySlotRef.current).forEach((c) => c?.abort());
    titleAbortBySlotRef.current = {};
    titleSeqBySlotRef.current = {};
    Object.values(checkAbortRef.current).forEach((c) => c?.abort());
    checkAbortRef.current = {};
  }, [open]);

  const detectSlotTitle = useCallback((slot: SourceSlotNum, file: File) => {
    titleAbortBySlotRef.current[slot]?.abort();
    const fallback = titleFromFilename(file.name);
    setSourceTitles((prev) => ({ ...prev, [slot]: fallback }));
    setDetectingSlots((prev) => ({ ...prev, [slot]: true }));

    const controller = new AbortController();
    titleAbortBySlotRef.current[slot] = controller;
    const seq = (titleSeqBySlotRef.current[slot] ?? 0) + 1;
    titleSeqBySlotRef.current[slot] = seq;

    void (async () => {
      const result = await detectPdfTitle(file, {
        signal: controller.signal,
      });
      if (controller.signal.aborted || titleSeqBySlotRef.current[slot] !== seq) {
        return;
      }
      setDetectingSlots((prev) => ({ ...prev, [slot]: false }));
      setSourceTitles((prev) => ({
        ...prev,
        [slot]: result.title || prev[slot] || fallback,
      }));
    })();
  }, []);

  const openCompare = useCallback(
    (slot: SourceSlotNum, check: DuplicateCheck) => {
      const selected = form[sourceKey(slot)];
      if (!selected) return;
      const peer =
        check.peerSlot != null
          ? form[sourceKey(check.peerSlot as SourceSlotNum)]
          : null;
      setCompareTarget({ kind: "intake", selected, check, peerFile: peer });
    },
    [form],
  );

  const checking = SOURCE_SLOTS.some(
    (slot) => checks[slot]?.status === "checking",
  );

  const filledSourceCount = SOURCE_SLOTS.filter(
    (slot) => form[sourceKey(slot)],
  ).length;
  const remainingSlots = SOURCE_SLOT_COUNT - filledSourceCount;

  const handleClose = useCallback(() => {
    if (submittingRef.current) return;
    onClosePropRef.current();
  }, []);

  const setTextField = useCallback((key: FieldKey, value: string) => {
    if (key === "title") return;
    const next = value.length > MAX_META ? value.slice(0, MAX_META) : value;
    setForm((prev) => ({ ...prev, [key]: next }));
    setErrors((prev) => {
      if (!prev[key] && !prev.form) return prev;
      const { [key]: _drop, form: _form, ...rest } = prev;
      return rest;
    });
  }, []);

  const applyProfile = useCallback((profile: MetaProfile) => {
    setForm((prev) => applyMetaProfile(prev, profile));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.client_name;
      delete next.erp_code;
      delete next.anzsco;
      delete next.team;
      delete next.member;
      delete next.form;
      return next;
    });
  }, []);

  const runCheck = useCallback(
    async (
      slot: SourceSlotNum,
      file: File,
      nextHashes: Partial<Record<SourceSlotNum, string>>,
      nextNames: Partial<Record<SourceSlotNum, string>>,
      peerFiles: Partial<Record<SourceSlotNum, File | null>>,
    ) => {
      checkAbortRef.current[slot]?.abort();
      const controller = new AbortController();
      checkAbortRef.current[slot] = controller;
      setChecks((prev) => ({ ...prev, [slot]: { status: "checking" } }));
      try {
        const { sha, check } = await checkSourceFile({
          slot,
          file,
          hashes: nextHashes,
          names: nextNames,
          peerFiles,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setHashes((prev) => {
          const merged = { ...prev, [slot]: sha };
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
    },
    [],
  );

  const onPickSource = useCallback(
    (slot: SourceSlotNum, picked: File | null) => {
      const key = sourceKey(slot);
      checkAbortRef.current[slot]?.abort();

      if (!picked) {
        titleAbortBySlotRef.current[slot]?.abort();
        delete titleAbortBySlotRef.current[slot];
        setForm((prev) => ({ ...prev, [key]: null }));
        setSourceTitles((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
        setDetectingSlots((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
        setHashes((prev) => {
          const next = { ...prev };
          delete next[slot];
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

      setForm((prev) => {
        const next = { ...prev, [key]: picked };
        const nextNames: Partial<Record<SourceSlotNum, string>> = {};
        const peerFiles: Partial<Record<SourceSlotNum, File | null>> = {};
        for (const s of SOURCE_SLOTS) {
          const f = s === slot ? picked : next[sourceKey(s)];
          peerFiles[s] = f;
          if (f) nextNames[s] = f.name;
        }
        void runCheck(slot, picked, hashes, nextNames, peerFiles);
        return next;
      });
      detectSlotTitle(slot, picked);
      setErrors((prev) => {
        if (!prev.sources && !prev.form) return prev;
        const { sources: _s, form: _f, ...rest } = prev;
        return rest;
      });
      setChecks((prev) => ({ ...prev, [slot]: { status: "checking" } }));
    },
    [runCheck, detectSlotTitle, hashes],
  );

  const onAddFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const emptySlots = SOURCE_SLOTS.filter((s) => !form[sourceKey(s)]);
      if (emptySlots.length === 0) {
        setErrors((prev) => ({
          ...prev,
          sources: "All 4 source slots are filled",
        }));
        return;
      }

      let error: string | undefined;
      const accepted: { slot: SourceSlotNum; file: File }[] = [];
      for (let i = 0; i < files.length && i < emptySlots.length; i++) {
        const file = files[i]!;
        const msg = validateDocumentFile(file);
        if (msg) {
          error = `Source ${emptySlots[i]}: ${msg}`;
          break;
        }
        accepted.push({ slot: emptySlots[i]!, file });
      }
      if (error) {
        setErrors((prev) => ({ ...prev, sources: error }));
        return;
      }
      if (accepted.length === 0) return;

      setForm((prev) => {
        const next = { ...prev };
        for (const { slot, file } of accepted) {
          next[sourceKey(slot)] = file;
        }
        const nextNames: Partial<Record<SourceSlotNum, string>> = {};
        const peerFiles: Partial<Record<SourceSlotNum, File | null>> = {};
        for (const s of SOURCE_SLOTS) {
          const f = next[sourceKey(s)];
          peerFiles[s] = f;
          if (f) nextNames[s] = f.name;
        }
        for (const { slot, file } of accepted) {
          detectSlotTitle(slot, file);
          setChecks((c) => ({ ...c, [slot]: { status: "checking" } }));
          void runCheck(slot, file, hashes, nextNames, peerFiles);
        }
        return next;
      });
      setErrors((prev) => {
        if (!prev.sources && !prev.form) return prev;
        const { sources: _s, form: _f, ...rest } = prev;
        return rest;
      });
    },
    [form, hashes, runCheck, detectSlotTitle],
  );

  const validateAll = useCallback(
    (state: FormState): FieldErrors => {
      const next: FieldErrors = {};
      (
        ["client_name", "erp_code", "team", "member", "anzsco"] as const
      ).forEach((key) => {
        const msg = validateField(key, state[key], { titleRequired: false });
        if (msg) next[key] = msg;
      });
      const sourcesMsg = validateSources(
        {
          source_1: state.source_1,
          source_2: state.source_2,
          source_3: state.source_3,
          source_4: state.source_4,
        },
        { requireAtLeastOne: true },
      );
      if (sourcesMsg) next.sources = sourcesMsg;
      return next;
    },
    [],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || checking) return;

    const nextErrors = validateAll(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstKey = Object.keys(nextErrors)[0];
      if (
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

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});

    const primary =
      form.source_1 || form.source_2 || form.source_3 || form.source_4;
    const primarySlot = (SOURCE_SLOTS.find((s) => form[sourceKey(s)]) ??
      1) as SourceSlotNum;
    const resolvedTitle =
      normalizeMeta(sourceTitles[primarySlot] || "") ||
      (primary ? titleFromFilename(primary.name) : "");
    const meta: DocumentMetaInput = {
      title: resolvedTitle,
      client_name: normalizeMeta(form.client_name),
      erp_code: normalizeMeta(form.erp_code),
      anzsco: normalizeMeta(form.anzsco),
      team: normalizeMeta(form.team),
      member: normalizeMeta(form.member),
    };
    const tempId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `tmp-${crypto.randomUUID()}`
        : `tmp-${Date.now()}`;
    const snapshot = {
      source_1: form.source_1,
      source_2: form.source_2,
      source_3: form.source_3,
      source_4: form.source_4,
    };
    const titlesSnapshot: Partial<Record<SourceSlotNum, string>> = {
      ...sourceTitles,
    };
    for (const slot of SOURCE_SLOTS) {
      const f = snapshot[sourceKey(slot)];
      if (!f) continue;
      if (!(titlesSnapshot[slot] || "").trim()) {
        titlesSnapshot[slot] = titleFromFilename(f.name);
      }
    }

    onUploadQueuedRef.current?.({
      tempId,
      meta,
      filename: primary?.name || "document.pdf",
      byteSize: primary?.size ?? 0,
    });
    onClosePropRef.current();
    setForm(emptyForm);
    setChecks(idleChecks);
    setHashes({});
    setSourceTitles({});
    setDetectingSlots({});
    setSubmitting(false);
    submittingRef.current = false;

    void (async () => {
      try {
        for (const slot of SOURCE_SLOTS) {
          const f = snapshot[sourceKey(slot)];
          if (!f) continue;
          if ((titlesSnapshot[slot] || "").trim()) continue;
          const result = await detectPdfTitle(f);
          titlesSnapshot[slot] = result.title || titleFromFilename(f.name);
        }
        const res = await uploadFile(meta, snapshot, titlesSnapshot);
        onUploadedRef.current(res);
      } catch (err) {
        onUploadFailedRef.current?.(
          tempId,
          err instanceof Error ? err.message : "Upload failed",
        );
      }
    })();
  };

  const ids = {
    client_name: `${baseId}-client_name`,
    erp_code: `${baseId}-erp_code`,
    anzsco: `${baseId}-anzsco`,
    team: `${baseId}-team`,
    member: `${baseId}-member`,
  };

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      title="Add document"
      description="Upload 1–4 source PDFs, then complete intake details."
      wide
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3.5 pb-2" noValidate>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">
            Sources{" "}
            <span className="font-normal text-[var(--muted-soft)]">
              (required · up to 4 · {filledSourceCount}/4)
            </span>
          </p>
          <div className="space-y-2">
            <SourceDropzone
              disabled={submitting}
              remaining={remainingSlots}
              onPickMany={onAddFiles}
            />
            {filledSourceCount > 0 ? (
              <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                {SOURCE_SLOTS.map((slot) => {
                  const file = form[sourceKey(slot)];
                  if (!file) return null;
                  const check = checks[slot];
                  const detecting = Boolean(detectingSlots[slot]);
                  const title =
                    (sourceTitles[slot] || "").trim() ||
                    titleFromFilename(file.name);
                  const status = (() => {
                    if (detecting) return { label: "Detecting…", tone: "text-[var(--muted)]", spin: true };
                    if (check?.status === "checking")
                      return { label: "Checking…", tone: "text-[#3b5bcc]", spin: true };
                    if (check?.status === "duplicate")
                      return {
                        label: check.near ? "Near match" : "Duplicate",
                        tone: "text-orange-800",
                        spin: false,
                      };
                    if (check?.status === "error")
                      return { label: "Check failed", tone: "text-red-600", spin: false };
                    if (check?.status === "unique")
                      return { label: "Ready", tone: "text-emerald-700", spin: false };
                    return { label: "Selected", tone: "text-[var(--muted)]", spin: false };
                  })();
                  return (
                    <li
                      key={slot}
                      className="flex items-start gap-3 px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-semibold tabular-nums text-[var(--muted)] ring-1 ring-[var(--border)]">
                        {slot}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-medium text-[var(--ink)]"
                          title={title}
                        >
                          {title}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]">
                          {file.name}
                          <span className="mx-1.5 text-[var(--border-strong)]">·</span>
                          <span className="tabular-nums">{formatBytes(file.size)}</span>
                        </p>
                        <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${status.tone}`}>
                          {status.spin ? (
                            <Loader2 className="size-3 animate-spin" strokeWidth={1.75} />
                          ) : null}
                          {status.label}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {check?.status === "duplicate" ? (
                          <button
                            type="button"
                            onClick={() => openCompare(slot, check)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11.5px] font-medium text-orange-800 hover:bg-orange-50"
                            title="Compare with matched original"
                          >
                            <Eye className="size-3.5" strokeWidth={1.75} />
                            Compare
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => onPickSource(slot, null)}
                          className="inline-flex size-7 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-white hover:text-[var(--ink)] disabled:opacity-50"
                          aria-label={`Remove source ${slot}`}
                        >
                          <X className="size-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
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

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field
            id={ids.client_name}
            label="Client name"
            required
            error={errors.client_name}
          >
            <MetaSuggestField
              id={ids.client_name}
              name="client_name"
              field="client_name"
              autoComplete="organization"
              value={form.client_name}
              onChange={(v) => setTextField("client_name", v)}
              onSelectProfile={applyProfile}
              placeholder="Client full name"
              disabled={submitting}
              error={errors.client_name}
              aria-invalid={Boolean(errors.client_name)}
            />
          </Field>

          <Field id={ids.erp_code} label="ERP code" required error={errors.erp_code}>
            <MetaSuggestField
              id={ids.erp_code}
              name="erp_code"
              field="erp_code"
              value={form.erp_code}
              onChange={(v) => setTextField("erp_code", v)}
              onSelectProfile={applyProfile}
              placeholder="e.g. ERP-10234"
              disabled={submitting}
              error={errors.erp_code}
              aria-invalid={Boolean(errors.erp_code)}
            />
          </Field>

          <Field id={ids.anzsco} label="ANZSCO" error={errors.anzsco}>
            <MetaSuggestField
              id={ids.anzsco}
              name="anzsco"
              field="anzsco"
              value={form.anzsco}
              onChange={(v) => setTextField("anzsco", v)}
              onSelectProfile={applyProfile}
              placeholder="Optional"
              disabled={submitting}
              error={errors.anzsco}
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
              placeholder="e.g. Assessment"
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
                placeholder="Responsible team member"
                disabled={submitting}
                maxLength={MAX_META}
                aria-invalid={Boolean(errors.member)}
              />
            </Field>
          </div>
        </div>

        {errors.form && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
          >
            {errors.form}
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
              <Upload className="size-4" strokeWidth={1.75} />
            )}
            {checking
              ? "Checking…"
              : submitting
                ? "Uploading…"
                : "Upload document"}
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
