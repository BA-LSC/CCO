const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

function readSetupToken(request: Request): string | undefined {
  const headerToken = request.headers.get("x-setup-token")?.trim();
  if (headerToken) return headerToken;

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "cco_setup_token") {
      const value = rest.join("=").trim();
      if (value) {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }
  }

  return undefined;
}

export async function proxyToApi(request: Request, pathSegments: string[]): Promise<Response> {
  const incoming = new URL(request.url);
  const path = pathSegments.join("/");
  const target = `${API_URL}/v1/${path}${incoming.search}`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const pcoToken = request.headers.get("x-pco-access-token");
  if (pcoToken) headers.set("x-pco-access-token", pcoToken);
  const setupToken = readSetupToken(request);
  if (setupToken) headers.set("x-setup-token", setupToken);
  const setupBootstrap = request.headers.get("x-setup-bootstrap");
  if (setupBootstrap) headers.set("x-setup-bootstrap", setupBootstrap);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  let body: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });

    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("content-type", upstreamType);

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("API proxy failed:", target, err);
    return Response.json(
      {
        error:
          "CCO API is unavailable. Start it with: cd services/api && bun run dev",
      },
      { status: 503 },
    );
  }
}
