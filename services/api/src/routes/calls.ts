import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  endCall,
  getActiveCallForConversation,
  inviteToCall,
  joinCall,
  joinCallAsGuest,
  leaveCall,
  previewGuestCall,
  searchCallInviteCandidates,
  startOrJoinConversationCall,
} from "../services/calls";
import { isConversationMember } from "../services/call-access";
import {
  isMissingOrgMigrationColumnsError,
  ORG_MIGRATIONS_0021_0023_MESSAGE,
} from "../services/org-db-migrations";

type Env = { Variables: AuthVariables };

export const callsRouter = new Hono<Env>();

const InviteSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  externalGuest: z.boolean().optional(),
});

const GuestJoinSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1).max(80),
});

const GuestPreviewSchema = z.object({
  token: z.string().min(1),
});

function resolveWebUrl(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    process.env.WEB_URL?.trim() ||
    c.req.header("Origin")?.trim() ||
    process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
    "http://localhost:3000"
  );
}

callsRouter.get("/invite-candidates", requireAuth, async (c) => {
  const session = c.get("session");
  const q = c.req.query("q") ?? undefined;
  const people = await searchCallInviteCandidates({
    organizationId: session.organizationId,
    query: q,
  });
  return c.json({ people });
});

callsRouter.post("/:callId/join", requireAuth, async (c) => {
  const session = c.get("session");
  const callId = c.req.param("callId");
  if (!callId) return c.json({ error: "callId required" }, 400);
  const result = await joinCall({ callId, userId: session.userId });
  if (!result) return c.json({ error: "Forbidden or call ended" }, 403);
  return c.json(result);
});

callsRouter.post("/:callId/invite", requireAuth, async (c) => {
  const session = c.get("session");
  const callId = c.req.param("callId");
  if (!callId) return c.json({ error: "callId required" }, 400);
  const body = InviteSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await inviteToCall({
    callId,
    userId: session.userId,
    organizationId: session.organizationId,
    targetUserId: body.data.targetUserId,
    externalGuest: body.data.externalGuest,
    webUrl: resolveWebUrl(c),
  });

  if (!result) return c.json({ error: "Forbidden or call not found" }, 403);
  return c.json(result);
});

callsRouter.post("/:callId/leave", requireAuth, async (c) => {
  const session = c.get("session");
  const callId = c.req.param("callId");
  if (!callId) return c.json({ error: "callId required" }, 400);
  const ok = await leaveCall({ callId, userId: session.userId });
  if (!ok) return c.json({ error: "Not in call" }, 404);
  return c.json({ left: true });
});

callsRouter.post("/:callId/end", requireAuth, async (c) => {
  const session = c.get("session");
  const callId = c.req.param("callId");
  if (!callId) return c.json({ error: "callId required" }, 400);
  const ok = await endCall({ callId, userId: session.userId });
  if (!ok) return c.json({ error: "Forbidden or call not found" }, 403);
  return c.json({ ended: true });
});

callsRouter.post("/guest/preview", async (c) => {
  const body = GuestPreviewSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const preview = await previewGuestCall(body.data.token);
  if (!preview) return c.json({ error: "Invalid invite" }, 404);
  return c.json(preview);
});

callsRouter.post("/guest/join", async (c) => {
  const body = GuestJoinSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await joinCallAsGuest({
    rawToken: body.data.token,
    displayName: body.data.displayName,
  });
  if (!result) return c.json({ error: "Invalid or expired invite" }, 403);
  return c.json(result);
});

export function mountConversationCallRoutes(conversationsRouter: Hono<Env>): void {
  conversationsRouter.post("/:id/calls", requireAuth, async (c) => {
    const session = c.get("session");
    const conversationId = c.req.param("id");
    if (!conversationId) return c.json({ error: "conversationId required" }, 400);
    try {
      const result = await startOrJoinConversationCall({
        conversationId,
        userId: session.userId,
        organizationId: session.organizationId,
      });
      if (!result) return c.json({ error: "Forbidden" }, 403);
      return c.json(result);
    } catch (err) {
      if (isMissingOrgMigrationColumnsError(err)) {
        return c.json({ error: ORG_MIGRATIONS_0021_0023_MESSAGE }, 503);
      }
      const message = err instanceof Error ? err.message : "Failed to start call";
      return c.json({ error: message }, 503);
    }
  });

  conversationsRouter.get("/:id/calls/active", requireAuth, async (c) => {
    const session = c.get("session");
    const conversationId = c.req.param("id");
    if (!conversationId) return c.json({ error: "conversationId required" }, 400);
    const allowed = await isConversationMember(conversationId, session.userId);
    if (!allowed) return c.json({ error: "Forbidden" }, 403);

    const call = await getActiveCallForConversation(conversationId);
    return c.json({ call });
  });
}
