import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/session-cookies";

export const dynamic = "force-dynamic";

/** Clears CCO session cookies and starts a fresh Planning Center authorization. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/auth/sign-in?reconnect=1", url.origin);

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCookies(response, request);
  return response;
}
