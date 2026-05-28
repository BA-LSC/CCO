"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, type Message, type MessageListResponse, type PeerUser } from "@/lib/api";
import {
  getCachedMessages,
  invalidateConversation,
  setCachedMessages,
} from "@/lib/message-cache";
import { conversationMessagesPath } from "@/lib/messages";
import { NOTIFICATION_ANCHOR_QUERY } from "@/lib/notification-navigation";

export { NOTIFICATION_ANCHOR_QUERY } from "@/lib/notification-navigation";

export function useLoadConversationMessages(conversationId: string | null) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const anchorHandledRef = useRef<string | null>(null);
  const anchorUnread = searchParams.get(NOTIFICATION_ANCHOR_QUERY) === "1";

  const [messages, setMessages] = useState<Message[]>([]);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const [messagesForConversationId, setMessagesForConversationId] = useState<string | null>(
    null,
  );
  const [hasMore, setHasMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(Boolean(conversationId));
  const [canPost, setCanPost] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null);
  const [peerUser, setPeerUser] = useState<PeerUser | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      setFirstUnreadMessageId(null);
      setMessagesForConversationId(null);
      setMessagesLoading(false);
      setCanPost(null);
      setLoadError(null);
      setPeerLastReadAt(null);
      setPeerUser(null);
      return;
    }

    const shouldAnchorUnread = anchorUnread;
    if (!shouldAnchorUnread && anchorHandledRef.current === conversationId) {
      return;
    }

    setLoadError(null);
    setMessagesLoading(true);

    if (shouldAnchorUnread) {
      anchorHandledRef.current = conversationId;
      invalidateConversation(conversationId);
      setMessages([]);
      setHasMore(false);
      setFirstUnreadMessageId(null);
      setMessagesForConversationId(null);
    } else {
      anchorHandledRef.current = null;
      const cached = getCachedMessages(conversationId);
      if (cached) {
        setMessages(cached.messages);
        setHasMore(cached.hasMore);
        setFirstUnreadMessageId(cached.firstUnreadMessageId ?? null);
        setMessagesForConversationId(conversationId);
      } else {
        setMessages([]);
        setHasMore(false);
        setMessagesForConversationId(null);
      }
    }

    let cancelled = false;
    void apiFetch<MessageListResponse>(
      conversationMessagesPath(conversationId, { anchorUnread: shouldAnchorUnread }),
    )
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setFirstUnreadMessageId(data.firstUnreadMessageId);
        setMessagesForConversationId(conversationId);
        setPeerLastReadAt(data.peerLastReadAt ?? null);
        setPeerUser(data.peerUser ?? null);
        if (typeof data.canPost === "boolean") {
          setCanPost(data.canPost);
        }
        setCachedMessages(conversationId, {
          messages: data.messages,
          hasMore: data.hasMore,
          firstUnreadMessageId: data.firstUnreadMessageId,
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
        if (!cancelled) setMessagesLoading(false);
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

  const threadMessages = messagesForConversationId === conversationId ? messages : [];
  const threadHasMore = messagesForConversationId === conversationId ? hasMore : false;

  return {
    threadMessages,
    threadHasMore,
    firstUnreadMessageId,
    messagesLoading,
    canPost,
    loadError,
    peerLastReadAt: messagesForConversationId === conversationId ? peerLastReadAt : null,
    peerUser: messagesForConversationId === conversationId ? peerUser : null,
  };
}
