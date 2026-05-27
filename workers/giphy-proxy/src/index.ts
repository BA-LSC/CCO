type SecretsStoreSecretBinding = { get(): Promise<string> };

export interface Env {
  GIPHY_API_KEY: SecretsStoreSecretBinding | string;
  INTERNAL_AUTH_SECRET?: SecretsStoreSecretBinding | string;
}

async function resolveSecret(
  binding: SecretsStoreSecretBinding | string | undefined,
): Promise<string> {
  if (binding == null) return "";
  if (typeof binding === "string") return binding;
  return (await binding.get()) ?? "";
}

function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const userValue = encoder.encode(a);
  const secretValue = encoder.encode(b);
  const lengthsMatch = userValue.byteLength === secretValue.byteLength;
  return lengthsMatch
    ? crypto.subtle.timingSafeEqual(userValue, secretValue)
    : !crypto.subtle.timingSafeEqual(userValue, userValue);
}

async function requireSession(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const internalSecret = await resolveSecret(env.INTERNAL_AUTH_SECRET);
  if (!internalSecret) return false;
  return timingSafeEqualString(auth.slice(7), internalSecret);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await requireSession(request, env))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const giphyApiKey = await resolveSecret(env.GIPHY_API_KEY);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/v1\/giphy/, "");

    if (path === "/status") {
      return Response.json({ enabled: Boolean(giphyApiKey) });
    }

    if (!giphyApiKey) {
      return Response.json({ error: "Giphy is not configured" }, { status: 503 });
    }

    const giphyUrl = new URL(`https://api.giphy.com/v1/gifs${path}`);
    giphyUrl.searchParams.set("api_key", giphyApiKey);
    for (const [key, value] of url.searchParams.entries()) {
      giphyUrl.searchParams.set(key, value);
    }

    const upstream = await fetch(giphyUrl.toString(), {
      method: request.method,
      headers: { Accept: "application/json" },
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  },
};
