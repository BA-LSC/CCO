import { buildAuthorizeUrl } from "@cco/pco-client";
import { NextRequest, NextResponse } from "next/server";
import { fetchFromApi } from "@/lib/api-fetch-server";
import { getDefaultPcoWebRedirectUri } from "@/lib/pco-oauth";
import { publicUrl } from "@/lib/public-origin";
import { safeNextPath, secureCookie } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

async function fetchSetupRouteApi(
  request: NextRequest,
  apiPath: string,
): Promise<Response | null> {
  const direct = await fetchFromApi(apiPath, { cache: "no-store" }).catch(() => null);
  if (direct?.ok) return direct;

  const viaWebProxy = await fetch(publicUrl(request, `/api${apiPath}`), {
    cache: "no-store",
  }).catch(() => null);
  if (viaWebProxy?.ok) return viaWebProxy;

  return direct;
}

export async function GET(request: NextRequest) {
  const availabilityRes = await fetchSetupRouteApi(request, "/v1/setup/oauth-available");

  if (!availabilityRes?.ok) {
    return NextResponse.json({ error: "CCO API is not running" }, { status: 503 });
  }

  const availability = (await availabilityRes.json()) as { signInAvailable?: boolean };
  if (!availability.signInAvailable) {
    const message = encodeURIComponent(
      "Planning Center sign-in is not configured yet. Save your church OAuth credentials on the setup page first.",
    );
    return NextResponse.redirect(
      publicUrl(request, `/auth/error?message=${message}`),
    );
  }

  const configRes = await fetchSetupRouteApi(request, "/v1/setup/oauth-config");
  if (!configRes) {
    return NextResponse.json({ error: "CCO API is not running" }, { status: 503 });
  }
  if (!configRes.ok) {
    if (configRes.status === 503) {
      const message = encodeURIComponent(
        "Planning Center sign-in is not configured yet. Save your church OAuth credentials on the setup page first.",
      );
      return NextResponse.redirect(
        publicUrl(request, `/auth/error?message=${message}`),
      );
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
