import { APP_BUILD_VERSION } from "@/lib/build-version";
import { showAppUpdateOverlay } from "@/lib/app-update-overlay";

const OVERLAY_MIN_MS = 900;
export const STANDALONE_UPDATE_CHECK_MS = 15_000;
export const UPDATE_CHECK_MS = 60_000;

declare global {
  interface Window {
    __ccoApplyingUpdate?: boolean;
  }
}

export function isAppUpdateInProgress(): boolean {
  return typeof window !== "undefined" && Boolean(window.__ccoApplyingUpdate);
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
  if (window.__ccoApplyingUpdate) return;
  window.__ccoApplyingUpdate = true;
  showAppUpdateOverlay();
  if (onUpdating) await onUpdating();
  await waitForOverlayPaint();
}

export function completeAppUpdateReload(): void {
  if (typeof window === "undefined") return;
  window.location.reload();
}

export async function applyAppUpdate(onUpdating?: () => Promise<void>): Promise<void> {
  await prepareAppUpdate(onUpdating);
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

export async function fetchServerAppVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/app-version", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;

    const { version } = (await res.json()) as { version?: string };
    return version ?? null;
  } catch {
    return null;
  }
}

export async function checkAppVersion(onUpdating?: () => Promise<void>): Promise<boolean> {
  if (APP_BUILD_VERSION === "dev") return false;
  if (isAppUpdateInProgress()) return false;

  const serverVersion = await fetchServerAppVersion();
  if (!serverVersion || serverVersion === APP_BUILD_VERSION) return false;

  await applyAppUpdate(onUpdating);
  return true;
}
