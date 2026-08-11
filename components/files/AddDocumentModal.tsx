"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import {
  uploadFile,
  type DocumentMetaInput,
  type UploadResponse,
} from "@/lib/api";
import { validateDocumentFile } from "@/lib/files";
import {
  Field,
  MAX_META,
  SourceSlot,
  inputBorder,
  inputClass,
  normalizeMeta,
  titleFromFilename,
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
  firstPickedSource,
  hasAnySource,
} from "@/lib/sources";

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
  const [compareTarget, setCompareTarget] =
    useState<SideBySideCompareTarget | null>(null);
  const submittingRef = useRef(false);
  const checkAbortRef = useRef<
    Partial<Record<SourceSlotNum, AbortController>>
  >({});
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
    setCompareTarget(null);
    submittingRef.current = false;
    Object.values(checkAbortRef.current).forEach((c) => c?.abort());
    checkAbortRef.current = {};
  }, [open]);

  const autoTitle = useMemo(() => {
    const first = firstPickedSource(form);
    if (!first) return "";
    return titleFromFilename(first.name);
  }, [form]);

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

  const checking = useMemo(
    () => SOURCE_SLOTS.some((s) => checks[s].status === "checking"),
    [checks],
  );

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
    (slot: SourceSlotNum, file: File | null) => {
      const key = sourceKey(slot);
      checkAbortRef.current[slot]?.abort();

      if (!file) {
        setForm((prev) => ({ ...prev, [key]: null }));
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

      const msg = validateDocumentFile(file);
      if (msg) {
        setErrors((prev) => ({ ...prev, sources: `Source ${slot}: ${msg}` }));
        return;
      }

      setForm((prev) => ({ ...prev, [key]: file }));
      setErrors((prev) => {
        if (!prev.sources && !prev.form) return prev;
        const { sources: _s, form: _f, ...rest } = prev;
        return rest;
      });

      const peerFiles: Partial<Record<SourceSlotNum, File | null>> = {};
      for (const s of SOURCE_SLOTS) {
        peerFiles[s] = s === slot ? file : form[sourceKey(s)];
      }
      const nextNames: Partial<Record<SourceSlotNum, string>> = {};
      for (const s of SOURCE_SLOTS) {
        const f = peerFiles[s];
        if (f) nextNames[s] = f.name;
      }
      void runCheck(slot, file, hashes, nextNames, peerFiles);
    },
    [form, hashes, runCheck],
  );

  const validateAll = useCallback((state: FormState): FieldErrors => {
    const next: FieldErrors = {};
    (
      ["client_name", "erp_code", "team", "member", "anzsco"] as const
    ).forEach((key) => {
      const msg = validateField(key, state[key], { titleRequired: false });
      if (msg) next[key] = msg;
    });
    if (!hasAnySource(state)) {
      next.sources = "Upload at least one source PDF";
    } else {
      for (const slot of SOURCE_SLOTS) {
        const f = state[sourceKey(slot)];
        if (!f) continue;
        const msg = validateDocumentFile(f);
        if (msg) {
          next.sources = `Source ${slot}: ${msg}`;
          break;
        }
      }
    }
    return next;
  }, []);

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

    const meta: DocumentMetaInput = {
      client_name: normalizeMeta(form.client_name),
      erp_code: normalizeMeta(form.erp_code),
      anzsco: normalizeMeta(form.anzsco),
      team: normalizeMeta(form.team),
      member: normalizeMeta(form.member),
    };
    const primary = firstPickedSource(form);
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

    // Close immediately and paint an optimistic row — the network wait
    // happens in the background so the modal never feels stuck.
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
    setSubmitting(false);
    submittingRef.current = false;

    void (async () => {
      try {
        const res = await uploadFile(meta, snapshot);
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
    title: `${baseId}-title`,
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
      description="Upload sources first, then complete intake details."
      wide
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3.5 pb-2" noValidate>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">
            Sources{" "}
            <span className="font-normal text-[var(--muted-soft)]">
              (up to 4 · at least one required)
            </span>
          </p>
          <div className="grid items-stretch gap-2 sm:grid-cols-2">
            {SOURCE_SLOTS.map((slot) => (
              <SourceSlot
                key={slot}
                slot={slot}
                file={form[sourceKey(slot)]}
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

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id={ids.title}
              label="PDF title"
              hint="Detected from the first uploaded source filename."
            >
              <div
                id={ids.title}
                className={`${inputClass} ${inputBorder()} flex items-center text-[var(--muted)]`}
                aria-live="polite"
              >
                {autoTitle || "Upload a source to detect title"}
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
              placeholder="Client full name"
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
              placeholder="e.g. ERP-10234"
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
