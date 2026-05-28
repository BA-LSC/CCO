/** Worker bundles published under `{releasesBaseUrl}/{name}.mjs`. */
export const RELEASE_WORKER_BUNDLE_NAMES = [
  "cco-api",
  "cco-realtime-fanout",
  "cco-pco-webhook",
  "cco-push-consumer",
  "cco-reconcile-cron",
] as const;

/** Legacy stub artifact only (not a deployed worker in current provision). */
export const LEGACY_RELEASE_ARTIFACT_FILES = ["cco-giphy-proxy.mjs"] as const;

export const RELEASE_REQUIRED_ARTIFACTS = [
  ...RELEASE_WORKER_BUNDLE_NAMES.map((name) => `${name}.mjs`),
  ...LEGACY_RELEASE_ARTIFACT_FILES,
  "cco-web.mjs",
  "cco-web-manifest.json",
  "release-index.json",
  "0000_d1_baseline.sql",
] as const;

export type ReleaseArtifactsCheck = {
  ready: boolean;
  missing: string[];
};

async function artifactExists(
  url: string,
  fetchFn: typeof fetch,
): Promise<boolean> {
  const res = await fetchFn(url, { method: "HEAD", cache: "no-store" });
  if (res.ok) return true;
  if (res.status === 404 || res.status === 403) return false;
  if (res.status === 405 || res.status === 501) {
    const getRes = await fetchFn(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    return getRes.ok || getRes.status === 206;
  }
  return false;
}

/** True when every required release file responds at the org releases base URL. */
export async function verifyReleaseArtifactsReady(
  releasesBaseUrl: string,
  options?: { fetchFn?: typeof fetch },
): Promise<ReleaseArtifactsCheck> {
  const base = releasesBaseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    return { ready: false, missing: [...RELEASE_REQUIRED_ARTIFACTS] };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const missing: string[] = [];

  await Promise.all(
    RELEASE_REQUIRED_ARTIFACTS.map(async (artifact) => {
      const url = `${base}/${artifact}`;
      const exists = await artifactExists(url, fetchFn);
      if (!exists) missing.push(artifact);
    }),
  );

  missing.sort();
  return { ready: missing.length === 0, missing };
}
