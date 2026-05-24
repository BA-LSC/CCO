import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { conversationMembers } from "../db/schema";

export async function isConversationMember(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const row = await db
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
