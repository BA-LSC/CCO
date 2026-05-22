/** Rewrite API-hosted upload URLs to same-origin proxy paths for <img> tags. */
export function resolveAttachmentDisplayUrl(attachmentUrl: string): string {
  if (!attachmentUrl) return attachmentUrl;

  try {
    const parsed = new URL(attachmentUrl);
    const match = parsed.pathname.match(/\/(?:api\/)?uploads\/([^/]+)$/);
    if (!match) return attachmentUrl;
    return `/api/uploads/${match[1]}${parsed.search}`;
  } catch {
    if (attachmentUrl.startsWith("/api/uploads/")) return attachmentUrl;
    const relative = attachmentUrl.match(/^\/?(?:api\/)?uploads\/([^/?#]+)(\?.*)?$/);
    if (relative) {
      return `/api/uploads/${relative[1]}${relative[2] ?? ""}`;
    }
    return attachmentUrl;
  }
}
