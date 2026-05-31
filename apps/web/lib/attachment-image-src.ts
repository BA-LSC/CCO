import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import {
  attachmentCacheKey,
  hasValidUploadDisplaySignature,
  isCcoUploadDisplaySrc,
} from "@/lib/attachment-url";

const memoryUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function resolveFetchUrl(src: string): string {
  if (src.startsWith("/") && typeof window !== "undefined") {
    return new URL(src, window.location.origin).href;
  }
  return src;
}

function cacheKeyForSrc(src: string): string {
  return src.startsWith("blob:") ? src : attachmentCacheKey(src);
}

/**
 * iOS PWA WebKit often fails plain <img> loads for upload proxy URLs. Load those
 * through fetch() and display a fresh blob URL instead. Local file-picker blob:
 * previews must stay on the original object URL (fetch(blob:) breaks on iOS PWA).
 */
export function uploadImageSrcNeedsCredentialFetch(src: string): boolean {
  if (src.startsWith("blob:")) return false;
  if (!isCcoUploadDisplaySrc(src)) return false;
  if (isStandaloneDisplay()) return true;
  return !hasValidUploadDisplaySignature(src);
}

export async function fetchUploadImageBlobUrl(src: string): Promise<string | null> {
  const key = cacheKeyForSrc(src);
  const cached = memoryUrls.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await fetch(resolveFetchUrl(src), {
        credentials: src.startsWith("blob:") ? "omit" : "include",
      });
      if (!response.ok) return null;

      const blob = await response.blob();
      if (blob.size === 0) return null;

      const url = URL.createObjectURL(blob);
      memoryUrls.set(key, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Test-only: clear in-memory blob URL cache. */
export function resetUploadImageBlobCacheForTests(): void {
  for (const url of memoryUrls.values()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  memoryUrls.clear();
  inFlight.clear();
}
