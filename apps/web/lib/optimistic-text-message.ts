import type { Message } from "@/lib/api";
import { sortMessagesByCreatedAt } from "@/lib/message-order";

const PENDING_SEND_ID_PREFIX = "pending-send:";

export function pendingSendMessageId(clientMessageId: string): string {
  return `${PENDING_SEND_ID_PREFIX}${clientMessageId}`;
}

export function isPendingSendMessage(message: Pick<Message, "id" | "pendingSend">): boolean {
  return message.pendingSend === true || message.id.startsWith(PENDING_SEND_ID_PREFIX);
}

export function createPendingSendMessage(params: {
  clientMessageId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  body: string;
}): Message {
  return {
    id: pendingSendMessageId(params.clientMessageId),
    authorId: params.authorId,
    authorName: params.authorName,
    authorAvatarUrl: params.authorAvatarUrl,
    body: params.body,
    attachmentUrl: null,
    messageType: "text",
    createdAt: new Date().toISOString(),
    pendingSend: true,
    clientMessageId: params.clientMessageId,
  };
}

export function removePendingSendByClientMessageId(
  messages: Message[],
  clientMessageId: string | undefined,
): Message[] {
  if (!clientMessageId) return messages;
  const pendingId = pendingSendMessageId(clientMessageId);
  return messages.filter((m) => m.id !== pendingId);
}

export function replacePendingSendMessage(
  messages: Message[],
  clientMessageId: string,
  message: Message,
): Message[] {
  const withoutPending = removePendingSendByClientMessageId(messages, clientMessageId);
  if (withoutPending.some((m) => m.id === message.id)) return withoutPending;
  return sortMessagesByCreatedAt([...withoutPending, message]);
}
