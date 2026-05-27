import { and, eq } from "drizzle-orm";
import { createD1Client } from "@cco/db";
import { conversationMembers } from "@cco/db/schema";

export async function verifyWsConversationAccess(
  db: D1Database,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const client = createD1Client(db);
  const row = await client
    .select({ id: conversationMembers.id })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(row[0]);
}
