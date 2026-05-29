"use client";

import type { CallTimelineEventDto } from "@/lib/call-timeline";
import { useOptionalConversationCall } from "@/components/calls/ConversationCallContext";

type Props = {
  event: CallTimelineEventDto;
};

export function CallTimelineJoinAction({ event }: Props) {
  const callCtx = useOptionalConversationCall();
  if (!callCtx || event.kind !== "started") return null;

  const { activeCall, inCall, loading, join } = callCtx;
  if (!activeCall || activeCall.id !== event.callId || inCall) return null;

  return (
    <button
      type="button"
      className="messages-call-join-btn btn btn-secondary btn-sm"
      disabled={loading}
      onClick={() => void join()}
    >
      Join call
    </button>
  );
}
