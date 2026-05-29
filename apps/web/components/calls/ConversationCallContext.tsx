"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { canJoinCallAsParticipant, type CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { useCallSession } from "@/hooks/useCallSession";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";
import { useChatPanelBounds } from "@/hooks/useChatPanelBounds";
import { useCallConversationTitle } from "@/hooks/useCallConversationTitle";
import { usePipPanel } from "@/hooks/usePipPanel";
import { CallActionButton, IncomingCallToast } from "@/components/calls/CallControls";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { CallPipShell } from "@/components/calls/CallPipShell";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { formatSoloCallAutoLeaveNotice } from "@/lib/call-solo";

type CallSessionValue = ReturnType<typeof useCallSession>;

export type ActiveCallContextValue = CallSessionValue & {
  homeConversationId: string | null;
  homeChatPath: string | null;
  isHost: boolean;
  joinConversation: (conversationId: string) => void;
  inCallOnConversation: (conversationId: string) => boolean;
  onSoloAutoLeave: (durationMs: number) => void;
};

const ActiveCallContext = createContext<ActiveCallContextValue | null>(null);

export function useActiveCall(): ActiveCallContextValue {
  const value = useContext(ActiveCallContext);
  if (!value) {
    throw new Error("useActiveCall must be used within ActiveCallProvider");
  }
  return value;
}

export function useOptionalActiveCall(): ActiveCallContextValue | null {
  return useContext(ActiveCallContext);
}

export const useConversationCall = useActiveCall;
export const useOptionalConversationCall = useOptionalActiveCall;

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

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribeRealtime, session, activeConversationId } = useChatLayout();

  const [homeConversationId, setHomeConversationId] = useState<string | null>(null);
  const [homeChatPath, setHomeChatPath] = useState<string | null>(null);
  const [incomingConversationId, setIncomingConversationId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSummaryDto | null>(null);
  const [soloCallNotice, setSoloCallNotice] = useState<string | null>(null);

  const callSession = useCallSession(homeConversationId);
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
  } = callSession;

  const pendingJoinRef = useRef<string | null>(null);
  const inCallRef = useRef(inCall);
  const endedCallIdsRef = useRef(new Set<string>());

  inCallRef.current = inCall;

  const { registerActiveCall } = useActiveCallsMap();

  useEffect(() => {
    const conversationId = activeCall?.conversationId ?? homeConversationId;
    if (!conversationId) return;
    registerActiveCall(
      activeCall && activeCall.participantCount > 0 ? activeCall : null,
      { conversationId },
    );
  }, [activeCall, homeConversationId, registerActiveCall]);

  const isHost = activeCall?.hostUserId === session?.userId;

  const joinConversation = useCallback(
    (conversationId: string) => {
      setHomeConversationId(conversationId);
      setHomeChatPath(pathname);
      pendingJoinRef.current = conversationId;
    },
    [pathname],
  );

  useEffect(() => {
    const pending = pendingJoinRef.current;
    if (!pending || homeConversationId !== pending) return;
    pendingJoinRef.current = null;
    void join();
  }, [homeConversationId, join]);

  useEffect(() => {
    if (inCall && activeCall?.conversationId) {
      setHomeConversationId(activeCall.conversationId);
    }
  }, [activeCall?.conversationId, inCall]);

  useEffect(() => {
    if (inCall && activeCall?.conversationId && !homeChatPath) {
      setHomeChatPath(pathname);
    }
  }, [activeCall?.conversationId, homeChatPath, inCall, pathname]);

  const clearCallQueryParam = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("call")) return;
    params.delete("call");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [pathname, router]);

  const handleHangUp = useCallback(async () => {
    clearCallQueryParam();
    await hangUp();
    setHomeConversationId(null);
    setHomeChatPath(null);
  }, [clearCallQueryParam, hangUp]);

  const handleSoloAutoLeave = useCallback((durationMs: number) => {
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    setSoloCallNotice(formatSoloCallAutoLeaveNotice(durationSeconds));
  }, []);

  useEffect(() => {
    return subscribeRealtime((event: RealtimeEvent) => {
      const conversationId =
        "conversationId" in event && typeof event.conversationId === "string"
          ? event.conversationId
          : null;
      if (!conversationId) return;

      if (event.type === "call.started" || event.type === "call.updated") {
        if (conversationId === homeConversationId) {
          if (shouldIgnoreCall(event.call.id) || endedCallIdsRef.current.has(event.call.id)) {
            return;
          }
          acceptCallUpdate(event.call);
        }

        if (
          event.type === "call.started" &&
          canJoinCallAsParticipant(event.call, session?.userId) &&
          !inCallRef.current &&
          event.call.participantCount > 0 &&
          !shouldIgnoreCall(event.call.id) &&
          !endedCallIdsRef.current.has(event.call.id)
        ) {
          setIncomingCall(event.call);
          setIncomingConversationId(conversationId);
        }
      }

      if (event.type === "call.ended") {
        if (conversationId === homeConversationId || conversationId === incomingConversationId) {
          endedCallIdsRef.current.add(event.callId);
          acknowledgeCallEnded(event.callId);
          setIncomingCall(null);
          setIncomingConversationId(null);
          clearCallQueryParam();
          if (inCallRef.current && conversationId === homeConversationId) {
            void handleHangUp();
          }
        }
      }
    });
  }, [
    acceptCallUpdate,
    acknowledgeCallEnded,
    activeConversationId,
    clearCallQueryParam,
    handleHangUp,
    homeConversationId,
    incomingConversationId,
    session?.userId,
    shouldIgnoreCall,
    subscribeRealtime,
  ]);

  useEffect(() => {
    if (!inCall || !activeCall) return;
    const sendHeartbeat = () => {
      void fetch("/api/v1/presence/heartbeat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: activeCall.id }),
      });
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [inCall, activeCall]);

  useEffect(() => {
    if (!inCall) {
      setHomeConversationId(null);
      setHomeChatPath(null);
    } else {
      setSoloCallNotice(null);
    }
  }, [inCall]);

  const inCallOnConversation = useCallback(
    (conversationId: string) => inCall && homeConversationId === conversationId,
    [homeConversationId, inCall],
  );

  const contextValue = useMemo<ActiveCallContextValue>(
    () => ({
      ...callSession,
      homeConversationId,
      homeChatPath,
      isHost: isHost ?? false,
      joinConversation,
      inCallOnConversation,
      hangUp: handleHangUp,
      onSoloAutoLeave: handleSoloAutoLeave,
    }),
    [
      callSession,
      handleHangUp,
      handleSoloAutoLeave,
      homeChatPath,
      homeConversationId,
      inCallOnConversation,
      isHost,
      joinConversation,
    ],
  );

  const showPipCall = Boolean(
    homeConversationId && inCall && authToken && activeConversationId !== homeConversationId,
  );
  const pip = usePipPanel();
  const chatBounds = useChatPanelBounds(showPipCall);
  const pipTitle = useCallConversationTitle(
    showPipCall ? homeConversationId : null,
    showPipCall ? homeChatPath : null,
  );

  const returnToCallChat = useCallback(() => {
    if (homeChatPath) router.push(homeChatPath);
  }, [homeChatPath, router]);

  return (
    <ActiveCallContext.Provider value={contextValue}>
      <Suspense fallback={null}>
        <ConversationCallUrlJoin
          inCall={inCall}
          loading={loading}
          joinExisting={joinExisting}
          endedCallIdsRef={endedCallIdsRef}
        />
      </Suspense>

      {incomingCall && incomingConversationId ? (
        <IncomingCallToast
          hostName={incomingCall.hostDisplayName}
          onJoin={() => {
            if (!incomingCall || !canJoinCallAsParticipant(incomingCall, session?.userId)) {
              return;
            }
            const targetId = incomingConversationId;
            setIncomingCall(null);
            setIncomingConversationId(null);
            if (targetId) joinConversation(targetId);
          }}
          onDismiss={() => {
            setIncomingCall(null);
            setIncomingConversationId(null);
          }}
        />
      ) : null}

      {error ? (
        <ChatHomeBanner variant="error" placement="panel">
          {error}
        </ChatHomeBanner>
      ) : null}

      {soloCallNotice ? (
        <ChatHomeBanner
          key={soloCallNotice}
          variant="neutral"
          placement="panel"
          autoDismissMs={CHAT_PANEL_BANNER_AUTO_DISMISS_MS}
          onDismiss={() => setSoloCallNotice(null)}
        >
          {soloCallNotice}
        </ChatHomeBanner>
      ) : null}

      {homeConversationId && inCall && authToken && showPipCall ? (
        <CallPipShell
          pip={pip}
          bounds={chatBounds}
          title={pipTitle}
          startedAt={activeCall?.startedAt ?? null}
          onTitleClick={homeChatPath ? returnToCallChat : undefined}
        >
          <CallOverlay
            key={authToken}
            authToken={authToken}
            sessionParticipantCount={activeCall?.participantCount ?? 1}
            onLeave={() => void handleHangUp()}
            onSoloAutoLeave={handleSoloAutoLeave}
            placement="pip"
            embedded
            showSetupScreen={false}
          />
        </CallPipShell>
      ) : null}

      {children}
    </ActiveCallContext.Provider>
  );
}

export function CallInlineSlot({ conversationId }: { conversationId: string }) {
  const { inCallOnConversation, authToken, activeCall, hangUp, onSoloAutoLeave } = useActiveCall();
  const showInline = inCallOnConversation(conversationId);

  if (!showInline) return null;

  return (
    <>
      {authToken ? (
        <CallOverlay
          key={authToken}
          authToken={authToken}
          sessionParticipantCount={activeCall?.participantCount ?? 1}
          onLeave={() => void hangUp()}
          onSoloAutoLeave={onSoloAutoLeave}
          placement="inline"
          docked
          showSetupScreen={false}
        />
      ) : null}
      <div className="call-inline-spacer" aria-hidden="true" />
    </>
  );
}

export function ConversationCallHeaderButton({
  conversationId,
  disabled = false,
}: {
  conversationId: string;
  disabled?: boolean;
}) {
  const { activeCall, loading, joinConversation, inCallOnConversation, hangUp } = useActiveCall();
  const { getActiveCall } = useActiveCallsMap();
  const { session } = useChatLayout();
  const inCallHere = inCallOnConversation(conversationId);
  const mapCall = getActiveCall(conversationId) ?? null;
  const joinableCall =
    mapCall && canJoinCallAsParticipant(mapCall, session?.userId) ? mapCall : null;

  return (
    <CallActionButton
      activeCall={inCallHere ? activeCall : joinableCall}
      inCall={inCallHere}
      loading={loading}
      disabled={disabled}
      onStart={() => joinConversation(conversationId)}
      onJoin={() => joinConversation(conversationId)}
      onLeave={() => void hangUp()}
    />
  );
}

export function ConversationCallShell({ children }: { conversationId?: string; disabled?: boolean; children: ReactNode }) {
  return <>{children}</>;
}

export { ActiveCallContext as ConversationCallContext };
