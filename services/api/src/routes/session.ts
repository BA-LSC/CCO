import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { USER_STATUS_PICKER_PRESETS, parseUserStatusPreset } from "@cco/shared";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import { signWsToken } from "../auth/session";
import { parseUserTheme } from "../lib/theme";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  isPlaceholderDisplayName,
  refreshUserAvatarFromPco,
  refreshUserDisplayNameFromPco,
} from "../services/user-profile";
import { updateUserStatus } from "../services/user-status";
import { resolveChurchDisplayName } from "../services/org-display";
import { getConfiguredOrganization } from "../services/org-oauth";

type Env = { Variables: AuthVariables };

const StatusPatchSchema = z.object({
  preset: z.enum(USER_STATUS_PICKER_PRESETS).optional(),
  message: z.string().max(80).nullable().optional(),
});

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
      statusPreset: users.statusPreset,
      statusMessage: users.statusMessage,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!row[0]) return c.json({ error: "User not found" }, 404);

  let avatarUrl = row[0].avatarUrl;
  if (!avatarUrl) {
    avatarUrl = await refreshUserAvatarFromPco(session.userId);
  }

  let displayName = row[0].displayName;
  if (isPlaceholderDisplayName(displayName)) {
    displayName = (await refreshUserDisplayNameFromPco(session.userId)) ?? displayName;
  }

  const orgRow = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  let organizationName = resolveChurchDisplayName(orgRow[0]?.name);
  if (!organizationName) {
    const configured = await getConfiguredOrganization();
    organizationName = resolveChurchDisplayName(configured?.name);
  }

  return c.json({
    userId: row[0].id,
    displayName,
    theme: row[0].theme,
    avatarUrl: avatarUrl ?? null,
    siteAdministrator: row[0].siteAdministrator,
    statusPreset: parseUserStatusPreset(row[0].statusPreset),
    statusMessage: row[0].statusMessage,
    organizationName,
  });
});

sessionRouter.patch("/me/status", requireAuth, async (c) => {
  const session = c.get("session");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = StatusPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  if (parsed.data.preset === undefined && parsed.data.message === undefined) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const status = await updateUserStatus({
    userId: session.userId,
    preset: parsed.data.preset,
    message: parsed.data.message,
  });

  return c.json({
    statusPreset: status.preset,
    statusMessage: status.message,
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
