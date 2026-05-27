import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRouteGuard } from "@/lib/route-guard";

/** Edge middleware for OpenNext / Cloudflare Pages (proxy.ts is not supported by OpenNext yet). */
export function middleware(request: NextRequest) {
  return handleRouteGuard(request) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/api/uploads/:path*",
    "/groups/:path*",
    "/groups",
    "/teams/:path*",
    "/teams",
    "/dms/:path*",
    "/dms",
    "/setup/:path*",
    "/setup",
    "/settings/:path*",
    "/settings",
  ],
};
