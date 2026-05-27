import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleRouteGuard } from "@/lib/route-guard";

export function proxy(request: NextRequest) {
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
