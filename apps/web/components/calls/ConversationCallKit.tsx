"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
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
  disabled?: boolean;
};

function ConversationCallUrlJoin({
  inCall,
  loading,
  joinExisting,
  endedCallIdsRef,
}: {
  inCall: boolean;
  loading: boolean;
  joinExisting: (callId: string) => Promise<void>;
  endedCallIdsRef: MutableRefObject<Set<string>>;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const callParam = searchParams.get("call");
    if (!callParam || inCall || loading) return;
    if (endedCallIdsRef.current.has(callParam)) return;
    void joinExisting(callParam).catch(() => {
      endedCallIdsRef.current.add(callParam);
    });
  }, [endedCallIdsRef, inCall, joinExisting, loading, searchParams]);

  return null;
}

function ConversationCallKitInner({ conversationId, disabled = false }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribeRealtime, session } = useChatLayout();
  const {
    activeCall,
    authToken,
    inCall,
    loading,
    error,
    join,
    joinExisting,
    hangUp,
    acknowledgeCallEnded,
    acceptCallUpdate,
    shouldIgnoreCall,
  } = useCallSession(conversationId);

  const [incoming, setIncoming] = useState<CallSummaryDto | null>(null);
  const inCallRef = useRef(inCall);
  const endedCallIdsRef = useRef(new Set<string>());

  inCallRef.current = inCall;

  const clearCallQueryParam = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("call")) return;
    params.delete("call");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  const handleLeave = useCallback(() => {
    clearCallQueryParam();
    void hangUp();
  }, [clearCallQueryParam, hangUp]);

  useEffect(() => {
    return subscribeRealtime((event: RealtimeEvent) => {
      if (event.type === "call.started" || event.type === "call.updated") {
        if (event.conversationId === conversationId) {
          if (shouldIgnoreCall(event.call.id) || endedCallIdsRef.current.has(event.call.id)) {
            return;
          }
          acceptCallUpdate(event.call);
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
        acknowledgeCallEnded(event.callId);
        setIncoming(null);
        clearCallQueryParam();
        if (inCallRef.current) {
          void hangUp();
        }
      }
    });
  }, [
    acceptCallUpdate,
    acknowledgeCallEnded,
    clearCallQueryParam,
    conversationId,
    hangUp,
    session?.userId,
    shouldIgnoreCall,
    subscribeRealtime,
  ]);

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
      <Suspense fallback={null}>
        <ConversationCallUrlJoin
          inCall={inCall}
          loading={loading}
          joinExisting={joinExisting}
          endedCallIdsRef={endedCallIdsRef}
        />
      </Suspense>

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
        disabled={disabled}
        onStart={() => void join()}
        onJoin={() => void join()}
      />
    </>
  );
}

export function ConversationCallKit(props: Props) {
  return <ConversationCallKitInner {...props} />;
}
