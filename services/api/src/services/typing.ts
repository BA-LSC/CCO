import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { publishMessageEventToMembers } from "../realtime/pubsub";
import { isConversationMember } from "./call-access";
import { listConversationMemberUserIds } from "./conversations";

export async function publishTypingIndicator(params: {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}): Promise<{ ok: true } | { error: string; status: number }> {
  const allowed = await isConversationMember(params.conversationId, params.userId);
  if (!allowed) return { error: "Forbidden", status: 403 };

  const userRow = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const memberUserIds = await listConversationMemberUserIds(params.conversationId);
  await publishMessageEventToMembers(
    {
      type: "typing",
      conversationId: params.conversationId,
      userId: params.userId,
      displayName: userRow[0]?.displayName?.trim() || "Someone",
      isTyping: params.isTyping,
    },
    memberUserIds,
  );

  return { ok: true };
}
