import { SignJWT, jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type SessionPayload = {
  userId: string;
  organizationId: string;
  pcoAccessToken?: string;
};

export type WsTokenPayload = {
  userId: string;
  organizationId: string;
  scope: "ws";
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function signWsToken(payload: {
  userId: string;
  organizationId: string;
}): Promise<string> {
  return new SignJWT({ ...payload, scope: "ws" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.scope === "ws") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function verifyWsToken(token: string): Promise<WsTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.scope !== "ws") return null;
    return payload as WsTokenPayload;
  } catch {
    return null;
  }
}
