/** Service worker source served from /sw.js with a per-deploy build id prefix. */
export const SW_TEMPLATE = `/* CCO service worker — web push + deploy updates for home-screen / PWA users */

self.addEventListener("install", () => {
  // Wait for the client to call skipWaiting so we can show an update overlay first.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function resolveNotificationAssetUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  try {
    return new URL(trimmed, self.location.origin).href;
  } catch {
    return null;
  }
}

function readPushPayload(event) {
  const defaults = {
    title: "CCO",
    body: "New message",
    url: "/",
    conversationId: "",
    icon: "",
    image: "",
  };
  if (!event.data) return defaults;

  try {
    return { ...defaults, ...event.data.json() };
  } catch {
    try {
      const text = event.data.text();
      if (text) return { ...defaults, ...JSON.parse(text) };
    } catch {
      // Fall back to defaults below.
    }
  }

  return defaults;
}

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const appIcon = new URL("/icons/icon-192.png", self.location.origin).href;
  const iconUrl = resolveNotificationAssetUrl(payload.icon) || appIcon;
  const imageUrl = resolveNotificationAssetUrl(payload.image);

  const notificationOptions = {
    body: payload.body,
    icon: iconUrl,
    badge: appIcon,
    tag: payload.conversationId ? "cco-" + payload.conversationId : "cco-message",
    renotify: true,
    timestamp: Date.now(),
    data: { url: payload.url, conversationId: payload.conversationId },
  };
  if (imageUrl) {
    notificationOptions.image = imageUrl;
  }

  const notifyClients = self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      client.postMessage({
        type: "cco:unread-push",
        conversationId: payload.conversationId,
        url: payload.url,
      });
    }
  });

  const bumpBadge = (async () => {
    if (!("setAppBadge" in self.navigator)) return;
    try {
      const current = typeof self.navigator.getAppBadge === "function"
        ? await self.navigator.getAppBadge()
        : 0;
      await self.navigator.setAppBadge((current || 0) + 1);
    } catch {
      try {
        await self.navigator.setAppBadge(1);
      } catch {
        // Badging unavailable on this platform.
      }
    }
  })();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, notificationOptions),
      notifyClients,
      bumpBadge,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
`;
