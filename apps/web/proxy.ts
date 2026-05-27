import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleRouteGuard, ROUTE_GUARD_MATCHER } from "@/lib/route-guard";

export function proxy(request: NextRequest) {
  return handleRouteGuard(request) ?? NextResponse.next();
}

export const config = {
  matcher: [...ROUTE_GUARD_MATCHER],
};
