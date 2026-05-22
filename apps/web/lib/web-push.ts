import { apiFetch } from "@/lib/api";
import { getReadyServiceWorkerRegistration } from "@/lib/service-worker-client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function syncSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await apiFetch("/api/v1/push/web/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });

  return true;
}

export async function subscribeToWebPush(): Promise<boolean> {
  if (!pushSupported()) return false;

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  const registration = await getReadyServiceWorkerRegistration();
  if (!registration) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await apiFetch<{ publicKey: string }>("/api/v1/push/vapid-public-key");
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  return syncSubscriptionToServer(subscription);
}

export async function ensureWebPushSubscription(options?: {
  promptIfNeeded?: boolean;
}): Promise<void> {
  if (!pushSupported()) return;

  const registration = await getReadyServiceWorkerRegistration();
  if (!registration) return;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await syncSubscriptionToServer(existing).catch((err) => {
      console.warn("Web push subscription sync failed:", err);
    });
    return;
  }

  if (Notification.permission === "granted") {
    await subscribeToWebPush().catch((err) => {
      console.warn("Web push subscribe failed:", err);
    });
    return;
  }

  const shouldPrompt =
    options?.promptIfNeeded === true &&
    isStandalonePwa();

  if (!shouldPrompt) return;

  await subscribeToWebPush().catch((err) => {
    console.warn("Web push subscribe failed:", err);
  });
}
