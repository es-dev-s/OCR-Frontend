"use client";

import { create } from "zustand";
import type { FileRecord, MatchRecord } from "@/lib/api";

type UploadStore = {
  activeFile: FileRecord | null;
  matches: MatchRecord[];
  tier0Duplicate: boolean;
  message: string | null;
  error: string | null;
  uploading: boolean;
  polling: boolean;
  setUploading: (v: boolean) => void;
  setPolling: (v: boolean) => void;
  setFromUpload: (file: FileRecord, tier0: boolean, message: string) => void;
  setStatus: (file: FileRecord, matches: MatchRecord[]) => void;
  setError: (error: string | null) => void;
  clear: () => void;
};

export const useUploadStore = create<UploadStore>((set) => ({
  activeFile: null,
  matches: [],
  tier0Duplicate: false,
  message: null,
  error: null,
  uploading: false,
  polling: false,
  setUploading: (uploading) => set({ uploading }),
  setPolling: (polling) => set({ polling }),
  setFromUpload: (file, tier0Duplicate, message) =>
    set({
      activeFile: file,
      tier0Duplicate,
      message,
      error: null,
      matches: [],
    }),
  setStatus: (file, matches) =>
    set({
      activeFile: file,
      matches,
    }),
  setError: (error) => set({ error }),
  clear: () =>
    set({
      activeFile: null,
      matches: [],
      tier0Duplicate: false,
      message: null,
      error: null,
      uploading: false,
      polling: false,
    }),
}));
