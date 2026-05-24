import {
  applyAppUpdate,
  checkAppVersion,
  completeAppUpdateReload,
  DEPLOY_POLL_MS,
  forceClearStaleUpdateState,
  getUpdateCheckIntervalMs,
  isAppUpdateInProgress,
  isAppVersionCurrent,
  isDeployWaitActive,
  isPostDeployGracePeriod,
  prepareAppUpdate,
  probeServerAppVersion,
  shouldRunAppUpdateChecks,
  shouldSuppressServiceWorkerUpdateAfterDeploy,
} from "@/lib/app-update";
import { getClientBuildVersion } from "@/lib/build-version";

export const SKIP_WAITING_MESSAGE = { type: "SKIP_WAITING" } as const;

export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("Service worker registration failed:", err);
    return null;
  }
}

export async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    await registerAppServiceWorker();
    return await navigator.serviceWorker.ready;
  } catch (err) {
    console.warn("Service worker ready failed:", err);
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

  if (!shouldRunAppUpdateChecks()) {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
    }
    return () => {};
  }

  let registration: ServiceWorkerRegistration | null = null;
  let applying = false;
  let reloaded = false;
  let deployPollId: number | null = null;

  const syncDeployPoll = () => {
    if (isDeployWaitActive()) {
      if (deployPollId !== null) return;
      deployPollId = window.setInterval(() => void runUpdateChecks(), DEPLOY_POLL_MS);
      return;
    }
    if (deployPollId === null) return;
    window.clearInterval(deployPollId);
    deployPollId = null;
  };

  const applyServiceWorkerUpdate = async (reg: ServiceWorkerRegistration) => {
    if (applying || !reg.waiting) return;
    if (shouldSuppressServiceWorkerUpdateAfterDeploy()) {
      reg.waiting.postMessage(SKIP_WAITING_MESSAGE);
      return;
    }
    if (await isAppVersionCurrent()) {
      // Ignore stale waiting workers — activating them reloads the page for no reason.
      return;
    }
    if (isAppUpdateInProgress()) return;
    applying = true;

    try {
      await prepareAppUpdate(onUpdating);
      if (await isAppVersionCurrent()) {
        forceClearStaleUpdateState();
        return;
      }
      reg.waiting.postMessage(SKIP_WAITING_MESSAGE);
    } catch {
      forceClearStaleUpdateState();
    } finally {
      applying = false;
    }
  };

  const onControllerChange = () => {
    void (async () => {
      if (reloaded) return;
      if (shouldSuppressServiceWorkerUpdateAfterDeploy()) {
        reloaded = true;
        forceClearStaleUpdateState();
        return;
      }
      if (await isAppVersionCurrent()) {
        reloaded = true;
        forceClearStaleUpdateState();
        return;
      }
      reloaded = true;

      if (isAppUpdateInProgress()) {
        completeAppUpdateReload();
        return;
      }

      void applyAppUpdate(onUpdating);
    })();
  };

  navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

  const runUpdateChecks = async () => {
    if (isPostDeployGracePeriod()) {
      if (await isAppVersionCurrent()) {
        syncDeployPoll();
        return;
      }
    }
    if (isAppUpdateInProgress() && !isDeployWaitActive() && !isPostDeployGracePeriod()) return;
    if (await checkAppVersion(onUpdating)) return;
    const { version: serverVersion, unavailable } = await probeServerAppVersion();
    const clientVersion = getClientBuildVersion();
    if (!unavailable && serverVersion && serverVersion !== clientVersion) {
      void registration?.update();
    }
    syncDeployPoll();
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
    if (deployPollId !== null) window.clearInterval(deployPollId);
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
