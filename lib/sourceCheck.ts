import {
  checkDuplicate,
  checkSimilar,
  fileContentURL,
  sha256Hex,
  sourceContentURL,
  type DuplicateMatch,
} from "@/lib/api";
import type { SourceCheckState } from "@/components/files/documentFormShared";
import {
  SOURCE_SLOTS,
  isSourceSlot,
  type SourceSlotNum,
} from "@/lib/sources";

export type SlotChecks = Record<SourceSlotNum, SourceCheckState>;

export type DuplicateCheck = Extract<SourceCheckState, { status: "duplicate" }>;

export const idleChecks = (): SlotChecks => ({
  1: { status: "idle" },
  2: { status: "idle" },
  3: { status: "idle" },
  4: { status: "idle" },
});

export function peerDuplicate(
  slot: SourceSlotNum,
  sha: string,
  hashes: Partial<Record<SourceSlotNum, string>>,
  names: Partial<Record<SourceSlotNum, string>>,
): SourceCheckState | null {
  for (const other of SOURCE_SLOTS) {
    if (other === slot) continue;
    if (hashes[other] && hashes[other] === sha) {
      return {
        status: "duplicate",
        title: `Source ${other}`,
        filename: names[other] || "",
        peerSlot: other,
      };
    }
  }
  return null;
}

/** After any slot hash settles, mark same-hash peers without re-hashing. */
export function reconcilePeerChecks(
  hashes: Partial<Record<SourceSlotNum, string>>,
  names: Partial<Record<SourceSlotNum, string>>,
  checks: SlotChecks,
): SlotChecks {
  const next: SlotChecks = { ...checks };
  for (const slot of SOURCE_SLOTS) {
    const sha = hashes[slot];
    if (!sha) continue;
    if (checks[slot].status === "checking" || checks[slot].status === "idle") {
      continue;
    }
    const peer = peerDuplicate(slot, sha, hashes, names);
    if (peer) {
      next[slot] = peer;
    } else if (
      checks[slot].status === "duplicate" &&
      "peerSlot" in checks[slot] &&
      checks[slot].peerSlot != null &&
      !checks[slot].near
    ) {
      // Exact peer was cleared — fall back to unique until a corpus recheck.
      next[slot] = { status: "unique" };
    }
  }
  return next;
}

/** URL to open the matched original in the corpus (not in-form peer dupes). */
export function corpusOriginalURL(check: DuplicateCheck): string | null {
  if (check.peerSlot != null || !check.fileId) return null;
  if (check.kind === "source" && check.matchSlot != null) {
    return sourceContentURL(check.fileId, check.matchSlot);
  }
  return fileContentURL(check.fileId);
}

export function openOriginal(check: DuplicateCheck, peerFile?: File | null) {
  if (check.peerSlot != null) {
    if (!peerFile) return;
    const url = URL.createObjectURL(peerFile);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const url = corpusOriginalURL(check);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export async function checkSourceFile(opts: {
  slot: SourceSlotNum;
  file: File;
  hashes: Partial<Record<SourceSlotNum, string>>;
  names: Partial<Record<SourceSlotNum, string>>;
  peerFiles?: Partial<Record<SourceSlotNum, File | null>>;
  excludeFileId?: string;
  signal?: AbortSignal;
}): Promise<{
  sha: string;
  check: SourceCheckState;
  match?: Partial<DuplicateMatch>;
}> {
  const sha = await sha256Hex(opts.file);
  if (opts.signal?.aborted) {
    return { sha, check: { status: "idle" } };
  }

  const peer = peerDuplicate(opts.slot, sha, opts.hashes, opts.names);
  if (peer) {
    return { sha, check: peer };
  }

  const res = await checkDuplicate(sha, {
    excludeFileId: opts.excludeFileId,
    signal: opts.signal,
  });
  if (opts.signal?.aborted) {
    return { sha, check: { status: "idle" } };
  }

  if (res.duplicate) {
    const match = res.match ?? {};
    return {
      sha,
      match,
      check: {
        status: "duplicate",
        title:
          match.title ||
          match.original_filename ||
          "a document owned by another member",
        filename: match.matched_filename || match.original_filename || "",
        fileId: match.file_id,
        kind: match.kind,
        matchSlot: typeof match.slot === "number" ? match.slot : undefined,
      },
    };
  }

  // Exact SHA miss — server near-dup vs peer sources + corpus.
  try {
    const similar = await checkSimilar(opts.file, {
      excludeFileId: opts.excludeFileId,
      peerFiles: opts.peerFiles,
      peerSlot: opts.slot,
      signal: opts.signal,
    });
    if (opts.signal?.aborted) {
      return { sha, check: { status: "idle" } };
    }
    if (similar.similar) {
      const match = similar.match ?? {};
      const peerSlotRaw =
        typeof match.peer_slot === "number"
          ? match.peer_slot
          : typeof match.slot === "number" && match.kind === "peer"
            ? match.slot
            : undefined;
      const peerSlot =
        peerSlotRaw != null && isSourceSlot(peerSlotRaw)
          ? peerSlotRaw
          : undefined;
      return {
        sha,
        match,
        check: {
          status: "duplicate",
          title:
            peerSlot != null
              ? `Source ${peerSlot}`
              : match.title ||
                match.original_filename ||
                "a similar document in the corpus",
          filename: match.matched_filename || match.original_filename || "",
          fileId: match.file_id,
          kind: match.kind,
          matchSlot:
            match.kind === "source" && typeof match.slot === "number"
              ? match.slot
              : undefined,
          peerSlot,
          near: true,
          similarity: similar.similarity,
        },
      };
    }
  } catch {
    // Near-check is best-effort — don't block intake if it fails.
  }

  return { sha, check: { status: "unique" } };
}
