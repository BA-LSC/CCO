import type { NextResponse } from "next/server";
import { isProduction } from "@/lib/safe-next-path";

const AUTH_COOKIE_NAMES = [
  "connect_session",
  "pco_access_token",
  "pco_oauth_state",
  "pco_oauth_next",
  "cco_setup_token",
] as const;

/** Match Secure flag used when cookies were set behind Cloudflare / reverse proxies. */
export function isSecureCookieContext(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  return new URL(request.url).protocol === "https:" || isProduction();
}

export function clearAuthCookies(response: NextResponse, request: Request) {
  const secure = isSecureCookieContext(request);
  const expires = new Date(0);

  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires,
      sameSite: "lax",
      secure,
      ...(name === "cco_setup_token" ? {} : { httpOnly: true }),
    });
  }
}
