import { APP_BUILD_VERSION } from "@/lib/build-version";
import { waitForSendIdle } from "@/lib/app-update-composer";
import { hideAppUpdateOverlay, showAppUpdateOverlay } from "@/lib/app-update-overlay";

const OVERLAY_MIN_MS = 2500;
export const STANDALONE_UPDATE_CHECK_MS = 5_000;
export const UPDATE_CHECK_MS = 15_000;
export const DEPLOY_POLL_MS = 1500;

const DEPLOY_HTTP_STATUSES = new Set([502, 503, 504]);

export const APP_UPDATE_EVENT = "cco:app-updating";

declare global {
  interface Window {
    __ccoApplyingUpdate?: boolean;
  }
}

let deployWaitActive = false;

export function isAppUpdateInProgress(): boolean {
  return typeof window !== "undefined" && Boolean(window.__ccoApplyingUpdate);
}

export function isDeployWaitActive(): boolean {
  return deployWaitActive;
}

function notifyAppUpdating(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_UPDATE_EVENT));
}

export function markDeployWait(onUpdating?: () => void | Promise<void>): void {
  deployWaitActive = true;
  if (typeof window !== "undefined") window.__ccoApplyingUpdate = true;
  showAppUpdateOverlay();
  notifyAppUpdating();
  void onUpdating?.();
}

export function clearDeployWait(): void {
  deployWaitActive = false;
  if (typeof window !== "undefined") window.__ccoApplyingUpdate = false;
  hideAppUpdateOverlay();
}

export function waitForOverlayPaint(ms = OVERLAY_MIN_MS): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, ms);
      });
    });
  });
}

export async function prepareAppUpdate(onUpdating?: () => Promise<void>): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.__ccoApplyingUpdate && !deployWaitActive) return;
  deployWaitActive = false;
  window.__ccoApplyingUpdate = true;
  showAppUpdateOverlay();
  notifyAppUpdating();
  if (onUpdating) await onUpdating();
  await waitForOverlayPaint();
}

export function completeAppUpdateReload(): void {
  if (typeof window === "undefined") return;
  window.location.reload();
}

export async function applyAppUpdate(onUpdating?: () => Promise<void>): Promise<void> {
  await prepareAppUpdate(onUpdating);
  await waitForSendIdle();
  completeAppUpdateReload();
}

export function getUpdateCheckIntervalMs(): number {
  if (typeof window === "undefined") return UPDATE_CHECK_MS;

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone);

  return standalone ? STANDALONE_UPDATE_CHECK_MS : UPDATE_CHECK_MS;
}

export type AppVersionProbe = {
  version: string | null;
  unavailable: boolean;
  updating: boolean;
};

export async function probeServerAppVersion(): Promise<AppVersionProbe> {
  try {
    const res = await fetch("/api/app-version", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (DEPLOY_HTTP_STATUSES.has(res.status) || !res.ok) {
      return { version: null, unavailable: true, updating: true };
    }

    const data = (await res.json()) as { version?: string; updating?: boolean };
    if (data.updating) {
      return { version: data.version ?? null, unavailable: false, updating: true };
    }

    return { version: data.version ?? null, unavailable: false, updating: false };
  } catch {
    return { version: null, unavailable: true, updating: true };
  }
}

/** @deprecated Use probeServerAppVersion */
export async function fetchServerAppVersion(): Promise<string | null> {
  const { version } = await probeServerAppVersion();
  return version;
}

export async function checkAppVersion(onUpdating?: () => Promise<void>): Promise<boolean> {
  if (APP_BUILD_VERSION === "dev") return false;
  if (isAppUpdateInProgress() && !deployWaitActive) return false;

  const { version: serverVersion, unavailable, updating } = await probeServerAppVersion();

  if (updating || unavailable) {
    markDeployWait(onUpdating);
    return false;
  }

  if (!serverVersion || serverVersion === APP_BUILD_VERSION) {
    if (deployWaitActive) clearDeployWait();
    return false;
  }

  await applyAppUpdate(onUpdating);
  return true;
}
