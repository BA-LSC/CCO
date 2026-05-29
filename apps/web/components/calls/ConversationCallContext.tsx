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
import type { CallSummaryDto } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import type { RealtimeEvent } from "@/hooks/useConversationSocket";
import { useCallSession } from "@/hooks/useCallSession";
import { CallActionButton, IncomingCallToast } from "@/components/calls/CallControls";
import { CallInCallToolbar, type CallLayoutMode } from "@/components/calls/CallInCallToolbar";
import { CallInviteDialog } from "@/components/calls/CallInviteDialog";
import { CallOverlay } from "@/components/calls/CallOverlay";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";

const LAYOUT_STORAGE_KEY = "cco-call-layout";

type CallSessionValue = ReturnType<typeof useCallSession>;

export type ConversationCallContextValue = CallSessionValue & {
  isHost: boolean;
};

const ConversationCallContext = createContext<ConversationCallContextValue | null>(null);

/**
 * Returns call session state for the enclosing {@link ConversationCallShell}.
 * @throws If used outside of `ConversationCallShell`.
 */
export function useConversationCall(): ConversationCallContextValue {
  const value = useContext(ConversationCallContext);
  if (!value) {
    throw new Error("useConversationCall must be used within ConversationCallShell");
  }
  return value;
}

/** Returns null outside {@link ConversationCallShell} (e.g. storybook). */
export function useOptionalConversationCall(): ConversationCallContextValue | null {
  return useContext(ConversationCallContext);
}

function readLayoutMode(): CallLayoutMode {
  if (typeof window === "undefined") return "full";
  const stored = sessionStorage.getItem(LAYOUT_STORAGE_KEY);
  if (stored === "docked" || stored === "pip" || stored === "full") return stored;
  return "full";
}

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

type ShellProps = {
  conversationId: string;
  disabled?: boolean;
  children: ReactNode;
};

export function ConversationCallShell({ conversationId, disabled: _disabled, children }: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { subscribeRealtime, session } = useChatLayout();
  const callSession = useCallSession(conversationId);
  const {
    activeCall,
    authToken,
    inCall,
    loading,
    error,
    join,
    joinExisting,
    hangUp,
    endForAll,
    acknowledgeCallEnded,
    acceptCallUpdate,
    shouldIgnoreCall,
  } = callSession;

  const [incoming, setIncoming] = useState<CallSummaryDto | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [layoutMode, setLayoutMode] = useState<CallLayoutMode>(readLayoutMode);
  const inCallRef = useRef(inCall);
  const endedCallIdsRef = useRef(new Set<string>());

  inCallRef.current = inCall;

  const isHost = activeCall?.hostUserId === session?.userId;

  const contextValue = useMemo<ConversationCallContextValue>(
    () => ({
      ...callSession,
      isHost: isHost ?? false,
    }),
    [callSession, isHost],
  );

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

  const handleEndForAll = useCallback(() => {
    clearCallQueryParam();
    void endForAll();
  }, [clearCallQueryParam, endForAll]);

  const handleLayoutModeChange = useCallback((mode: CallLayoutMode) => {
    setLayoutMode(mode);
    sessionStorage.setItem(LAYOUT_STORAGE_KEY, mode);
  }, []);

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
        setShowInvite(false);
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

  useEffect(() => {
    if (!inCall) {
      setShowInvite(false);
    }
  }, [inCall]);

  const toolbar =
    inCall && authToken ? (
      <CallInCallToolbar
        isHost={isHost ?? false}
        layoutMode={layoutMode}
        onLayoutModeChange={handleLayoutModeChange}
        onInvite={() => setShowInvite(true)}
        onEndForAll={handleEndForAll}
        onLeave={handleLeave}
      />
    ) : null;

  return (
    <ConversationCallContext.Provider value={contextValue}>
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
          layoutMode={layoutMode}
          toolbar={toolbar}
        />
      ) : null}

      {showInvite && activeCall ? (
        <CallInviteDialog callId={activeCall.id} onClose={() => setShowInvite(false)} />
      ) : null}

      {children}
    </ConversationCallContext.Provider>
  );
}

export function ConversationCallHeaderButton({ disabled = false }: { disabled?: boolean }) {
  const { activeCall, inCall, loading, join } = useConversationCall();

  return (
    <CallActionButton
      activeCall={activeCall}
      inCall={inCall}
      loading={loading}
      disabled={disabled}
      onStart={() => void join()}
      onJoin={() => void join()}
    />
  );
}

export { ConversationCallContext };
