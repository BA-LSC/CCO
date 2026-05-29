"use client";

import { canJoinCallAsParticipant } from "@cco/shared/calls";
import type { CallTimelineEventDto } from "@/lib/call-timeline";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";

type Props = {
  event: CallTimelineEventDto;
  conversationId: string;
};

export function CallTimelineJoinAction({ event, conversationId }: Props) {
  const callCtx = useOptionalActiveCall();
  const { getActiveCall } = useActiveCallsMap();
  const { session } = useChatLayout();

  if (event.kind !== "started") return null;

  const active = getActiveCall(conversationId);
  if (!active || active.id !== event.callId) return null;
  if (!canJoinCallAsParticipant(active, session?.userId)) return null;

  const inCallHere = callCtx?.inCallOnConversation(conversationId) ?? false;
  if (inCallHere) return null;

  return (
    <button
      type="button"
      className="messages-call-join-btn btn btn-secondary btn-sm"
      disabled={callCtx?.loading}
      onClick={() => callCtx?.joinConversation(conversationId)}
    >
      Join call
    </button>
  );
}
