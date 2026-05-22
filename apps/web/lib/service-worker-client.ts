const SW_URL = "/sw.js";
const UPDATE_CHECK_MS = 60 * 60 * 1000;

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

function activateWaitingWorker(
  registration: ServiceWorkerRegistration,
  onUpdating: () => void,
): void {
  const waiting = registration.waiting;
  if (!waiting) return;
  onUpdating();
  waiting.postMessage(SKIP_WAITING_MESSAGE);
}

/** Register the app service worker and auto-apply updates with a reload. */
export function listenForServiceWorkerUpdates(onUpdating: () => void): () => void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  let registration: ServiceWorkerRegistration | null = null;
  let reloaded = false;

  const onControllerChange = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  const checkForUpdates = () => {
    void registration?.update();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") checkForUpdates();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  const intervalId = window.setInterval(checkForUpdates, UPDATE_CHECK_MS);

  void registerAppServiceWorker().then((reg) => {
    if (!reg) return;
    registration = reg;

    if (reg.waiting && navigator.serviceWorker.controller) {
      activateWaitingWorker(reg, onUpdating);
    }

    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        if (installing.state !== "installed") return;
        if (!navigator.serviceWorker.controller) return;
        activateWaitingWorker(reg, onUpdating);
      });
    });

    checkForUpdates();
  });

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.clearInterval(intervalId);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  };
}
