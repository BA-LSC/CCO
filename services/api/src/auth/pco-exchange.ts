import { exchangeCodeForToken } from "@cco/pco-client";
import { completeOAuthLogin } from "./oauth-complete";
import { isAllowedPcoRedirectUri } from "./pco-redirect-uris";
import { getActiveOrgOAuthCredentials } from "../services/org-oauth";
import { fetchPcoMe } from "../services/setup";

export async function exchangeOAuthCode(params: {
  code: string;
  redirectUri: string;
  requestedNext?: string | null;
}): Promise<
  | {
      ok: true;
      sessionToken: string;
      redirectTo: string;
      groupsSyncError?: string;
    }
  | { ok: false; status: number; message: string }
> {
  const credentials = await getActiveOrgOAuthCredentials();
  if (!credentials) {
    return {
      ok: false,
      status: 503,
      message: "Planning Center OAuth is not configured yet. Ask a church administrator to complete setup.",
    };
  }

  if (!(await isAllowedPcoRedirectUri(params.redirectUri))) {
    return { ok: false, status: 400, message: "Invalid redirect URI" };
  }

  let token;
  try {
    token = await exchangeCodeForToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: params.redirectUri,
      code: params.code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return { ok: false, status: 400, message };
  }

  const profile = await fetchPcoMe(token.access_token);
  if (!profile) {
    return { ok: false, status: 502, message: "Failed to load Planning Center profile" };
  }

  const result = await completeOAuthLogin(profile, token, {
    syncGroups: true,
    requestedNext: params.requestedNext,
  });

  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }

  return {
    ok: true,
    sessionToken: result.sessionToken,
    redirectTo: result.redirectTo,
    groupsSyncError: result.groupsSyncError,
  };
}
