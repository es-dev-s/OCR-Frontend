"use client";

import { useEffect, useRef } from "react";
import { eventsStreamURL, type StreamEvent } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useNotificationsStore } from "@/store/notifications-store";

/**
 * Opens an authenticated SSE stream while a session exists. Falls back to
 * inbox polling when the stream drops; review pages keep a slower poll too.
 */
export function RealtimeProvider() {
  const token = useAuthStore((s) => s.token);
  const ready = useAuthStore((s) => s.ready);
  const load = useNotificationsStore((s) => s.load);
  const reset = useNotificationsStore((s) => s.reset);
  const setLive = useNotificationsStore((s) => s.setLive);
  const applyStreamEvent = useNotificationsStore((s) => s.applyStreamEvent);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      esRef.current?.close();
      esRef.current = null;
      setLive(false);
      reset();
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      esRef.current?.close();
      const url = eventsStreamURL();
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (cancelled) return;
        attempt = 0;
        setLive(true);
        void load();
      });

      es.addEventListener("message", (ev) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(ev.data) as StreamEvent;
          applyStreamEvent(data);
        } catch {
          /* ignore malformed */
        }
      });

      es.onerror = () => {
        setLive(false);
        es.close();
        if (cancelled) return;
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 4));
        attempt += 1;
        if (retryRef.current) window.clearTimeout(retryRef.current);
        retryRef.current = window.setTimeout(connect, delay);
      };
    };

    void load();
    connect();

    // Fallback inbox poll — rare when live, every 45s if stream is down.
    const poll = window.setInterval(() => {
      if (cancelled) return;
      const live = useNotificationsStore.getState().live;
      if (!live) void load();
    }, 45_000);

    return () => {
      cancelled = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      window.clearInterval(poll);
      esRef.current?.close();
      esRef.current = null;
      setLive(false);
    };
  }, [ready, token, load, reset, setLive, applyStreamEvent]);

  return null;
}
