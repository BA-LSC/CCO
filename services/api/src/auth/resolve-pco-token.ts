import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { getPcoAccessToken } from "./pco-tokens";

export async function resolvePcoAccessToken(
  session: { userId: string; pcoAccessToken?: string },
  c: Context,
): Promise<string | undefined> {
  const fromRequest =
    session.pcoAccessToken ??
    c.req.header("x-pco-access-token") ??
    getCookie(c, "pco_access_token");
  if (fromRequest) return fromRequest;

  return (await getPcoAccessToken(session.userId)) ?? undefined;
}
