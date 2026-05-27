import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getServerApiOriginAsync } from "@/lib/api-origin";

type ApiService = { fetch: typeof fetch };

function stripRequestCache(init?: RequestInit): RequestInit | undefined {
  if (!init || init.cache === undefined) return init;
  const { cache: _cache, ...rest } = init;
  return rest;
}

/** Server-side fetch to the CCO API (service binding on Cloudflare, HTTPS otherwise). */
export async function fetchFromApi(path: string, init?: RequestInit): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const apiService = (env as { CCO_API?: ApiService }).CCO_API;
    if (apiService) {
      const origin = await getServerApiOriginAsync();
      const url = `${origin}${normalizedPath}`;
      return apiService.fetch(url, stripRequestCache(init));
    }
  } catch {
    // fall through to public fetch
  }

  const origin = await getServerApiOriginAsync();
  return fetch(`${origin}${normalizedPath}`, init);
}
