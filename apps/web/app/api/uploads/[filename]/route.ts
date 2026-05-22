import { type NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { filename } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_URL}/uploads/${encodeURIComponent(filename)}${incoming.search}`;

  try {
    const upstream = await fetch(target, {
      method: "GET",
      signal: AbortSignal.timeout(30_000),
    });

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) headers.set("cache-control", cacheControl);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("Upload proxy failed:", target, err);
    return new Response("Upload unavailable", { status: 503 });
  }
}
