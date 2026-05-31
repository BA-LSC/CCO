const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>();

/** Revoke a blob URL after a delay so mounted <img> elements can finish displaying it. */
export function deferRevokeBlobUrl(url: string, delayMs = 60_000): void {
  if (!url.startsWith("blob:")) return;

  const existing = pendingRevokes.get(url);
  if (existing !== undefined) clearTimeout(existing);

  pendingRevokes.set(
    url,
    setTimeout(() => {
      URL.revokeObjectURL(url);
      pendingRevokes.delete(url);
    }, delayMs),
  );
}

/** Test-only: clear scheduled revokes without revoking URLs. */
export function resetDeferredBlobRevokesForTests(): void {
  for (const timer of pendingRevokes.values()) {
    clearTimeout(timer);
  }
  pendingRevokes.clear();
}
