import { type NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { filename } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_URL}/uploads/${encodeURIComponent(filename)}${incoming.search}`;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    const outHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) outHeaders.set("content-type", contentType);
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) outHeaders.set("cache-control", cacheControl);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) outHeaders.set("content-length", contentLength);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  } catch (err) {
    console.error("Upload proxy failed:", target, err);
    return new Response("Upload unavailable", { status: 503 });
  }
}
