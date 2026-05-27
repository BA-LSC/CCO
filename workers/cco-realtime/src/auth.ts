import { jwtVerify } from "jose";

export type WsTokenPayload = {
  userId: string;
  organizationId: string;
  scope: "ws";
};

export function extractBearerToken(request: Request, url: URL): string | null {
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const auth = request.headers.get("Authorization");
  if (!auth) return null;

  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function verifyWsToken(
  token: string,
  sessionSecret: string,
): Promise<WsTokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(sessionSecret);
    const { payload } = await jwtVerify(token, secret);
    if (payload.scope !== "ws") return null;
    return payload as WsTokenPayload;
  } catch {
    return null;
  }
}
