import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleRouteGuard } from "@/lib/route-guard";

export function proxy(request: NextRequest) {
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
