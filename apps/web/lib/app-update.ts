import { APP_BUILD_VERSION } from "@/lib/build-version";
import { waitForSendIdle } from "@/lib/app-update-composer";
import { hideAppUpdateOverlay, showAppUpdateOverlay } from "@/lib/app-update-overlay";

const OVERLAY_MIN_MS = 2500;
const DEPLOY_RELOAD_SESSION_KEY = "cco-deploy-reload";
const DEPLOY_RELOAD_GRACE_MS = 15_000;
const DEPLOY_RELOAD_SEND_WAIT_MS = 500;
export const STANDALONE_UPDATE_CHECK_MS = 5_000;
export const UPDATE_CHECK_MS = 15_000;
export const DEPLOY_POLL_MS = 750;

const DEPLOY_HTTP_STATUSES = new Set([502, 503, 504]);

export const APP_UPDATE_EVENT = "cco:app-updating";

declare global {
  interface Window {
    __ccoApplyingUpdate?: boolean;
    __ccoDeployPending?: boolean;
  }
}

let deployWaitActive = false;

export function isDeployPending(): boolean {
  return (
    deployWaitActive ||
    (typeof window !== "undefined" && Boolean(window.__ccoDeployPending))
  );
}

export function isAppUpdateInProgress(): boolean {
  return typeof window !== "undefined" && Boolean(window.__ccoApplyingUpdate);
}

export function markDeployReload(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      DEPLOY_RELOAD_SESSION_KEY,
      String(Date.now() + DEPLOY_RELOAD_GRACE_MS),
    );
  } catch {
    // ignore
  }
}

export function isPostDeployGracePeriod(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(DEPLOY_RELOAD_SESSION_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() >= until) {
      sessionStorage.removeItem(DEPLOY_RELOAD_SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearPostDeployGracePeriod(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DEPLOY_RELOAD_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** After a deploy reload, skip overlay until the new bundle is confirmed live. */
export function maybeCompletePostDeployReload(serverVersion: string | null): boolean {
  if (!isPostDeployGracePeriod()) return false;
  if (!serverVersion || serverVersion !== APP_BUILD_VERSION) return false;
  clearPostDeployGracePeriod();
  clearDeployWait();
  return true;
}

export function shouldSuppressServiceWorkerUpdateAfterDeploy(): boolean {
  return isPostDeployGracePeriod();
}

export function isDeployWaitActive(): boolean {
  return isDeployPending();
}

function notifyAppUpdating(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(APP_UPDATE_EVENT));
}

export function resumeAppUpdateUi(): void {
  if (typeof window === "undefined") return;
  if (!isAppUpdateInProgress() && !isDeployPending()) return;
  showAppUpdateOverlay();
}

export function markDeployWait(onUpdating?: () => void | Promise<void>): void {
  deployWaitActive = true;
  if (typeof window !== "undefined") {
    window.__ccoApplyingUpdate = true;
    window.__ccoDeployPending = true;
  }
  showAppUpdateOverlay();
  notifyAppUpdating();
  void onUpdating?.();
}

export function clearDeployWait(): void {
  deployWaitActive = false;
  if (typeof window !== "undefined") {
    window.__ccoApplyingUpdate = false;
    window.__ccoDeployPending = false;
  }
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
  if (window.__ccoApplyingUpdate && !isDeployPending()) return;
  deployWaitActive = false;
  if (typeof window !== "undefined") window.__ccoDeployPending = false;
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
  const afterDeploy = isDeployPending();
  if (afterDeploy) {
    deployWaitActive = false;
    if (typeof window !== "undefined") window.__ccoDeployPending = false;
    markDeployReload();
    await waitForSendIdle(DEPLOY_RELOAD_SEND_WAIT_MS);
    completeAppUpdateReload();
    return;
  }

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
    if (DEPLOY_HTTP_STATUSES.has(res.status)) {
      return { version: null, unavailable: true, updating: isDeployPending() };
    }
    if (!res.ok) {
      return { version: null, unavailable: true, updating: false };
    }

    const data = (await res.json()) as { version?: string; updating?: boolean };
    if (data.updating) {
      return { version: data.version ?? null, unavailable: false, updating: true };
    }

    return { version: data.version ?? null, unavailable: false, updating: false };
  } catch {
    return { version: null, unavailable: true, updating: isDeployPending() };
  }
}

/** @deprecated Use probeServerAppVersion */
export async function fetchServerAppVersion(): Promise<string | null> {
  const { version } = await probeServerAppVersion();
  return version;
}

export async function checkAppVersion(onUpdating?: () => Promise<void>): Promise<boolean> {
  if (APP_BUILD_VERSION === "dev") return false;
  if (isAppUpdateInProgress() && !isDeployPending() && !isPostDeployGracePeriod()) return false;

  const { version: serverVersion, unavailable, updating } = await probeServerAppVersion();

  if (maybeCompletePostDeployReload(serverVersion)) {
    return false;
  }

  if (
    !unavailable &&
    serverVersion &&
    serverVersion !== APP_BUILD_VERSION &&
    (updating || isDeployPending())
  ) {
    await applyAppUpdate(onUpdating);
    return true;
  }

  if (updating) {
    markDeployWait(onUpdating);
    return false;
  }

  if (isDeployPending()) {
    return false;
  }

  if (!serverVersion || serverVersion === APP_BUILD_VERSION) {
    return false;
  }

  await applyAppUpdate(onUpdating);
  return true;
}
