const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
const UPLOAD_PROXY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PROXY_TIMEOUT_MS = 30_000;

type FetchInitWithDuplex = RequestInit & { duplex?: "half" };

function isUploadRequest(method: string, path: string): boolean {
  return method === "POST" && path === "uploads";
}

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

  const uploadRequest = isUploadRequest(request.method, path);

  let requestBody: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (uploadRequest && request.body) {
      requestBody = request.body;
    } else {
      requestBody = await request.arrayBuffer();
    }
  }

  try {
    const fetchInit: FetchInitWithDuplex = {
      method: request.method,
      headers,
      body: requestBody,
      signal: AbortSignal.timeout(
        uploadRequest ? UPLOAD_PROXY_TIMEOUT_MS : DEFAULT_PROXY_TIMEOUT_MS,
      ),
    };
    if (uploadRequest && requestBody) {
      fetchInit.duplex = "half";
    }

    const upstream = await fetch(target, fetchInit);

    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type") ?? "";
    if (upstreamType) responseHeaders.set("content-type", upstreamType);

    const isTextBody =
      upstreamType.startsWith("text/") ||
      upstreamType.includes("application/json") ||
      upstreamType.includes("javascript");

    const responseBody = isTextBody ? await upstream.text() : await upstream.arrayBuffer();

    return new Response(responseBody, {
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
