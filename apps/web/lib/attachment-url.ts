const UPLOAD_FILENAME_RE = /\/(?:api\/)?uploads\/([^/?#]+)/;

/** Extract the stored filename from a public or relative upload URL. */
export function extractUploadFilename(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  try {
    const match = new URL(urlOrPath).pathname.match(UPLOAD_FILENAME_RE);
    return match?.[1] ?? null;
  } catch {
    const match = urlOrPath.match(/^\/?(?:api\/)?uploads\/([^/?#]+)/);
    return match?.[1] ?? null;
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
    const base = `/api/uploads/${filename}`;
    if (sig && exp) {
      const params = new URLSearchParams({ sig, exp });
      return `${base}?${params.toString()}`;
    }
    return base;
  }

  if (attachmentUrl.startsWith("/api/uploads/")) {
    const bare = attachmentUrl.match(/^\/api\/uploads\/([^/?#]+)/);
    if (bare) {
      const { sig, exp } = readUploadSignatureParams(attachmentUrl);
      const base = `/api/uploads/${bare[1]}`;
      if (sig && exp) {
        const params = new URLSearchParams({ sig, exp });
        return `${base}?${params.toString()}`;
      }
      return base;
    }
  }

  return attachmentUrl;
}
