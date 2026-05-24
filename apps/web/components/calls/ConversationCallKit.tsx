"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { useCallSession } from "@/hooks/useCallSession";
import { CallActionButton, IncomingCallToast } from "@/components/calls/CallControls";
import { CallOverlay } from "@/components/calls/CallOverlay";

type Props = {
  conversationId: string;
};

export function ConversationCallKit({ conversationId }: Props) {
  const searchParams = useSearchParams();
  const { subscribeRealtime, session } = useChatLayout();
  const {
    activeCall,
    setActiveCall,
    authToken,
    inCall,
    loading,
    error,
    join,
    joinExisting,
    hangUp,
  } = useCallSession(conversationId);

  const [incoming, setIncoming] = useState<CallSummaryDto | null>(null);

  useEffect(() => {
    return subscribeRealtime((event: RealtimeEvent) => {
      if (event.type === "call.started" || event.type === "call.updated") {
        if (event.conversationId === conversationId) {
          if (event.call.participantCount === 0) {
            setActiveCall(null);
          } else {
            setActiveCall(event.call);
          }
          if (
            event.type === "call.started" &&
            event.call.hostUserId !== session?.userId &&
            !inCall &&
            event.call.participantCount > 0
          ) {
            setIncoming(event.call);
          }
        }
      }
      if (event.type === "call.ended" && event.conversationId === conversationId) {
        setActiveCall(null);
        setIncoming(null);
      }
    });
  }, [conversationId, inCall, session?.userId, setActiveCall, subscribeRealtime]);

  useEffect(() => {
    const callParam = searchParams.get("call");
    if (callParam && !inCall && !loading) {
      void joinExisting(callParam);
    }
  }, [searchParams, inCall, loading, joinExisting]);

  useEffect(() => {
    if (!inCall || !activeCall) return;
    const interval = setInterval(() => {
      void fetch("/api/v1/presence/heartbeat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: activeCall.id }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [inCall, activeCall]);

  return (
    <>
      {incoming ? (
        <IncomingCallToast
          hostName={incoming.hostDisplayName}
          onJoin={() => {
            setIncoming(null);
            void join();
          }}
          onDismiss={() => setIncoming(null)}
        />
      ) : null}

      {error ? (
        <div className="alert alert-error call-error" role="alert">
          {error}
        </div>
      ) : null}

      {inCall && authToken ? <CallOverlay authToken={authToken} onLeave={() => void hangUp()} /> : null}

      <CallActionButton
        activeCall={activeCall}
        inCall={inCall}
        loading={loading}
        onStart={() => void join()}
        onJoin={() => void join()}
      />
    </>
  );
}
