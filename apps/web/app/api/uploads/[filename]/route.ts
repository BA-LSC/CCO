import { type NextRequest } from "next/server";
import { buildUpstreamAuthHeaders } from "@/lib/upstream-auth";

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

function uploadContentTypeForFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return UPLOAD_CONTENT_TYPES[ext];
}

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
    const contentType =
      upstream.headers.get("content-type") ?? uploadContentTypeForFilename(filename);
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
