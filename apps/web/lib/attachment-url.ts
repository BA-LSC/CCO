const UPLOAD_FILENAME_RE = /\/(?:api\/v1\/|api\/)?uploads\/([^/?#]+)/;

/** Same-origin proxy base used for <img> attachment URLs. */
export const UPLOAD_DISPLAY_PATH = "/api/v1/uploads";

function extractR2ObjectKey(urlOrPath: string): string | null {
  try {
    const url = new URL(urlOrPath);
    if (!url.host.includes("r2.cloudflarestorage.com")) return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const key = segments[segments.length - 1]!;
    if (key === "." || key === "..") return null;
    return key;
  } catch {
    return null;
  }
}

/** Extract the stored filename from a public or relative upload URL. */
export function extractUploadFilename(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  try {
    const match = new URL(urlOrPath).pathname.match(UPLOAD_FILENAME_RE);
    if (match?.[1]) return match[1];
    return extractR2ObjectKey(urlOrPath);
  } catch {
    const match = urlOrPath.match(/^\/?(?:api\/v1\/|api\/)?uploads\/([^/?#]+)/);
    if (match?.[1]) return match[1];
    return extractR2ObjectKey(urlOrPath);
  }
}

function readUploadSignatureParams(urlOrPath: string): { sig?: string; exp?: string } {
  try {
    const url = urlOrPath.startsWith("/")
      ? new URL(urlOrPath, "http://local")
      : new URL(urlOrPath);
    const sig = url.searchParams.get("sig");
    const exp = url.searchParams.get("exp");
    if (sig && exp) return { sig, exp };
  } catch {
    const queryIndex = urlOrPath.indexOf("?");
    if (queryIndex >= 0) {
      const params = new URLSearchParams(urlOrPath.slice(queryIndex + 1));
      const sig = params.get("sig");
      const exp = params.get("exp");
      if (sig && exp) return { sig, exp };
    }
  }

  return {};
}

/**
 * Rewrite attachment URLs to same-origin proxy paths for <img> tags.
 * Preserves signed query params when present so images load without relying
 * on cookies (which some embedded browsers omit on subresource requests).
 * Session auth via the upload proxy remains a fallback when sig/exp are absent.
 */
export function resolveAttachmentDisplayUrl(attachmentUrl: string): string {
  if (!attachmentUrl) return attachmentUrl;

  const filename = extractUploadFilename(attachmentUrl);
  if (filename) {
    const { sig, exp } = readUploadSignatureParams(attachmentUrl);
    const base = `${UPLOAD_DISPLAY_PATH}/${filename}`;
    if (sig && exp) {
      const params = new URLSearchParams({ sig, exp });
      return `${base}?${params.toString()}`;
    }
    return base;
  }

  if (attachmentUrl.startsWith(`${UPLOAD_DISPLAY_PATH}/`) || attachmentUrl.startsWith("/api/uploads/")) {
    const bare = attachmentUrl.match(/^\/(?:api\/v1\/|api\/)?uploads\/([^/?#]+)/);
    if (bare) {
      const { sig, exp } = readUploadSignatureParams(attachmentUrl);
      const base = `${UPLOAD_DISPLAY_PATH}/${bare[1]}`;
      if (sig && exp) {
        const params = new URLSearchParams({ sig, exp });
        return `${base}?${params.toString()}`;
      }
      return base;
    }
  }

  return attachmentUrl;
}

/** Stable cache key for deduplicating attachment loads within a message chunk. */
export function attachmentCacheKey(attachmentUrl: string): string {
  return extractUploadFilename(attachmentUrl) ?? attachmentUrl;
}

function readUploadSignatureExpiry(attachmentUrl: string): number {
  const { sig, exp } = readUploadSignatureParams(attachmentUrl);
  if (!sig || !exp) return 0;
  const parsed = Number.parseInt(exp, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Resolve one display URL per attachment identity in a loaded message chunk. */
export function buildAttachmentDisplaySrcMap(
  attachmentUrls: readonly (string | null | undefined)[],
): Map<string, string> {
  const resolved = new Map<string, { src: string; exp: number }>();

  for (const attachmentUrl of attachmentUrls) {
    if (!attachmentUrl) continue;

    const key = attachmentCacheKey(attachmentUrl);
    const exp = readUploadSignatureExpiry(attachmentUrl);
    const existing = resolved.get(key);
    if (existing) {
      const existingSigned = existing.exp > 0;
      const nextSigned = exp > 0;
      if (existingSigned && !nextSigned) continue;
      if (existingSigned === nextSigned && existing.exp >= exp) continue;
    }

    resolved.set(key, {
      src: resolveAttachmentDisplayUrl(attachmentUrl),
      exp,
    });
  }

  return new Map([...resolved.entries()].map(([key, value]) => [key, value.src]));
}
