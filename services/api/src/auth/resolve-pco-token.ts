import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { getPcoAccessToken } from "./pco-tokens";

export async function resolvePcoAccessToken(
  session: { userId: string; pcoAccessToken?: string },
  c: Context,
): Promise<string | undefined> {
  const fromDb = await getPcoAccessToken(session.userId);
  return (
    fromDb ??
    session.pcoAccessToken ??
    c.req.header("x-pco-access-token") ??
    getCookie(c, "pco_access_token") ??
    undefined
  );
}
