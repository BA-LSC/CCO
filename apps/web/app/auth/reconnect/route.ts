import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/session-cookies";
import { publicUrl } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

/** Clears CCO session cookies and starts a fresh Planning Center authorization. */
export async function GET(request: Request) {
  const target = publicUrl(request, "/auth/sign-in?reconnect=1");

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCookies(response, request);
  return response;
}
