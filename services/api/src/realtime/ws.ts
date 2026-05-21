import type { ServerWebSocket } from "bun";
import { eq, and } from "drizzle-orm";
import { verifyWsToken as verifyWsTokenJwt, type WsTokenPayload } from "../auth/session";
import { db } from "../db";
import { conversationMembers } from "../db/schema";
import { subscribeToConversation } from "./pubsub";

type WsData = {
  conversationId: string;
  unsubscribe: () => void;
};

export function handleWebSocketOpen(ws: ServerWebSocket<WsData>): void {
  const conversationId = ws.data.conversationId;
  const unsubscribe = subscribeToConversation(conversationId, (event) => {
    ws.send(JSON.stringify(event));
  });
  ws.data.unsubscribe = unsubscribe;
}

export function handleWebSocketClose(ws: ServerWebSocket<WsData>): void {
  ws.data.unsubscribe?.();
}

export async function verifyWsToken(token: string | null): Promise<WsTokenPayload | null> {
  if (!token) return null;
  return verifyWsTokenJwt(token);
}

export async function verifyWsConversationAccess(
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
