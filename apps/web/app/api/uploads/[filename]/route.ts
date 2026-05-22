import { type NextRequest } from "next/server";
import { buildUpstreamAuthHeaders } from "@/lib/upstream-auth";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { filename } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_URL}/uploads/${encodeURIComponent(filename)}${incoming.search}`;

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: buildUpstreamAuthHeaders(request),
      signal: AbortSignal.timeout(30_000),
    });

    const outHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) outHeaders.set("content-type", contentType);
    outHeaders.set("cache-control", "private, no-store");

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
