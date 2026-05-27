export interface Env {
  GIPHY_API_KEY: string;
  INTERNAL_AUTH_SECRET?: string;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const userValue = encoder.encode(a);
  const secretValue = encoder.encode(b);
  // Avoid early return on length mismatch — that leaks secret length via timing.
  const lengthsMatch = userValue.byteLength === secretValue.byteLength;
  return lengthsMatch
    ? crypto.subtle.timingSafeEqual(userValue, secretValue)
    : !crypto.subtle.timingSafeEqual(userValue, userValue);
}

function requireSession(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  if (!env.INTERNAL_AUTH_SECRET) return false;
  return timingSafeEqualString(auth.slice(7), env.INTERNAL_AUTH_SECRET);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!requireSession(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/v1\/giphy/, "");

    if (path === "/status") {
      return Response.json({ enabled: Boolean(env.GIPHY_API_KEY) });
    }

    if (!env.GIPHY_API_KEY) {
      return Response.json({ error: "Giphy is not configured" }, { status: 503 });
    }

    const giphyUrl = new URL(`https://api.giphy.com/v1/gifs${path}`);
    giphyUrl.searchParams.set("api_key", env.GIPHY_API_KEY);
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
