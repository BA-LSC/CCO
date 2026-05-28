import { fetchFromApi } from "@/lib/api-fetch-server";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";
import { isDeployDraining } from "@/lib/deploy-status.server";
import { buildUpstreamAuthHeaders } from "@/lib/upstream-auth";

const UPLOAD_PROXY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PROXY_TIMEOUT_MS = 30_000;

const UPSTREAM_MEDIA_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

type FetchInitWithDuplex = RequestInit & { duplex?: "half" };

function isUploadPost(method: string, path: string): boolean {
  return method === "POST" && path === "uploads";
}

function isUploadMediaRequest(method: string, path: string): boolean {
  return (method === "GET" || method === "HEAD") && path.startsWith("uploads/");
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

function copyUpstreamMediaHeaders(upstream: Response): Headers {
  const responseHeaders = new Headers();
  for (const name of UPSTREAM_MEDIA_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return responseHeaders;
}

export async function proxyToApi(request: Request, pathSegments: string[]): Promise<Response> {
  const incoming = new URL(request.url);
  const path = pathSegments.join("/");
  const targetPath = `/v1/${path}${incoming.search}`;

  const headers = buildUpstreamAuthHeaders(request);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const pcoToken = request.headers.get("x-pco-access-token");
  if (pcoToken) headers.set("x-pco-access-token", pcoToken);
  const setupToken = readSetupToken(request);
  if (setupToken) headers.set("x-setup-token", setupToken);
  const setupBootstrap = request.headers.get("x-setup-bootstrap");
  if (setupBootstrap) headers.set("x-setup-bootstrap", setupBootstrap);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  const referer = request.headers.get("referer");
  if (referer) headers.set("referer", referer);
  if (request.method === "POST" && path === "uploads/presign") {
    headers.set("X-CCO-Chat-Origin", new URL(request.url).origin);
  }

  const uploadPost = isUploadPost(request.method, path);
  const uploadMedia = isUploadMediaRequest(request.method, path);

  const range = request.headers.get("range");
  if (range && uploadMedia) headers.set("range", range);

  let requestBody: BodyInit | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (uploadPost && request.body) {
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
        uploadPost ? UPLOAD_PROXY_TIMEOUT_MS : DEFAULT_PROXY_TIMEOUT_MS,
      ),
    };
    if (uploadPost && requestBody) {
      fetchInit.duplex = "half";
    }

    const upstream = await fetchFromApi(targetPath, fetchInit);

    if (uploadMedia) {
      return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        headers: copyUpstreamMediaHeaders(upstream),
      });
    }

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
    console.error("API proxy failed:", targetPath, err);
    const updating = await isDeployDraining();
    const error =
      updating
        ? "CCO is updating. Please wait a moment."
        : process.env.NODE_ENV === "production"
          ? "The server is temporarily unavailable. Please try again in a moment."
          : isCloudflareDeployTarget()
            ? "CCO API is unavailable. Check api.<your-domain> health."
            : "CCO API is unavailable. Start it with: cd services/api && bun run dev";
    return Response.json({ error, updating }, { status: 503 });
  }
}
