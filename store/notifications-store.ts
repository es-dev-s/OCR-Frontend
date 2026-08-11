"use client";

import { create } from "zustand";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type StreamEvent,
} from "@/lib/api";
import { emitReviewRefresh } from "@/lib/realtime";

type NotificationsState = {
  items: AppNotification[];
  unreadCount: number;
  live: boolean;
  loading: boolean;
  load: () => Promise<void>;
  setLive: (live: boolean) => void;
  applyStreamEvent: (evt: StreamEvent) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
};

function isReviewEvent(type: string): boolean {
  return type.startsWith("review.");
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  unreadCount: 0,
  live: false,
  loading: false,

  setLive: (live) => set({ live }),

  reset: () => set({ items: [], unreadCount: 0, live: false, loading: false }),

  load: async () => {
    set({ loading: true });
    try {
      const res = await fetchNotifications();
      set({
        items: res.items ?? [],
        unreadCount: res.unread_count ?? 0,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  applyStreamEvent: (evt) => {
    if (!evt?.type) return;
    if (isReviewEvent(evt.type)) {
      emitReviewRefresh({ entityId: evt.entity_id, type: evt.type });
    }
    if (evt.notification?.id) {
      const n = evt.notification;
      set((state) => {
        if (state.items.some((x) => x.id === n.id)) {
          return state;
        }
        const unreadBump = n.read_at ? 0 : 1;
        return {
          items: [n, ...state.items].slice(0, 50),
          unreadCount: state.unreadCount + unreadBump,
        };
      });
    }
  },

  markRead: async (id) => {
    try {
      const res = await markNotificationRead(id);
      set((state) => ({
        items: state.items.map((n) =>
          n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n,
        ),
        unreadCount: res.unread_count ?? Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // keep local state; next load will reconcile
    }
  },

  markAllRead: async () => {
    try {
      await markAllNotificationsRead();
      set((state) => ({
        items: state.items.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch {
      /* ignore */
    }
  },
}));
