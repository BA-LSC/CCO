const PCO_AUTHORIZE_URL = "https://api.planningcenteronline.com/oauth/authorize";
const PCO_TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";

/** Space-separated PCO product scopes (required on authorize URL). */
export const DEFAULT_PCO_OAUTH_SCOPE = "people groups services";

export type AuthorizeUrlParams = {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
};

export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(PCO_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", params.scope ?? DEFAULT_PCO_OAUTH_SCOPE);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
};

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(PCO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`PCO token exchange failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  );
}

export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }),
  );
}
