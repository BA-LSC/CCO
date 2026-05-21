import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { signWsToken } from "../auth/session";
import { parseUserTheme } from "../lib/theme";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import { refreshUserAvatarFromPco } from "../services/user-profile";

type Env = { Variables: AuthVariables };

export const sessionRouter = new Hono<Env>();

sessionRouter.get("/me", requireAuth, async (c) => {
  const session = c.get("session");
  const row = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      theme: users.theme,
      avatarUrl: users.avatarUrl,
      siteAdministrator: users.siteAdministrator,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row[0]) return c.json({ error: "User not found" }, 404);

  let avatarUrl = row[0].avatarUrl;
  if (!avatarUrl) {
    avatarUrl = await refreshUserAvatarFromPco(session.userId);
  }

  return c.json({
    userId: row[0].id,
    displayName: row[0].displayName,
    theme: row[0].theme,
    avatarUrl: avatarUrl ?? null,
    siteAdministrator: row[0].siteAdministrator,
  });
});

sessionRouter.patch("/me/theme", requireAuth, async (c) => {
  const session = c.get("session");
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const theme = parseUserTheme(
    body && typeof body === "object" && "theme" in body
      ? (body as { theme: unknown }).theme
      : undefined,
  );
  if (!theme) return c.json({ error: "Invalid theme" }, 400);

  const updated = await db
    .update(users)
    .set({ theme })
    .where(eq(users.id, session.userId))
    .returning({ theme: users.theme });

  if (!updated[0]) return c.json({ error: "User not found" }, 404);
  return c.json({ theme: updated[0].theme });
});

sessionRouter.get("/ws-token", requireAuth, async (c) => {
  const session = c.get("session");
  const token = await signWsToken({
    userId: session.userId,
    organizationId: session.organizationId,
  });
  return c.json({ token });
});
