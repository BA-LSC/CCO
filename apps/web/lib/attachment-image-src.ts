import { isStandaloneDisplay } from "@/lib/add-to-homescreen";
import {
  attachmentCacheKey,
  hasValidUploadDisplaySignature,
  isCcoUploadDisplaySrc,
} from "@/lib/attachment-url";

const memoryUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * PWA standalone WebKit often omits session cookies on plain <img> subresource loads.
 * Signed URLs should work without cookies, but fetch(..., { credentials: "include" })
 * reliably authenticates when sig is missing, expired, or ignored by the browser.
 */
export function uploadImageSrcNeedsCredentialFetch(src: string): boolean {
  if (!isCcoUploadDisplaySrc(src)) return false;
  if (isStandaloneDisplay()) return true;
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
      const response = await fetch(src, { credentials: "include" });
      if (!response.ok) return null;

      const blob = await response.blob();
      if (!blob.type.startsWith("image/") && blob.size === 0) return null;

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

export async function resolveUploadAttachmentImageSrc(src: string): Promise<string> {
  if (!uploadImageSrcNeedsCredentialFetch(src)) return src;
  const blobUrl = await fetchUploadImageBlobUrl(src);
  return blobUrl ?? src;
}

/** Test-only: clear in-memory blob URL cache. */
export function resetUploadImageBlobCacheForTests(): void {
  for (const url of memoryUrls.values()) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  memoryUrls.clear();
  inFlight.clear();
}
