"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { useCallSession } from "@/hooks/useCallSession";
import { CallActionButton, IncomingCallToast } from "@/components/calls/CallControls";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";

type Props = {
  conversationId: string;
};

export function ConversationCallKit({ conversationId }: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
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
  const inCallRef = useRef(inCall);
  const endedCallIdsRef = useRef(new Set<string>());

  inCallRef.current = inCall;

  const clearCallQueryParam = useCallback(() => {
    if (!searchParams.get("call")) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("call");
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router, searchParams]);

  const handleLeave = useCallback(() => {
    clearCallQueryParam();
    void hangUp();
  }, [clearCallQueryParam, hangUp]);

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
            !inCallRef.current &&
            event.call.participantCount > 0
          ) {
            setIncoming(event.call);
          }
        }
      }
      if (event.type === "call.ended" && event.conversationId === conversationId) {
        endedCallIdsRef.current.add(event.callId);
        setActiveCall(null);
        setIncoming(null);
        clearCallQueryParam();
        if (inCallRef.current) {
          void hangUp();
        }
      }
    });
  }, [clearCallQueryParam, conversationId, hangUp, session?.userId, setActiveCall, subscribeRealtime]);

  useEffect(() => {
    const callParam = searchParams.get("call");
    if (!callParam || inCall || loading) return;
    if (endedCallIdsRef.current.has(callParam)) return;
    void joinExisting(callParam).catch(() => {
      endedCallIdsRef.current.add(callParam);
    });
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
        <ChatHomeBanner variant="error" placement="panel">
          {error}
        </ChatHomeBanner>
      ) : null}

      {inCall && authToken ? (
        <CallOverlay
          authToken={authToken}
          sessionParticipantCount={activeCall?.participantCount ?? 1}
          onLeave={handleLeave}
        />
      ) : null}

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
