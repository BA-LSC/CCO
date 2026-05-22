import type { NextRequest } from "next/server";
import { fetchPcoWebRedirectUri } from "@/lib/pco-oauth";
import { htmlRedirect } from "@/lib/html-redirect";
import { secureCookie } from "@/lib/safe-next-path";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
const EXCHANGE_TIMEOUT_MS = 45_000;

export async function handlePcoOAuthCallback(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return htmlRedirect(
      `${url.origin}/auth/error?message=${encodeURIComponent(oauthError)}`,
    );
  }

  const savedState = request.cookies.get("pco_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return htmlRedirect(`${url.origin}/auth/error?message=Invalid+OAuth+state`);
  }

  const redirectUri = await fetchPcoWebRedirectUri();

  let exchangeRes: Response;
  try {
    exchangeRes = await fetch(`${API_URL}/auth/pco/exchange`, {
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
    const message = timedOut
      ? "Sign-in timed out. Check that the API container is healthy, then try again."
      : "CCO API is not running. Start services/api.";
    return htmlRedirect(`${url.origin}/auth/error?message=${encodeURIComponent(message)}`);
  }

  if (!exchangeRes.ok) {
    const body = (await exchangeRes.json().catch(() => ({}))) as { error?: string };
    const message = encodeURIComponent(
      typeof body.error === "string" ? body.error : "Sign in failed",
    );
    return htmlRedirect(`${url.origin}/auth/error?message=${message}`);
  }

  const data = (await exchangeRes.json()) as {
    sessionToken: string;
    redirectTo?: string;
    groupsSyncError?: string;
  };

  const sessionCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    ...secureCookie,
  };

  const nextPath =
    data.redirectTo ??
    (() => {
      const nextRaw = request.cookies.get("pco_oauth_next")?.value;
      return nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/groups";
    })();

  const redirectUrl = new URL(nextPath, url.origin);
  if (nextPath.startsWith("/groups")) {
    redirectUrl.searchParams.set("synced", "1");
    if (data.groupsSyncError) {
      redirectUrl.searchParams.set("sync_error", data.groupsSyncError);
    }
  }

  return htmlRedirect(redirectUrl.toString(), [
    { name: "pco_oauth_state", delete: true },
    { name: "pco_oauth_next", delete: true },
    { name: "connect_session", value: data.sessionToken, options: sessionCookie },
  ]);
}
