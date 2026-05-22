import { APP_BUILD_VERSION } from "@/lib/build-version";
import { showAppUpdateOverlay } from "@/lib/app-update-overlay";

const SW_URL = "/sw.js";
const UPDATE_CHECK_MS = 60 * 1000;

export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

/** Give React time to paint the update overlay before reloading. */
export function waitForOverlayPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 400);
      });
    });
  });
}

async function notifyUpdating(onUpdating: () => Promise<void>): Promise<void> {
  showAppUpdateOverlay();
  await onUpdating();
}

export async function checkAppVersion(onUpdating: () => Promise<void>): Promise<boolean> {
  if (APP_BUILD_VERSION === "dev") return false;

  try {
    const res = await fetch("/api/app-version", { cache: "no-store" });
    if (!res.ok) return false;

    const { version } = (await res.json()) as { version?: string };
    if (!version || version === APP_BUILD_VERSION) return false;

    await notifyUpdating(onUpdating);
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** Register the app service worker and auto-apply updates with a reload. */
export function listenForAppUpdates(onUpdating: () => Promise<void>): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let registration: ServiceWorkerRegistration | null = null;
  let applying = false;
  let reloaded = false;

  const applyServiceWorkerUpdate = async (reg: ServiceWorkerRegistration) => {
    if (applying || !reg.waiting) return;
    applying = true;

    await notifyUpdating(onUpdating);
    reg.waiting.postMessage(SKIP_WAITING_MESSAGE);
  };

  const onControllerChange = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

  const runUpdateChecks = async () => {
    if (await checkAppVersion(onUpdating)) return;
    void registration?.update();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void runUpdateChecks();
  };

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) void runUpdateChecks();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  const intervalId = window.setInterval(() => void runUpdateChecks(), UPDATE_CHECK_MS);

  void runUpdateChecks();

  if ("serviceWorker" in navigator) {
    void registerAppServiceWorker().then((reg) => {
      if (!reg) return;
      registration = reg;

      if (reg.waiting && navigator.serviceWorker.controller) {
        void applyServiceWorkerUpdate(reg);
      }

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state !== "installed") return;
          if (!navigator.serviceWorker.controller) return;
          void applyServiceWorkerUpdate(reg);
        });
      });

      void runUpdateChecks();
    });
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageShow);
    window.clearInterval(intervalId);
    navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
  };
}

/** @deprecated Use listenForAppUpdates */
export function listenForServiceWorkerUpdates(onUpdating: () => void): () => void {
  return listenForAppUpdates(async () => {
    onUpdating();
    await waitForOverlayPaint();
  });
}
