"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import {
  IDLE_ACTIVITY_STORAGE_KEY,
  idleTimeRemaining,
} from "@/lib/idle-session";

const ACTIVITY_PUBLISH_INTERVAL_MS = 1_000;
const ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "scroll",
  "touchstart",
] as const;

export function IdleSessionLogout() {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(0);
  const lastPublishedRef = useRef(0);
  const signingOutRef = useRef(false);

  useEffect(() => {
    function clearTimer() {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    }

    async function signOutForIdle() {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearTimer();
      await authClient.signOut();
      router.replace("/sign-in");
      router.refresh();
    }

    function scheduleExpiry() {
      clearTimer();
      const remaining = idleTimeRemaining(lastActivityRef.current);
      if (remaining === 0) {
        void signOutForIdle();
        return;
      }
      timeoutRef.current = setTimeout(scheduleExpiry, remaining);
    }

    function publishActivity(force = false) {
      const now = Date.now();
      if (!force && now - lastPublishedRef.current < ACTIVITY_PUBLISH_INTERVAL_MS) {
        return;
      }
      lastActivityRef.current = now;
      lastPublishedRef.current = now;
      try {
        localStorage.setItem(IDLE_ACTIVITY_STORAGE_KEY, String(now));
      } catch {
        // The current tab still enforces the timeout when storage is unavailable.
      }
      scheduleExpiry();
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== IDLE_ACTIVITY_STORAGE_KEY || event.newValue === null) return;
      const activityAt = Number(event.newValue);
      if (!Number.isFinite(activityAt) || activityAt <= lastActivityRef.current) return;
      lastActivityRef.current = activityAt;
      scheduleExpiry();
    }

    function handleActivity() {
      publishActivity();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (idleTimeRemaining(lastActivityRef.current) === 0) {
        void signOutForIdle();
        return;
      }
      publishActivity(true);
    }

    publishActivity(true);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimer();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  return null;
}
