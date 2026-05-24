import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-origin";

const PROTECTED_PREFIXES = ["/groups", "/teams", "/dms", "/settings"];

/** Forward session cookie as Bearer so API rewrites authenticate reliably. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get("connect_session")?.value;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !session) {
    const signIn = publicUrl(request, "/auth/sign-in");
    signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  const isApiProxy =
    pathname.startsWith("/api/v1/") || pathname.startsWith("/api/uploads/");

  if (!isApiProxy) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${session}`);
  }

  return NextResponse.next({ request: { headers } });
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
