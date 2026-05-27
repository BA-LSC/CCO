import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";
import { safeNextPath } from "@/lib/safe-next-path";

export const SESSION_COOKIE_NAME = "connect_session";

/** App routes that require a signed-in session (see proxy/middleware matcher). */
export const PROTECTED_PREFIXES = ["/groups", "/teams", "/dms", "/settings"] as const;

/** Passed to server components so layout guards can preserve the return URL. */
export const RETURN_PATH_HEADER = "x-return-path";

export const ROUTE_GUARD_MATCHER = [
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
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function buildReturnPath(request: NextRequest | Request): string {
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;
  return safeNextPath(path, "/groups");
}

export function buildSignInRedirect(request: NextRequest | Request): NextResponse {
  const signIn = publicUrl(request, "/auth/sign-in");
  signIn.searchParams.set("next", buildReturnPath(request));
  return NextResponse.redirect(signIn);
}

function passThroughWithReturnPath(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(RETURN_PATH_HEADER, buildReturnPath(request));
  return NextResponse.next({ request: { headers } });
}

/** Forward session cookie as Bearer so API rewrites authenticate reliably. */
export function handleRouteGuard(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isProtected = isProtectedPath(pathname);

  if (isProtected && !session) {
    return buildSignInRedirect(request);
  }

  const isApiProxy =
    pathname.startsWith("/api/v1/") || pathname.startsWith("/api/uploads/");

  if (isApiProxy) {
    if (!session) {
      return undefined;
    }

    const headers = new Headers(request.headers);
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${session}`);
    }

    return NextResponse.next({ request: { headers } });
  }

  if (isProtected) {
    return passThroughWithReturnPath(request);
  }

  return undefined;
}
