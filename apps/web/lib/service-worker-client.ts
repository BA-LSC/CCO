import {
  applyAppUpdate,
  checkAppVersion,
  completeAppUpdateReload,
  getUpdateCheckIntervalMs,
  isAppUpdateInProgress,
  prepareAppUpdate,
} from "@/lib/app-update";

const SW_URL = "/sw.js";

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

/** @deprecated Import from @/lib/app-update */
export function waitForOverlayPaint(): Promise<void> {
  return import("@/lib/app-update").then((mod) => mod.waitForOverlayPaint());
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
    if (applying || !reg.waiting || isAppUpdateInProgress()) return;
    applying = true;

    await prepareAppUpdate(onUpdating);
    reg.waiting.postMessage(SKIP_WAITING_MESSAGE);
  };

  const onControllerChange = () => {
    if (reloaded) return;
    reloaded = true;

    if (isAppUpdateInProgress()) {
      completeAppUpdateReload();
      return;
    }

    void applyAppUpdate(onUpdating);
  };

  navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

  const runUpdateChecks = async () => {
    if (isAppUpdateInProgress()) return;
    if (await checkAppVersion(onUpdating)) return;
    void registration?.update();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void runUpdateChecks();
  };

  const onPageShow = () => {
    void runUpdateChecks();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("focus", onPageShow);
  const intervalId = window.setInterval(() => void runUpdateChecks(), getUpdateCheckIntervalMs());

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
    window.removeEventListener("focus", onPageShow);
    window.clearInterval(intervalId);
    navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
  };
}

/** @deprecated Use listenForAppUpdates */
export function listenForServiceWorkerUpdates(onUpdating: () => void): () => void {
  return listenForAppUpdates(async () => {
    onUpdating();
    const { waitForOverlayPaint } = await import("@/lib/app-update");
    await waitForOverlayPaint();
  });
}
