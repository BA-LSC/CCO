"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useConversationSocket, type RealtimeEvent } from "@/hooks/useConversationSocket";
import { useUserInboxSocket } from "@/hooks/useUserInboxSocket";
import { apiFetch } from "@/lib/api";
import { PresenceProvider } from "@/components/PresenceProvider";
import { resolveActiveConversationId } from "@/lib/active-conversation-id";
import { setMessageCacheUserId } from "@/lib/message-cache";

export type ChatSessionInfo = {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  organizationName?: string | null;
};

const SESSION_CACHE_KEY = "cco:session";

function readCachedSession(): ChatSessionInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatSessionInfo;
    if (typeof parsed.userId === "string") return parsed;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function writeCachedSession(session: ChatSessionInfo | null) {
  if (typeof window === "undefined") return;
  if (session) {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
  }
}

type ChatLayoutContextValue = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  activeConversationId: string | null;
  realtimeConnected: boolean;
  /** True when the active conversation room WebSocket is connected. */
  conversationSocketConnected: boolean;
  subscribeRealtime: (listener: (event: RealtimeEvent) => void) => () => void;
  wsToken: string | null;
  session: ChatSessionInfo | null;
  sessionLoading: boolean;
};

const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(null);

export function ChatLayoutProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSessionInfo | null>(() => {
    const cached = readCachedSession();
    if (cached?.userId) setMessageCacheUserId(cached.userId);
    return cached;
  });
  const [sessionLoading, setSessionLoading] = useState(() => readCachedSession() === null);
  const listenersRef = useRef(new Set<(event: RealtimeEvent) => void>());

  const activeConversationId = useMemo(
    () => resolveActiveConversationId(pathname),
    [pathname],
  );

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const broadcastRealtimeEvent = useCallback((event: RealtimeEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const subscribeRealtime = useCallback((listener: (event: RealtimeEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const { connected: roomConnected } = useConversationSocket(
    session?.userId ? activeConversationId : null,
    broadcastRealtimeEvent,
  );
  const { connected: inboxConnected } = useUserInboxSocket(
    session?.userId ?? null,
    broadcastRealtimeEvent,
  );
  const realtimeConnected = roomConnected || inboxConnected;
  const conversationSocketConnected = roomConnected;

  useEffect(() => {
    setMessageCacheUserId(session?.userId ?? null);
  }, [session?.userId]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ token: string | null }>("/api/v1/session/ws-token").catch(() => ({ token: null })),
      apiFetch<ChatSessionInfo>("/api/v1/session/me").catch(() => null),
    ])
      .then(([wsData, sessionData]) => {
        setWsToken(wsData.token);
        setSession(sessionData);
        writeCachedSession(sessionData);
      })
      .finally(() => setSessionLoading(false));
  }, []);

  useEffect(() => {
    if (sessionLoading || session) return;
    const next = encodeURIComponent(`${pathname}${window.location.search}`);
    router.replace(`/auth/sign-in?next=${next}`);
  }, [session, sessionLoading, pathname, router]);

  return (
    <ChatLayoutContext.Provider
      value={{
        sidebarOpen,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        activeConversationId,
        realtimeConnected,
        conversationSocketConnected,
        subscribeRealtime,
        wsToken,
        session,
        sessionLoading,
      }}
    >
      <PresenceProvider userId={session?.userId ?? null}>{children}</PresenceProvider>
    </ChatLayoutContext.Provider>
  );
}

export function useChatLayout() {
  const ctx = useContext(ChatLayoutContext);
  if (!ctx) throw new Error("useChatLayout must be used within ChatLayoutProvider");
  return ctx;
}
