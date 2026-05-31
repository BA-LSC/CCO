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

/**
 * Plain <img> loads omit session cookies in some PWA WebKit builds when sig/exp are
 * missing or expired. Valid signed URLs load without cookies; fetch with credentials
 * is the fallback when they are not present.
 */
export function uploadImageSrcNeedsCredentialFetch(src: string): boolean {
  if (!isCcoUploadDisplaySrc(src)) return false;
  return !hasValidUploadDisplaySignature(src);
}

export async function fetchUploadImageBlobUrl(src: string): Promise<string | null> {
  const key = attachmentCacheKey(src);
  const cached = memoryUrls.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const response = await fetch(resolveFetchUrl(src), { credentials: "include" });
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
