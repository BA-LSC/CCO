import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRouteGuard } from "@/lib/route-guard";

/** Edge middleware for OpenNext / Cloudflare Pages (proxy.ts is not supported by OpenNext yet). */
export function middleware(request: NextRequest) {
  return handleRouteGuard(request) ?? NextResponse.next();
}

// Keep in sync with ROUTE_GUARD_MATCHER in @/lib/route-guard (Next.js requires inline literals).
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
    "/settings/:path*",
    "/settings",
  ],
};
