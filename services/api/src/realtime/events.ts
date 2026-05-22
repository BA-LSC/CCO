import type { MessageDto } from "../services/messages";
import type { ReactionDto } from "../services/reactions";

export type RealtimeEvent =
  | { type: "message.created"; conversationId: string; message: MessageDto }
  | { type: "message.updated"; conversationId: string; message: MessageDto }
  | { type: "message.deleted"; conversationId: string; messageId: string }
  | {
      type: "reaction.changed";
      conversationId: string;
      messageId: string;
      action: "added" | "removed";
      reaction: ReactionDto;
    }
  | {
      type: "conversation.updated";
      conversationId: string;
      leaderOnly?: boolean;
      title?: string;
    };

export function redisChannelForConversation(conversationId: string): string {
  return `connect:conversation:${conversationId}`;
}
