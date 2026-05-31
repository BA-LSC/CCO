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
      imageUrl?: string | null;
    }
  | {
      type: "conversation.read";
      conversationId: string;
      userId: string;
      readAt: string;
    }
  | { type: "call.started"; conversationId: string; call: import("@cco/shared/calls").CallSummaryDto; timelineEvent: import("@cco/shared/call-timeline").CallTimelineEventDto }
  | { type: "call.updated"; conversationId: string; call: import("@cco/shared/calls").CallSummaryDto }
  | { type: "call.ended"; conversationId: string; callId: string; timelineEvent: import("@cco/shared/call-timeline").CallTimelineEventDto | null }
  | {
      type: "typing";
      conversationId: string;
      userId: string;
      displayName: string;
      isTyping: boolean;
    }
  | {
      type: "presence.updated";
      userId: string;
      online: boolean;
      inCall: string | null;
    };

export function redisChannelForConversation(conversationId: string): string {
  return `connect:conversation:${conversationId}`;
}
