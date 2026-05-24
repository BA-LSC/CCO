import { extractUploadFilename } from "@/lib/attachment-url";

const CACHE_NAME = "cco-video-thumbnails-v2";
const THUMB_JPEG_QUALITY = 0.82;
const SEEK_SECONDS = 0.1;
const CAPTURE_TIMEOUT_MS = 20_000;

const memoryUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

/** Stable cache key that survives signed URL rotation. */
export function videoThumbnailCacheKey(src: string): string {
  return extractUploadFilename(src) ?? src;
}

function cacheRequestUrl(key: string): string {
  if (typeof location === "undefined") return `https://cco.local/__cco/video-thumb/${encodeURIComponent(key)}`;
  return new URL(`/__cco/video-thumb/${encodeURIComponent(key)}`, location.origin).toString();
}

function rememberBlobUrl(key: string, blob: Blob): string {
  const existing = memoryUrls.get(key);
  if (existing) return existing;

  const url = URL.createObjectURL(blob);
  memoryUrls.set(key, url);
  return url;
}

async function readPersistentCache(key: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;

  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(cacheRequestUrl(key));
    if (!response?.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

async function writePersistentCache(key: string, blob: Blob): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheRequestUrl(key),
      new Response(blob, { headers: { "Content-Type": "image/jpeg" } }),
    );
  } catch {
    // Ignore quota errors and private browsing.
  }
}

async function resolveVideoSource(src: string): Promise<{ url: string; revoke?: () => void }> {
  const sameOrigin =
    src.startsWith("/") ||
    (typeof location !== "undefined" && src.startsWith(location.origin));

  try {
    const response = await fetch(src, {
      credentials: sameOrigin ? "include" : "omit",
    });
    if (!response.ok) throw new Error(`Video fetch failed (${response.status})`);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  } catch {
    return { url: src };
  }
}

function captureVideoFrame(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let revokeSource: (() => void) | undefined;
    const finish = (blob: Blob | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      revokeSource?.();
      if (blob) resolve(blob);
      else reject(error ?? new Error("Failed to capture video frame"));
    };

    const timeoutId = setTimeout(() => {
      finish(null, new Error("Video thumbnail capture timed out"));
    }, CAPTURE_TIMEOUT_MS);

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };

    const drawFrame = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        finish(null, new Error("Video has no frame dimensions"));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        finish(null, new Error("Canvas unavailable"));
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => finish(blob, blob ? undefined : new Error("JPEG encode failed")),
        "image/jpeg",
        THUMB_JPEG_QUALITY,
      );
    };

    const seekToPreviewFrame = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawFrame();
        return;
      }

      video.onseeked = drawFrame;
      try {
        const target =
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.min(SEEK_SECONDS, Math.max(video.duration - 0.001, 0))
            : SEEK_SECONDS;
        video.currentTime = target;
      } catch {
        drawFrame();
      }
    };

    video.onloadedmetadata = seekToPreviewFrame;
    video.onloadeddata = seekToPreviewFrame;
    video.onerror = () => finish(null, new Error("Video failed to load"));

    void resolveVideoSource(src)
      .then(({ url, revoke }) => {
        revokeSource = revoke;
        video.src = url;
      })
      .catch((error: unknown) => {
        finish(null, error instanceof Error ? error : new Error("Video failed to load"));
      });
  });
}

/** Return a cached blob URL for a video attachment preview, generating it once if needed. */
export async function getVideoThumbnailUrl(src: string): Promise<string | null> {
  if (typeof document === "undefined" || !src) return null;

  const key = videoThumbnailCacheKey(src);
  const cached = memoryUrls.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const persisted = await readPersistentCache(key);
    if (persisted) return rememberBlobUrl(key, persisted);

    try {
      const blob = await captureVideoFrame(src);
      await writePersistentCache(key, blob);
      return rememberBlobUrl(key, blob);
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, work);
  return work;
}
