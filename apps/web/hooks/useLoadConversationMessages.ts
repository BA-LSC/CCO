"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { apiFetch, type MemberReadReceipt, type Message, type MessageListResponse, type PeerUser } from "@/lib/api";
import type { CallTimelineEventDto } from "@/lib/call-timeline";
import {
  getCachedMessages,
  invalidateConversation,
  setCachedMessages,
  type CachedConversationMessages,
} from "@/lib/message-cache";
import { conversationMessagesPath } from "@/lib/messages";
import { NOTIFICATION_ANCHOR_QUERY } from "@/lib/notification-navigation";

export { NOTIFICATION_ANCHOR_QUERY } from "@/lib/notification-navigation";

function readCachedConversation(conversationId: string | null): CachedConversationMessages | null {
  if (!conversationId) return null;
  return getCachedMessages(conversationId);
}

function applyCachedConversation(
  cached: CachedConversationMessages,
  conversationId: string,
  setters: {
    setMessages: (messages: Message[]) => void;
    setCallEvents: (events: CallTimelineEventDto[]) => void;
    setHasMore: (hasMore: boolean) => void;
    setFirstUnreadMessageId: (id: string | null) => void;
    setMessagesForConversationId: (id: string) => void;
    setPeerLastReadAt: (value: string | null) => void;
    setPeerUser: (value: PeerUser | null) => void;
    setMemberReadReceipts: (value: MemberReadReceipt[]) => void;
    setCanPost: (value: boolean | null) => void;
    setMessagesLoading: (loading: boolean) => void;
  },
): void {
  setters.setMessages(cached.messages);
  setters.setCallEvents(cached.callEvents);
  setters.setHasMore(cached.hasMore);
  setters.setFirstUnreadMessageId(cached.firstUnreadMessageId ?? null);
  setters.setMessagesForConversationId(conversationId);
  setters.setPeerLastReadAt(cached.peerLastReadAt ?? null);
  setters.setPeerUser(cached.peerUser ?? null);
  setters.setMemberReadReceipts(cached.memberReadReceipts ?? []);
  setters.setCanPost(cached.canPost ?? null);
  setters.setMessagesLoading(false);
}

export function useLoadConversationMessages(conversationId: string | null) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useChatLayout(); // ensures message cache user id is scoped before reads
  const anchorHandledRef = useRef<string | null>(null);
  const anchorUnread = searchParams.get(NOTIFICATION_ANCHOR_QUERY) === "1";

  const initialCached = readCachedConversation(conversationId);

  const [messages, setMessages] = useState<Message[]>(() => initialCached?.messages ?? []);
  const [callEvents, setCallEvents] = useState<CallTimelineEventDto[]>(
    () => initialCached?.callEvents ?? [],
  );
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(
    () => initialCached?.firstUnreadMessageId ?? null,
  );
  const [messagesForConversationId, setMessagesForConversationId] = useState<string | null>(
    () => (initialCached && conversationId ? conversationId : null),
  );
  const [hasMore, setHasMore] = useState(() => initialCached?.hasMore ?? false);
  const [messagesLoading, setMessagesLoading] = useState(
    () => Boolean(conversationId) && initialCached === null,
  );
  const [canPost, setCanPost] = useState<boolean | null>(() => initialCached?.canPost ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(
    () => initialCached?.peerLastReadAt ?? null,
  );
  const [peerUser, setPeerUser] = useState<PeerUser | null>(() => initialCached?.peerUser ?? null);
  const [memberReadReceipts, setMemberReadReceipts] = useState<MemberReadReceipt[]>(
    () => initialCached?.memberReadReceipts ?? [],
  );

  const cacheSetters = {
    setMessages,
    setCallEvents,
    setHasMore,
    setFirstUnreadMessageId,
    setMessagesForConversationId,
    setPeerLastReadAt,
    setPeerUser,
    setMemberReadReceipts,
    setCanPost,
    setMessagesLoading,
  };

  useLayoutEffect(() => {
    if (!conversationId || anchorUnread) return;
    const cached = getCachedMessages(conversationId);
    if (cached) {
      applyCachedConversation(cached, conversationId, cacheSetters);
      return;
    }
    if (messagesForConversationId !== conversationId) {
      setMessagesLoading(true);
    }
  }, [anchorUnread, conversationId, messagesForConversationId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setCallEvents([]);
      setHasMore(false);
      setFirstUnreadMessageId(null);
      setMessagesForConversationId(null);
      setMessagesLoading(false);
      setCanPost(null);
      setLoadError(null);
      setPeerLastReadAt(null);
      setPeerUser(null);
      setMemberReadReceipts([]);
      return;
    }

    const shouldAnchorUnread = anchorUnread;
    if (!shouldAnchorUnread && anchorHandledRef.current === conversationId) {
      const cached = getCachedMessages(conversationId);
      if (cached) {
        applyCachedConversation(cached, conversationId, cacheSetters);
      }
      let cancelled = false;
      void apiFetch<MessageListResponse>(
        conversationMessagesPath(conversationId, { anchorUnread: false }),
      )
        .then((data) => {
          if (cancelled) return;
          setMessages(data.messages);
          setCallEvents(data.callEvents ?? []);
          setHasMore(data.hasMore);
          setFirstUnreadMessageId(data.firstUnreadMessageId);
          setMessagesForConversationId(conversationId);
          setPeerLastReadAt(data.peerLastReadAt ?? null);
          setPeerUser(data.peerUser ?? null);
          setMemberReadReceipts(data.memberReadReceipts ?? []);
          setCanPost(typeof data.canPost === "boolean" ? data.canPost : null);
          setCachedMessages(conversationId, {
            messages: data.messages,
            callEvents: data.callEvents ?? [],
            hasMore: data.hasMore,
            firstUnreadMessageId: data.firstUnreadMessageId,
            peerLastReadAt: data.peerLastReadAt ?? null,
            peerUser: data.peerUser ?? null,
            memberReadReceipts: data.memberReadReceipts ?? [],
            canPost: typeof data.canPost === "boolean" ? data.canPost : null,
          });
        })
        .catch(() => {
          // Keep cached data on transient errors.
        });
      return () => {
        cancelled = true;
      };
    }

    setLoadError(null);

    if (shouldAnchorUnread) {
      anchorHandledRef.current = conversationId;
      invalidateConversation(conversationId);
      setMessages([]);
      setCallEvents([]);
      setHasMore(false);
      setFirstUnreadMessageId(null);
      setMessagesForConversationId(null);
      setCanPost(null);
      setPeerLastReadAt(null);
      setPeerUser(null);
      setMemberReadReceipts([]);
      setMessagesLoading(true);
    } else {
      const cached = getCachedMessages(conversationId);
      if (cached) {
        applyCachedConversation(cached, conversationId, cacheSetters);
      } else {
        setMessages([]);
        setCallEvents([]);
        setHasMore(false);
        setFirstUnreadMessageId(null);
        setMessagesForConversationId(null);
        setCanPost(null);
        setPeerLastReadAt(null);
        setPeerUser(null);
        setMemberReadReceipts([]);
        setMessagesLoading(true);
      }
    }

    let cancelled = false;
    void apiFetch<MessageListResponse>(
      conversationMessagesPath(conversationId, { anchorUnread: shouldAnchorUnread }),
    )
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setCallEvents(data.callEvents ?? []);
        setHasMore(data.hasMore);
        setFirstUnreadMessageId(data.firstUnreadMessageId);
        setMessagesForConversationId(conversationId);
        setPeerLastReadAt(data.peerLastReadAt ?? null);
        setPeerUser(data.peerUser ?? null);
        setMemberReadReceipts(data.memberReadReceipts ?? []);
        setCanPost(typeof data.canPost === "boolean" ? data.canPost : null);
        setCachedMessages(conversationId, {
          messages: data.messages,
          callEvents: data.callEvents ?? [],
          hasMore: data.hasMore,
          firstUnreadMessageId: data.firstUnreadMessageId,
          peerLastReadAt: data.peerLastReadAt ?? null,
          peerUser: data.peerUser ?? null,
          memberReadReceipts: data.memberReadReceipts ?? [],
          canPost: typeof data.canPost === "boolean" ? data.canPost : null,
        });

        if (shouldAnchorUnread) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete(NOTIFICATION_ANCHOR_QUERY);
          const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          router.replace(nextUrl, { scroll: false });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load messages");
      })
      .finally(() => {
        if (!cancelled) {
          setMessagesLoading(false);
          anchorHandledRef.current = conversationId;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [anchorUnread, conversationId, pathname, router, searchParams]);

  useEffect(() => {
    return () => {
      anchorHandledRef.current = null;
    };
  }, [conversationId]);

  const cachedSnapshot =
    conversationId && messagesForConversationId !== conversationId
      ? getCachedMessages(conversationId)
      : null;
  const threadSynced = messagesForConversationId === conversationId;

  const threadMessages = threadSynced ? messages : (cachedSnapshot?.messages ?? []);
  const threadCallEvents = threadSynced ? callEvents : (cachedSnapshot?.callEvents ?? []);
  const threadHasMore = threadSynced ? hasMore : (cachedSnapshot?.hasMore ?? false);
  const threadFirstUnreadMessageId = threadSynced
    ? firstUnreadMessageId
    : (cachedSnapshot?.firstUnreadMessageId ?? null);
  const threadCanPost = threadSynced ? canPost : (cachedSnapshot?.canPost ?? null);
  const threadPeerLastReadAt = threadSynced
    ? peerLastReadAt
    : (cachedSnapshot?.peerLastReadAt ?? null);
  const threadPeerUser = threadSynced ? peerUser : (cachedSnapshot?.peerUser ?? null);
  const threadMemberReadReceipts = threadSynced
    ? memberReadReceipts
    : (cachedSnapshot?.memberReadReceipts ?? []);

  const hasThreadContent = threadMessages.length > 0 || threadCallEvents.length > 0;
  const showMessagesLoading = Boolean(conversationId) && messagesLoading && !hasThreadContent;

  return {
    threadMessages,
    threadCallEvents,
    threadHasMore,
    firstUnreadMessageId: threadFirstUnreadMessageId,
    messagesLoading: showMessagesLoading,
    canPost: threadCanPost,
    loadError,
    peerLastReadAt: threadPeerLastReadAt,
    peerUser: threadPeerUser,
    memberReadReceipts: threadMemberReadReceipts,
  };
}
