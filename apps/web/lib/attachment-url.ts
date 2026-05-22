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

/**
 * Rewrite attachment URLs to same-origin proxy paths for <img> tags.
 * Uses session auth via the upload proxy instead of signed query params,
 * which expire and break images in cached threads / PWA sessions.
 */
export function resolveAttachmentDisplayUrl(attachmentUrl: string): string {
  if (!attachmentUrl) return attachmentUrl;

  const filename = extractUploadFilename(attachmentUrl);
  if (filename) {
    return `/api/uploads/${filename}`;
  }

  if (attachmentUrl.startsWith("/api/uploads/")) {
    const bare = attachmentUrl.match(/^\/api\/uploads\/([^/?#]+)/);
    if (bare) return `/api/uploads/${bare[1]}`;
  }

  return attachmentUrl;
}
