import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleRouteGuard, ROUTE_GUARD_MATCHER } from "@/lib/route-guard";

/** Edge middleware for OpenNext / Cloudflare Pages (proxy.ts is not supported by OpenNext yet). */
export function middleware(request: NextRequest) {
  return handleRouteGuard(request) ?? NextResponse.next();
}

export const config = {
  matcher: [...ROUTE_GUARD_MATCHER],
};
