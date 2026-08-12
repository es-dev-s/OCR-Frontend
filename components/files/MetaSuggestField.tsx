"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import {
  suggestDocumentMeta,
  type MetaProfile,
  type MetaSuggestField as SuggestField,
} from "@/lib/api";
import {
  inputBorder,
  inputClass,
  MAX_META,
  normalizeMeta,
} from "@/components/files/documentFormShared";

const DEBOUNCE_MS = 120;
const MIN_QUERY = 1;
const CACHE_TTL_MS = 30_000;
const PANEL_GAP = 4;
const VIEW_PAD = 8;

type CacheEntry = { at: number; items: MetaProfile[] };
const suggestCache = new Map<string, CacheEntry>();

function cacheKey(field: SuggestField, q: string) {
  return `${field}:${q.toLowerCase()}`;
}

function fieldLabel(field: SuggestField): string {
  switch (field) {
    case "client_name":
      return "Client";
    case "erp_code":
      return "ERP";
    case "anzsco":
      return "ANZSCO";
  }
}

function primaryValue(p: MetaProfile, field: SuggestField): string {
  switch (field) {
    case "client_name":
      return p.client_name;
    case "erp_code":
      return p.erp_code;
    case "anzsco":
      return p.anzsco;
  }
}

function metaKey(v: string): string {
  return normalizeMeta(v).toLowerCase();
}

function highlightMatch(text: string, query: string): ReactNode {
  const t = text || "";
  const q = query.trim();
  if (!q || !t) return t || "—";
  const lower = t.toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi < 0) return t;
  return (
    <>
      {t.slice(0, qi)}
      <mark className="rounded-[2px] bg-[var(--accent-soft)] text-[inherit]">
        {t.slice(qi, qi + q.length)}
      </mark>
      {t.slice(qi + q.length)}
    </>
  );
}

type PanelBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type Props = {
  id: string;
  name: SuggestField;
  field: SuggestField;
  value: string;
  onChange: (value: string) => void;
  onSelectProfile: (profile: MetaProfile) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  "aria-invalid"?: boolean;
};

export function MetaSuggestField({
  id,
  name,
  field,
  value,
  onChange,
  onSelectProfile,
  disabled,
  error,
  placeholder,
  autoComplete = "off",
  "aria-invalid": ariaInvalid,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const skipSuggestRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MetaProfile[]>([]);
  const [active, setActive] = useState(0);
  const [panel, setPanel] = useState<PanelBox | null>(null);

  const placePanel = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    // Keep the menu flush with the input — never wider than the field.
    let left = Math.round(rect.left);
    let width = Math.round(rect.width);

    // Clamp inside the modal form scroller (or viewport) so edges never poke out.
    const scroller = el.closest(".docs-scroll") as HTMLElement | null;
    const box = (scroller?.getBoundingClientRect() ?? {
      left: VIEW_PAD,
      right: window.innerWidth - VIEW_PAD,
      top: VIEW_PAD,
      bottom: window.innerHeight - VIEW_PAD,
    }) as DOMRect | { left: number; right: number; top: number; bottom: number };

    if (left < box.left) {
      width -= box.left - left;
      left = box.left;
    }
    if (left + width > box.right) {
      width = Math.max(0, Math.round(box.right - left));
    }

    const spaceBelow = box.bottom - rect.bottom - PANEL_GAP;
    const spaceAbove = rect.top - box.top - PANEL_GAP;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      96,
      Math.min(240, openUp ? spaceAbove : spaceBelow),
    );

    setPanel({
      top: openUp
        ? Math.round(rect.top - PANEL_GAP - maxHeight)
        : Math.round(rect.bottom + PANEL_GAP),
      left,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanel(null);
      return;
    }
    placePanel();
    const onReposition = () => placePanel();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, items.length, placePanel]);

  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const q = normalizeMeta(value);
    if (disabled || q.length < MIN_QUERY) {
      abortRef.current?.abort();
      setItems([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const key = cacheKey(field, q);
    const cached = suggestCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setItems(cached.items);
      setActive(0);
      setOpen(cached.items.length > 0);
      setLoading(false);
      return;
    }

    const seq = ++seqRef.current;
    const timer = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      void (async () => {
        try {
          const next = await suggestDocumentMeta({
            field,
            q,
            limit: 8,
            signal: controller.signal,
          });
          if (seqRef.current !== seq) return;
          suggestCache.set(key, { at: Date.now(), items: next });
          setItems(next);
          setActive(0);
          setOpen(
            next.length > 0 && document.activeElement === inputRef.current,
          );
        } catch {
          if (controller.signal.aborted) return;
          if (seqRef.current !== seq) return;
          setItems([]);
          setOpen(false);
        } finally {
          if (seqRef.current === seq) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, field, disabled]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      const panelEl = document.getElementById(listId);
      if (panelEl?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, listId]);

  const apply = (profile: MetaProfile) => {
    skipSuggestRef.current = true;
    onSelectProfile(profile);
    setOpen(false);
    setItems([]);
    setLoading(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = items[active];
      if (pick) apply(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const showMenu = open && panel && items.length > 0 && panel.width > 0;

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <div className="relative w-full min-w-0">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && items[active] ? `${listId}-opt-${active}` : undefined
          }
          autoComplete={autoComplete}
          className={`${inputClass} ${inputBorder(error)} ${loading ? "pr-8" : ""}`}
          value={value}
          onChange={(e) => {
            const next =
              e.target.value.length > MAX_META
                ? e.target.value.slice(0, MAX_META)
                : e.target.value;
            onChange(next);
          }}
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={MAX_META}
          aria-invalid={ariaInvalid}
        />
        {loading ? (
          <Loader2
            className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-[var(--muted)]"
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
      </div>

      {showMenu && panel
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              aria-label={`${fieldLabel(field)} matches`}
              className="meta-suggest-scroll fixed z-[120] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-strong)] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,32,0.12)]"
              style={{
                top: panel.top,
                left: panel.left,
                width: panel.width,
                maxHeight: panel.maxHeight,
              }}
            >
              {items.map((p, i) => {
                const primary = primaryValue(p, field);
                const isActive = i === active;
                const secondary = [
                  field !== "client_name" ? p.client_name : null,
                  field !== "erp_code" ? p.erp_code : null,
                  field !== "anzsco" && p.anzsco ? p.anzsco : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                const metaBits = [p.team, p.member]
                  .filter((x) => metaKey(x))
                  .join(" · ");

                return (
                  <li
                    key={`${metaKey(p.client_name)}|${metaKey(p.erp_code)}|${metaKey(p.anzsco)}|${i}`}
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={isActive}
                    className={[
                      "mx-1 cursor-pointer rounded-md px-2 py-1.5 transition-colors",
                      isActive
                        ? "bg-[var(--surface-muted)]"
                        : "hover:bg-[var(--canvas)]",
                    ].join(" ")}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      apply(p);
                    }}
                  >
                    <p className="truncate pr-1 text-[13px] font-medium leading-snug text-[var(--ink)]">
                      {highlightMatch(primary, value)}
                    </p>
                    {secondary ? (
                      <p className="mt-0.5 truncate pr-1 text-[11.5px] leading-snug text-[var(--muted)]">
                        {secondary}
                      </p>
                    ) : null}
                    {metaBits ? (
                      <p className="mt-0.5 truncate pr-1 text-[11px] leading-snug text-[var(--muted-soft)]">
                        {metaBits}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
