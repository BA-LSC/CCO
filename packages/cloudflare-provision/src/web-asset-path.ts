export function normalizeWebAssetManifestPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
