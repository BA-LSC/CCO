"use client";

import Link from "next/link";
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
import type { CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { useCallSession } from "@/hooks/useCallSession";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";
import { useAnchorRect } from "@/hooks/useAnchorRect";
import { CallActionButton, IncomingCallToast } from "@/components/calls/CallControls";
import { CallInCallActions, callInCallActionsInlineOffset } from "@/components/calls/CallInCallActions";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { CallPipShell } from "@/components/calls/CallPipShell";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";

type CallSessionValue = ReturnType<typeof useCallSession>;

export type ActiveCallContextValue = CallSessionValue & {
  homeConversationId: string | null;
  homeChatPath: string | null;
  isHost: boolean;
  joinConversation: (conversationId: string) => void;
  registerInlineAnchor: (conversationId: string, element: HTMLElement | null) => void;
  inCallOnConversation: (conversationId: string) => boolean;
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

function ActiveCallPanel({
  homeConversationId,
  homeChatPath,
  inlineAnchor,
  authToken,
  activeCall,
  onLeave,
}: {
  homeConversationId: string;
  homeChatPath: string | null;
  inlineAnchor: HTMLElement | null;
  authToken: string;
  activeCall: CallSummaryDto | null;
  onLeave: () => void;
}) {
  const { activeConversationId } = useChatLayout();
  const showInline = activeConversationId === homeConversationId;
  const showPip = activeConversationId !== homeConversationId;
  const inlineRect = useAnchorRect(inlineAnchor, showInline);
  const inlineActionsOffset = callInCallActionsInlineOffset();
  const inlinePanelRect =
    showInline && inlineRect
      ? new DOMRect(
          inlineRect.x,
          inlineRect.y + inlineActionsOffset,
          inlineRect.width,
          inlineRect.height,
        )
      : null;

  if (!showInline && !showPip) return null;

  const inCallActions = (
    <CallInCallActions
      placement={showInline ? "inline" : "pip"}
      inlineAnchorRect={showInline ? inlineRect : null}
    />
  );

  const overlay = (
    <CallOverlay
      authToken={authToken}
      sessionParticipantCount={activeCall?.participantCount ?? 1}
      onLeave={onLeave}
      placement={showInline ? "inline" : "pip"}
      inlineAnchorRect={showInline ? inlinePanelRect : null}
      showSetupScreen={false}
    />
  );

  if (showPip) {
    return (
      <CallPipShell
        participantCount={activeCall?.participantCount ?? 1}
        returnLink={
          homeChatPath ? (
            <Link href={homeChatPath} className="call-pip-return">
              Return to call
            </Link>
          ) : null
        }
      >
        {inCallActions}
        {overlay}
      </CallPipShell>
    );
  }

  return (
    <div className="call-panel-host">
      {inCallActions}
      {overlay}
    </div>
  );
}

export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribeRealtime, session, activeConversationId } = useChatLayout();

  const [homeConversationId, setHomeConversationId] = useState<string | null>(null);
  const [homeChatPath, setHomeChatPath] = useState<string | null>(null);
  const [inlineAnchors, setInlineAnchors] = useState<Map<string, HTMLElement>>(() => new Map());
  const [incomingConversationId, setIncomingConversationId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSummaryDto | null>(null);

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

  const isHost = activeCall?.hostUserId === session?.userId;

  const registerInlineAnchor = useCallback((conversationId: string, element: HTMLElement | null) => {
    setInlineAnchors((prev) => {
      const next = new Map(prev);
      if (element) {
        next.set(conversationId, element);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
  }, []);

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
          event.call.hostUserId !== session?.userId &&
          !inCallRef.current &&
          event.call.participantCount > 0 &&
          conversationId === activeConversationId
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

  useEffect(() => {
    if (!inCall) {
      setHomeConversationId(null);
      setHomeChatPath(null);
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
      registerInlineAnchor,
      inCallOnConversation,
      hangUp: handleHangUp,
    }),
    [
      callSession,
      handleHangUp,
      homeChatPath,
      homeConversationId,
      inCallOnConversation,
      isHost,
      joinConversation,
      registerInlineAnchor,
    ],
  );

  const inlineAnchor = homeConversationId ? (inlineAnchors.get(homeConversationId) ?? null) : null;

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

      {incomingCall && incomingConversationId === activeConversationId ? (
        <IncomingCallToast
          hostName={incomingCall.hostDisplayName}
          onJoin={() => {
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

      {homeConversationId && inCall && authToken ? (
        <ActiveCallPanel
          homeConversationId={homeConversationId}
          homeChatPath={homeChatPath}
          inlineAnchor={inlineAnchor}
          authToken={authToken}
          activeCall={activeCall}
          onLeave={() => void handleHangUp()}
        />
      ) : null}

      {children}
    </ActiveCallContext.Provider>
  );
}

export function CallInlineSlot({ conversationId }: { conversationId: string }) {
  const { inCallOnConversation, registerInlineAnchor } = useActiveCall();
  const showAnchor = inCallOnConversation(conversationId);

  const anchorRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerInlineAnchor(conversationId, showAnchor ? node : null);
    },
    [conversationId, registerInlineAnchor, showAnchor],
  );

  useEffect(() => {
    if (!showAnchor) {
      registerInlineAnchor(conversationId, null);
    }
  }, [conversationId, registerInlineAnchor, showAnchor]);

  if (!showAnchor) return null;

  return (
    <>
      <div ref={anchorRef} className="call-inline-anchor" aria-hidden="true" />
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
  const { activeCall, loading, joinConversation, inCallOnConversation } = useActiveCall();
  const { getActiveCall } = useActiveCallsMap();
  const inCallHere = inCallOnConversation(conversationId);
  const joinableCall = getActiveCall(conversationId) ?? null;

  return (
    <CallActionButton
      activeCall={inCallHere ? activeCall : joinableCall}
      inCall={inCallHere}
      loading={loading}
      disabled={disabled}
      onStart={() => joinConversation(conversationId)}
      onJoin={() => joinConversation(conversationId)}
    />
  );
}

export function ConversationCallShell({ children }: { conversationId?: string; disabled?: boolean; children: ReactNode }) {
  return <>{children}</>;
}

export { ActiveCallContext as ConversationCallContext };
