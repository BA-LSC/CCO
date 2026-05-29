"use client";

import type { CallTimelineEventDto } from "@/lib/call-timeline";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";

type Props = {
  event: CallTimelineEventDto;
  conversationId: string;
};

export function CallTimelineJoinAction({ event, conversationId }: Props) {
  const callCtx = useOptionalActiveCall();
  const { getActiveCall } = useActiveCallsMap();

  if (event.kind !== "started") return null;

  const active = getActiveCall(conversationId);
  if (!active || active.id !== event.callId) return null;

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
