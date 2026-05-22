import { buildAuthorizeUrl } from "@cco/pco-client";
import { NextRequest, NextResponse } from "next/server";
import { getDefaultPcoWebRedirectUri } from "@/lib/pco-oauth";
import { safeNextPath, secureCookie } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";

export async function GET(request: NextRequest) {
  const availabilityRes = await fetch(`${API_URL}/v1/setup/oauth-available`, {
    cache: "no-store",
  }).catch(() => null);

  if (!availabilityRes?.ok) {
    return NextResponse.json({ error: "CCO API is not running" }, { status: 503 });
  }

  const availability = (await availabilityRes.json()) as { signInAvailable?: boolean };
  if (!availability.signInAvailable) {
    const message = encodeURIComponent(
      "Planning Center sign-in is not configured yet. Save your church OAuth credentials on the setup page first.",
    );
    return NextResponse.redirect(new URL(`/auth/error?message=${message}`, request.url));
  }

  const configRes = await fetch(`${API_URL}/v1/setup/oauth-config`, { cache: "no-store" });
  if (!configRes.ok) {
    if (configRes.status === 503) {
      const message = encodeURIComponent(
        "Planning Center sign-in is not configured yet. Save your church OAuth credentials on the setup page first.",
      );
      return NextResponse.redirect(new URL(`/auth/error?message=${message}`, request.url));
    }
    return NextResponse.json({ error: "OAuth client configuration unavailable" }, { status: 503 });
  }

  const config = (await configRes.json()) as {
    clientId: string;
    scope?: string;
    signInRedirectUri?: string;
  };
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const state = crypto.randomUUID();
  const redirectUri = config.signInRedirectUri?.trim() || getDefaultPcoWebRedirectUri();

  const authorizeUrl = buildAuthorizeUrl({
    clientId: config.clientId,
    redirectUri,
    state,
    scope: config.scope,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("pco_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
    ...secureCookie,
  });
  response.cookies.set("pco_oauth_next", next, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
    ...secureCookie,
  });
  return response;
}
