import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { redeemMobileAuthCode } from "../auth/mobile-auth-codes";
import { exchangeOAuthCode } from "../auth/pco-exchange";

const ExchangeSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().url(),
  state: z.string().min(1),
  requestedNext: z.string().optional(),
});

const MobileCompleteSchema = z.object({
  code: z.string().min(1),
});

export const authRouter = new Hono();

authRouter.post("/pco/exchange", async (c) => {
  const parsed = ExchangeSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const savedState = getCookie(c, "pco_oauth_state");
  if (!savedState || savedState !== parsed.data.state) {
    return c.json({ error: "Invalid OAuth state" }, 400);
  }

  const result = await exchangeOAuthCode({
    code: parsed.data.code,
    redirectUri: parsed.data.redirectUri,
    requestedNext: parsed.data.requestedNext,
  });
  if (!result.ok) {
    return c.json({ error: result.message }, result.status);
  }

  return c.json({
    sessionToken: result.sessionToken,
    redirectTo: result.redirectTo,
    groupsSyncError: result.groupsSyncError,
  });
});

authRouter.post("/mobile/complete", async (c) => {
  const parsed = MobileCompleteSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const session = await redeemMobileAuthCode(parsed.data.code);
  if (!session) {
    return c.json({ error: "Invalid or expired authorization code" }, 400);
  }

  return c.json({ sessionToken: session.sessionToken });
});
