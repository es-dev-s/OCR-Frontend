/** Max supporting evidence PDFs attached to one document. */
export const SOURCE_SLOT_COUNT = 4;

export const SOURCE_SLOTS = [1, 2, 3, 4] as const;

export type SourceSlotNum = (typeof SOURCE_SLOTS)[number];

export type SourceKey = `source_${SourceSlotNum}`;

export type DocumentSourcesInput = Partial<Record<SourceKey, File | null>>;

/** Per-slot extracted PDF titles keyed by slot number. */
export type SourceTitlesInput = Partial<Record<SourceSlotNum, string>>;

export function sourceKey(slot: SourceSlotNum): SourceKey {
  return `source_${slot}`;
}

export function emptySourceFiles(): Record<SourceKey, File | null> {
  return {
    source_1: null,
    source_2: null,
    source_3: null,
    source_4: null,
  };
}

export function isSourceSlot(n: number): n is SourceSlotNum {
  return SOURCE_SLOTS.includes(n as SourceSlotNum);
}

/** First non-empty picked source (intake title detection). */
export function firstPickedSource(
  sources: DocumentSourcesInput,
): File | null {
  for (const slot of SOURCE_SLOTS) {
    const f = sources[sourceKey(slot)];
    if (f) return f;
  }
  return null;
}

export function hasAnySource(sources: DocumentSourcesInput): boolean {
  return firstPickedSource(sources) != null;
}

export function appendSourcesToFormData(
  body: FormData,
  sources: DocumentSourcesInput,
  titles?: SourceTitlesInput,
): void {
  for (const slot of SOURCE_SLOTS) {
    const f = sources[sourceKey(slot)];
    if (f) body.append(sourceKey(slot), f);
    const title = titles?.[slot]?.trim();
    if (title) body.append(`source_${slot}_title`, title);
  }
}
