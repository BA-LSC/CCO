import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/session-cookies";
import { publicUrl } from "@/lib/public-origin";
import { safeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"), "/");
  const target = publicUrl(request, next);

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCookies(response, request);
  return response;
}
