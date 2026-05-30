"use client";

import { useSyncExternalStore } from "react";
import { readRtkMirrorVideoPref, RTK_PREFS_STORAGE_KEY } from "@/lib/rtk-user-prefs";

const listeners = new Set<() => void>();
let prefsWriteListenerInstalled = false;

function notifyPrefListeners() {
  listeners.forEach((listener) => listener());
}

function ensurePrefsWriteListener() {
  if (prefsWriteListenerInstalled || typeof window === "undefined") return;

  prefsWriteListenerInstalled = true;
  const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  window.localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (key === RTK_PREFS_STORAGE_KEY) notifyPrefListeners();
  };
}

function subscribe(onStoreChange: () => void) {
  ensurePrefsWriteListener();
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === RTK_PREFS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Local self-preview mirror pref from RealtimeKit settings (`mirror-video`). */
export function useRtkMirrorVideoPref(): boolean {
  return useSyncExternalStore(subscribe, readRtkMirrorVideoPref, () => true);
}
