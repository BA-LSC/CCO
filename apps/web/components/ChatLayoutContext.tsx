"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export type ChatSessionInfo = { userId: string; displayName?: string };

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
  realtimeConnected: boolean;
  setRealtimeConnected: (connected: boolean) => void;
  wsToken: string | null;
  session: ChatSessionInfo | null;
  sessionLoading: boolean;
};

const ChatLayoutContext = createContext<ChatLayoutContextValue | null>(null);

export function ChatLayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSessionInfo | null>(() => readCachedSession());
  const [sessionLoading, setSessionLoading] = useState(() => readCachedSession() === null);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const setConnected = useCallback((connected: boolean) => setRealtimeConnected(connected), []);

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

  return (
    <ChatLayoutContext.Provider
      value={{
        sidebarOpen,
        openSidebar,
        closeSidebar,
        toggleSidebar,
        realtimeConnected,
        setRealtimeConnected: setConnected,
        wsToken,
        session,
        sessionLoading,
      }}
    >
      {children}
    </ChatLayoutContext.Provider>
  );
}

export function useChatLayout() {
  const ctx = useContext(ChatLayoutContext);
  if (!ctx) throw new Error("useChatLayout must be used within ChatLayoutProvider");
  return ctx;
}
