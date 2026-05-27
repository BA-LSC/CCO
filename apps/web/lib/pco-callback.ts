import { NextResponse, type NextRequest } from "next/server";
import { fetchFromApi } from "@/lib/api-fetch-server";
import { isCloudflareDeployTarget } from "@/lib/cloudflare-deploy";
import { getPublicOrigin, publicUrl } from "@/lib/public-origin";
import { isSecureCookieContext } from "@/lib/session-cookies";

const EXCHANGE_TIMEOUT_MS = 30_000;

function callbackRedirectUri(request: NextRequest): string {
  const url = new URL(request.url);
  return `${getPublicOrigin(request)}${url.pathname}`;
}

function errorRedirect(request: NextRequest, message: string) {
  const target = publicUrl(request, "/auth/error");
  target.searchParams.set("message", message);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function apiUnavailableMessage(timedOut: boolean): string {
  if (timedOut) {
    return isCloudflareDeployTarget()
      ? "Sign-in timed out. Check that api.<your-domain> is healthy, then try again."
      : "Sign-in timed out. Check that the API container is healthy, then try again.";
  }
  return isCloudflareDeployTarget()
    ? "CCO API is unavailable. Check api.<your-domain> health."
    : "CCO API is not running. Start services/api.";
}

export async function handlePcoOAuthCallback(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return errorRedirect(request, oauthError);
  }

  const savedState = request.cookies.get("pco_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return errorRedirect(request, "Invalid OAuth state");
  }

  const redirectUri = callbackRedirectUri(request);

  let exchangeRes: Response;
  try {
    exchangeRes = await fetchFromApi("/auth/pco/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        code,
        redirectUri,
        state,
        requestedNext: request.cookies.get("pco_oauth_next")?.value ?? null,
      }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return errorRedirect(request, apiUnavailableMessage(timedOut));
  }

  if (!exchangeRes.ok) {
    const body = (await exchangeRes.json().catch(() => ({}))) as { error?: string };
    return errorRedirect(
      request,
      typeof body.error === "string" ? body.error : "Sign in failed",
    );
  }

  const data = (await exchangeRes.json()) as {
    sessionToken: string;
    redirectTo?: string;
    groupsSyncError?: string;
  };

  const nextPath =
    data.redirectTo ??
    (() => {
      const nextRaw = request.cookies.get("pco_oauth_next")?.value;
      return nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/groups";
    })();

  const redirectUrl = publicUrl(request, nextPath);
  if (nextPath.startsWith("/groups")) {
    redirectUrl.searchParams.set("synced", "1");
    if (data.groupsSyncError) {
      redirectUrl.searchParams.set("sync_error", data.groupsSyncError);
    }
  }

  const secure = isSecureCookieContext(request);
  const response = NextResponse.redirect(redirectUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("connect_session", data.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    secure,
  });
  response.cookies.set("pco_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    secure,
  });
  response.cookies.set("pco_oauth_next", "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    secure,
  });

  return response;
}
