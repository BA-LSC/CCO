import { setCookie } from "hono/cookie";
import type { Context } from "hono";
import { Hono } from "hono";
import { buildAuthorizeUrl, exchangeCodeForToken } from "@cco/pco-client";
import { getActiveOrgOAuthCredentials } from "../services/org-oauth";
import { fetchPcoMe } from "../services/setup";
import { completeOAuthLogin, setSessionCookies } from "./oauth-complete";
import { createMobileAuthCode } from "./mobile-auth-codes";

export { buildAuthorizeUrl };

const oauthApp = new Hono();

function redirectUriForPlatform(platform: "web" | "mobile"): string {
  if (platform === "mobile") {
    return (
      process.env.PCO_MOBILE_REDIRECT_URI ??
      "http://localhost:3001/auth/pco/mobile/callback"
    );
  }
  return process.env.PCO_REDIRECT_URI ?? "http://localhost:3001/auth/pco/callback";
}

oauthApp.get("/start", async (c) => {
  const credentials = await getActiveOrgOAuthCredentials();
  if (!credentials) {
    return c.text("Planning Center OAuth is not configured", 503);
  }

  const platform = c.req.query("platform") === "mobile" ? "mobile" : "web";
  const state = crypto.randomUUID();

  const url = buildAuthorizeUrl({
    clientId: credentials.clientId,
    redirectUri: redirectUriForPlatform(platform),
    state,
    scope: credentials.scope,
  });

  setCookie(c, "pco_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  setCookie(c, "pco_oauth_platform", platform, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  return c.redirect(url);
});

async function handleCallback(c: Context, platform: "web" | "mobile") {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = c.req.cookie("pco_oauth_state");

  if (!code || !state || state !== savedState) {
    return c.text("Invalid OAuth state", 400);
  }

  const credentials = await getActiveOrgOAuthCredentials();
  if (!credentials) {
    return c.text("Planning Center OAuth is not configured", 503);
  }

  const token = await exchangeCodeForToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectUri: redirectUriForPlatform(platform),
    code,
  });

  const profile = await fetchPcoMe(token.access_token);
  if (!profile) return c.text("Failed to load PCO profile", 502);

  const result = await completeOAuthLogin(profile, token);

  if (!result.ok) {
    if (platform === "mobile") {
      const scheme = process.env.MOBILE_APP_SCHEME ?? "connect";
      return c.redirect(
        `${scheme}://oauth/callback?error=${encodeURIComponent(result.message)}`,
      );
    }
    return c.text(result.message, result.status);
  }

  if (platform === "mobile") {
    const scheme = process.env.MOBILE_APP_SCHEME ?? "connect";
    const code = await createMobileAuthCode(result.sessionToken);
    return c.redirect(`${scheme}://oauth/callback?code=${encodeURIComponent(code)}`);
  }

  setSessionCookies(c, result.sessionToken);
  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  let redirectPath = result.redirectTo;
  if (redirectPath.startsWith("/groups")) {
    const separator = redirectPath.includes("?") ? "&" : "?";
    redirectPath = `${redirectPath}${separator}synced=1`;
    if (result.groupsSyncError) {
      redirectPath += `&sync_error=${encodeURIComponent(result.groupsSyncError)}`;
    }
  }
  return c.redirect(`${webUrl}${redirectPath}`);
}

oauthApp.get("/callback", (c) => {
  const platform = c.req.cookie("pco_oauth_platform") === "mobile" ? "mobile" : "web";
  return handleCallback(c, platform);
});

oauthApp.get("/mobile/callback", (c) => handleCallback(c, "mobile"));

export function mountPcoOAuth(parent: Hono): void {
  parent.route("/auth/pco", oauthApp);
}
