"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, Fragment } from "react";
import { syncComposerTextareaHeight } from "@/lib/composer-textarea";
import {
  MessageBubbleStack,
  MessageEmojiActions,
} from "@/components/MessageReactionToolbar";
import { ComposerAttachMenu } from "@/components/ComposerAttachMenu";
import { MessageBody } from "@/components/MessageBody";
import { UserAvatar } from "@/components/UserAvatar";
import {
  apiFetch,
  formatMention,
  uploadImage,
  type Message,
  type Reaction,
} from "@/lib/api";
import { useConversationPollFallback } from "@/hooks/useConversationPollFallback";
import { useConversationSocket } from "@/hooks/useConversationSocket";
import { useMessageActionsReveal } from "@/hooks/useMessageActionsReveal";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { dispatchUnreadChanged } from "@/lib/sidebar-events";
import { getMessageLayoutInfo } from "@/lib/message-grouping";
import { resolveAttachmentDisplayUrl } from "@/lib/attachment-url";
import { applyReactionChange } from "@/lib/message-reactions";
import { sortMessagesByCreatedAt } from "@/lib/message-order";
import {
  maxScrollTop,
  scheduleScrollMessagesToBottom,
  scrollMessagesToBottom,
} from "@/lib/chat-scroll";
import { conversationMessagesPath, MESSAGE_PAGE_SIZE } from "@/lib/messages";

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function detectMobileLikeViewport(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(max-width: 768px)").matches
  );
}

function useCoarsePointer() {
  // Default true so mobile/SSR never flash "(Enter to send)" before effects run.
  const [coarsePointer, setCoarsePointer] = useState(true);

  useEffect(() => {
    const mediaQueries = [
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(hover: none)"),
      window.matchMedia("(max-width: 768px)"),
    ];
    const update = () => setCoarsePointer(detectMobileLikeViewport());
    update();
    for (const mq of mediaQueries) {
      mq.addEventListener("change", update);
    }
    return () => {
      for (const mq of mediaQueries) {
        mq.removeEventListener("change", update);
      }
    };
  }, []);

  return coarsePointer;
}

function composerPlaceholderForDevice(placeholder: string, coarsePointer: boolean): string {
  const base = placeholder
    .replace(/,?\s*\(?Enter to send\)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (coarsePointer) return base;

  if (base.includes("@ to mention")) {
    return base.replace("@ to mention", "@ to mention, Enter to send");
  }

  return `${base} (Enter to send)`;
}

type Member = { id: string; displayName: string };

type Props = {
  conversationId: string | null;
  initialMessages: Message[];
  hasMore?: boolean;
  firstUnreadMessageId?: string | null;
  members?: Member[];
  currentUserId?: string;
  /** Group/team leader — may delete other members' messages (not your own-only case). */
  isGroupLeader?: boolean;
  canPost?: boolean;
  readOnlyReason?: string;
  layout?: "card" | "panel";
  composerPlaceholder?: string;
  messagesLoading?: boolean;
  composerDisabled?: boolean;
};

export function ChatThread({
  conversationId,
  initialMessages,
  hasMore: initialHasMore = false,
  firstUnreadMessageId: initialFirstUnreadMessageId = null,
  members = [],
  currentUserId,
  isGroupLeader = false,
  canPost = true,
  readOnlyReason,
  layout = "card",
  composerPlaceholder = "Message your group… (@ to mention)",
  messagesLoading = false,
  composerDisabled = false,
}: Props) {
  const coarsePointer = useCoarsePointer();
  const placeholder = composerPlaceholderForDevice(composerPlaceholder, coarsePointer);
  const { setRealtimeConnected, session, sessionLoading } = useChatLayout();
  const resolvedUserId = currentUserId ?? session?.userId;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(
    initialFirstUnreadMessageId,
  );
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const hasMarkedReadRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState("");
  const sendInFlightRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLLIElement>(null);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  const pendingScrollRestoreRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(
    null,
  );

  messagesRef.current = messages;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = loadingMore;
  const autoScrollToBottomRef = useRef(true);
  const pinnedToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const scrollBottomThresholdPx = 72;
  const identityPending = !resolvedUserId && sessionLoading && messages.length > 0;

  const markConversationRead = useCallback(() => {
    if (!conversationId || hasMarkedReadRef.current) return;
    hasMarkedReadRef.current = true;
    setFirstUnreadMessageId(null);
    void apiFetch(`/api/v1/conversations/${conversationId}/read`, { method: "POST" }).catch(
      () => {
        hasMarkedReadRef.current = false;
      },
    );
    dispatchUnreadChanged({ conversationId, hasUnread: false });
  }, [conversationId]);

  function getScrollContainer(): HTMLElement | null {
    if (layout === "panel") return panelBodyRef.current;
    return messagesListRef.current;
  }

  function isAtScrollBottom(container: HTMLElement): boolean {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      scrollBottomThresholdPx
    );
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      const el = composerRef.current;
      el?.focus();
      syncComposerTextareaHeight(el);
    });
  }

  useLayoutEffect(() => {
    syncComposerTextareaHeight(composerRef.current);
    if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;
    const container = getScrollContainer();
    if (container) scrollMessagesToBottom(container);
  }, [body, composerDisabled, conversationId, layout, messages.length]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const container = getScrollContainer();
    if (container) {
      if (behavior === "instant") {
        scrollMessagesToBottom(container);
      } else {
        container.scrollTo({ top: maxScrollTop(container), behavior });
      }
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  }

  const updateScrollPinned = useCallback(() => {
    const container = getScrollContainer();
    if (!container || container.scrollHeight <= container.clientHeight) {
      pinnedToBottomRef.current = true;
      autoScrollToBottomRef.current = true;
      setShowScrollToBottom(false);
      return;
    }
    const atBottom = isAtScrollBottom(container);
    pinnedToBottomRef.current = atBottom;
    if (atBottom) {
      autoScrollToBottomRef.current = true;
      markConversationRead();
    } else {
      autoScrollToBottomRef.current = false;
    }
    setShowScrollToBottom(!atBottom && messages.length > 0);
  }, [layout, messages.length, markConversationRead]);

  const handleScrollContainer = useCallback(() => {
    updateScrollPinned();
  }, [updateScrollPinned]);

  function handleJumpToBottom() {
    autoScrollToBottomRef.current = true;
    pinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollToBottom();
    markConversationRead();
  }

  useLayoutEffect(() => {
    const restore = pendingScrollRestoreRef.current;
    if (!restore) return;

    const container = getScrollContainer();
    if (container) {
      container.scrollTop = restore.scrollTop + (container.scrollHeight - restore.scrollHeight);
    }
    pendingScrollRestoreRef.current = null;
  }, [messages, layout]);

  const lastMessageId = messages[messages.length - 1]?.id;

  useLayoutEffect(() => {
    if (messagesLoading || identityPending || messages.length === 0) return;
    if (pendingScrollRestoreRef.current) return;
    if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;

    const container = getScrollContainer();
    if (!container) return;

    const followLatest = () => {
      if (pendingScrollRestoreRef.current) return;
      if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;

      scrollMessagesToBottom(container);
      pinnedToBottomRef.current = true;
      autoScrollToBottomRef.current = true;
      setShowScrollToBottom(false);
    };

    followLatest();
    const cancelScheduled = scheduleScrollMessagesToBottom(container);

    const resizeObserver = new ResizeObserver(followLatest);
    resizeObserver.observe(container);
    const inner = container.querySelector<HTMLElement>(".chat-panel-messages-inner");
    if (inner) resizeObserver.observe(inner);
    const list = messagesListRef.current;
    if (list) resizeObserver.observe(list);

    return () => {
      cancelScheduled();
      resizeObserver.disconnect();
    };
  }, [lastMessageId, messages.length, messagesLoading, identityPending, layout]);

  useEffect(() => {
    autoScrollToBottomRef.current = !initialFirstUnreadMessageId;
    pinnedToBottomRef.current = !initialFirstUnreadMessageId;
    setShowScrollToBottom(false);
    setBody("");
    setMentionQuery(null);
    setSendError(null);
    setEditingId(null);
    setEditBody("");
    setFirstUnreadMessageId(initialFirstUnreadMessageId);
    hasMarkedReadRef.current = false;
  }, [conversationId, initialFirstUnreadMessageId]);

  useEffect(() => {
    setMessages(sortMessagesByCreatedAt(initialMessages));
    setHasMore(initialHasMore);
    if (!initialFirstUnreadMessageId) {
      autoScrollToBottomRef.current = true;
      pinnedToBottomRef.current = true;
    }
  }, [conversationId, initialFirstUnreadMessageId, initialHasMore, initialMessages]);

  useLayoutEffect(() => {
    if (messagesLoading || identityPending || !firstUnreadMessageId) return;
    if (!messages.some((message) => message.id === firstUnreadMessageId)) return;

    const container = getScrollContainer();
    const target = container?.querySelector<HTMLElement>(
      `[data-message-id="${firstUnreadMessageId}"]`,
    );
    if (!target) return;

    target.scrollIntoView({ block: "center" });
    autoScrollToBottomRef.current = false;
    pinnedToBottomRef.current = false;
    setShowScrollToBottom(true);
  }, [firstUnreadMessageId, messagesLoading, identityPending, messages, layout]);

  useEffect(() => {
    if (!firstUnreadMessageId || messagesLoading) return;
    const divider = unreadDividerRef.current;
    if (!divider) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markConversationRead();
        }
      },
      { root: getScrollContainer(), threshold: 0.5 },
    );

    observer.observe(divider);
    return () => observer.disconnect();
  }, [firstUnreadMessageId, messagesLoading, layout, markConversationRead]);

  useEffect(() => {
    if (firstUnreadMessageId || messagesLoading || messages.length === 0) return;
    markConversationRead();
  }, [firstUnreadMessageId, messagesLoading, messages.length, markConversationRead]);

  useEffect(() => {
    setMessages((prev) => {
      if (initialMessages.length === 0) return prev;
      if (prev.length > initialMessages.length) return prev;
      return sortMessagesByCreatedAt(initialMessages);
    });
    setHasMore((prev) =>
      messagesRef.current.length > initialMessages.length ? prev : initialHasMore,
    );
    setFirstUnreadMessageId((prev) => prev ?? initialFirstUnreadMessageId);
  }, [initialMessages, initialHasMore, initialFirstUnreadMessageId]);

  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;

    const onResize = () => {
      if (pinnedToBottomRef.current || autoScrollToBottomRef.current) {
        scrollMessagesToBottom(container);
        return;
      }
      updateScrollPinned();
    };

    updateScrollPinned();
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    const inner = container.querySelector<HTMLElement>(".chat-panel-messages-inner");
    if (inner) observer.observe(inner);
    const list = messagesListRef.current;
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [layout, messages.length, updateScrollPinned]);

  const onEvent = useCallback(
    (event: {
      type: string;
      message?: Message;
      messageId?: string;
      reaction?: Reaction;
      action?: string;
    }) => {
      if (event.type === "message.created" && event.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message!.id)) return prev;
          const shouldFollow =
            pinnedToBottomRef.current || event.message!.authorId === resolvedUserId;
          if (shouldFollow) {
            autoScrollToBottomRef.current = true;
          }
          return sortMessagesByCreatedAt([...prev, event.message!]);
        });
        if (event.message.authorId !== resolvedUserId && conversationId && pinnedToBottomRef.current) {
          markConversationRead();
        }
      }
      if (event.type === "message.updated" && event.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === event.message!.id ? { ...m, ...event.message! } : m)),
        );
      }
      if (event.type === "message.deleted" && event.messageId) {
        setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
      }
      if (event.type === "reaction.changed" && event.messageId && event.reaction) {
        const { messageId, reaction, action } = event;
        setMessages((prev) =>
          applyReactionChange(
            prev,
            messageId,
            reaction,
            action === "removed" ? "removed" : "added",
          ),
        );
      }
    },
    [conversationId, resolvedUserId, markConversationRead],
  );

  const { connected } = useConversationSocket(conversationId, onEvent);
  useConversationPollFallback(conversationId, connected, setMessages);
  const messageActions = useMessageActionsReveal();

  useEffect(() => {
    setRealtimeConnected(connected);
  }, [connected, setRealtimeConnected]);

  useEffect(() => {
    return () => setRealtimeConnected(false);
  }, [conversationId, setRealtimeConnected]);

  async function postMessage(payload: {
    body: string;
    clientMessageId: string;
    attachmentUrl?: string;
    messageType?: string;
  }) {
    if (!conversationId) return;
    const { message } = await apiFetch<{ message: Message }>(
      `/api/v1/messages?conversationId=${conversationId}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      autoScrollToBottomRef.current = true;
      return sortMessagesByCreatedAt([...prev, message]);
    });
  }

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingMoreRef.current) return;
    const currentMessages = messagesRef.current;
    if (currentMessages.length === 0 || !hasMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    autoScrollToBottomRef.current = false;
    const container = getScrollContainer();
    const scrollSnapshot =
      container !== null
        ? { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight }
        : null;
    const oldestId = currentMessages[0].id;

    try {
      const data = await apiFetch<{ messages: Message[]; hasMore: boolean }>(
        conversationMessagesPath(conversationId, { before: oldestId, limit: MESSAGE_PAGE_SIZE }),
      );
      const incoming = data.messages.filter(
        (m) => !currentMessages.some((item) => item.id === m.id),
      );
      if (incoming.length === 0) {
        setHasMore(data.hasMore);
        return;
      }

      if (scrollSnapshot) {
        pendingScrollRestoreRef.current = scrollSnapshot;
      }
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return sortMessagesByCreatedAt([...incoming.filter((m) => !ids.has(m.id)), ...prev]);
      });
      setHasMore(data.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, layout]);

  useEffect(() => {
    const root = getScrollContainer();
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !hasMore || messages.length === 0 || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (loadingMoreRef.current || !hasMoreRef.current) return;
        if (isAtScrollBottom(root)) return;
        void loadOlder();
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadOlder, layout, messages.length, loadingMore]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!conversationId || !body.trim() || sendInFlightRef.current || !canPost || composerDisabled) return;

    const text = body.trim();
    setBody("");
    setMentionQuery(null);
    setSendError(null);
    sendInFlightRef.current = true;

    try {
      await postMessage({ body: text, clientMessageId: crypto.randomUUID() });
    } catch (err) {
      setBody(text);
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      sendInFlightRef.current = false;
      focusComposer();
    }
  }

  async function handleImage(file: File) {
    if (!canPost || composerDisabled || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSendError(null);
    try {
      const url = await uploadImage(file);
      await postMessage({
        body: body.trim(),
        clientMessageId: crypto.randomUUID(),
        attachmentUrl: url,
        messageType: "image",
      });
      setBody("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      sendInFlightRef.current = false;
      focusComposer();
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!resolvedUserId) return;

    const message = messages.find((m) => m.id === messageId);
    const existing = message?.reactions?.find(
      (r) => r.userId === resolvedUserId && r.emoji === emoji,
    );
    const optimisticReaction: Reaction = {
      messageId,
      userId: resolvedUserId,
      userName: session?.displayName ?? "You",
      emoji,
    };

    setMessages((prev) =>
      applyReactionChange(
        prev,
        messageId,
        optimisticReaction,
        existing ? "removed" : "added",
      ),
    );

    try {
      if (existing) {
        await apiFetch(
          `/api/v1/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`,
          { method: "DELETE" },
        );
      } else {
        const { reaction } = await apiFetch<{ reaction: Reaction }>(
          `/api/v1/messages/${messageId}/reactions`,
          { method: "POST", body: JSON.stringify({ emoji }) },
        );
        setMessages((prev) => applyReactionChange(prev, messageId, reaction, "added"));
      }
    } catch {
      setMessages((prev) =>
        applyReactionChange(
          prev,
          messageId,
          optimisticReaction,
          existing ? "added" : "removed",
        ),
      );
    }
  }

  async function saveEdit(messageId: string) {
    if (!editBody.trim()) return;
    setSending(true);
    try {
      const { message } = await apiFetch<{ message: Message }>(`/api/v1/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: editBody }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? message : m)));
      setEditingId(null);
      setEditBody("");
    } finally {
      setSending(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const messageId = deleteTarget;
    setDeleteTarget(null);
    try {
      await apiFetch(`/api/v1/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete message");
    }
  }

  function insertMention(member: Member) {
    const token = formatMention(member.displayName, member.id);
    setBody((prev) => {
      const at = prev.lastIndexOf("@");
      if (at >= 0) return `${prev.slice(0, at)}${token} `;
      return `${prev}${token} `;
    });
    setMentionQuery(null);
  }

  function handleBodyChange(value: string) {
    setBody(value);
    const at = value.lastIndexOf("@");
    if (at >= 0 && !value.slice(at).includes(" ")) {
      setMentionQuery(value.slice(at + 1).toLowerCase());
    } else {
      setMentionQuery(null);
    }
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const mentionCandidates =
    mentionQuery === null
      ? []
      : members.filter(
          (m) =>
            m.id !== resolvedUserId &&
            m.displayName.toLowerCase().includes(mentionQuery),
        );

  function isOwnMessage(message: Message): boolean {
    return Boolean(resolvedUserId && message.authorId === resolvedUserId);
  }

  function canEditMessage(message: Message): boolean {
    return Boolean(resolvedUserId && message.authorId === resolvedUserId);
  }

  function canDeleteMessage(message: Message): boolean {
    if (isOwnMessage(message)) return true;
    return isGroupLeader;
  }

  const messageScrollContent = (
    <>
        {sendError && (
          <p className="send-error" role="alert">
            {sendError}
          </p>
        )}

        {(hasMore || loadingMore) && messages.length > 0 && (
          <div className="messages-history-top" aria-hidden={!loadingMore}>
            <div ref={topSentinelRef} className="messages-top-sentinel" />
            {loadingMore && (
              <div className="messages-loading-older" role="status" aria-live="polite">
                <div className="spinner" aria-hidden />
              </div>
            )}
          </div>
        )}

        {messagesLoading && messages.length === 0 ? (
          <div className="messages-loading" role="status" aria-live="polite">
            <div className="spinner" aria-hidden />
          </div>
        ) : identityPending ? (
          <div className="messages-loading" role="status" aria-live="polite">
            <div className="spinner" aria-hidden />
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <h3>No messages yet</h3>
            <p>{canPost ? "Be the first to say hello." : "Messages from leaders will appear here."}</p>
          </div>
        ) : (
          <ul
            className="messages"
            ref={messagesListRef}
            aria-label="Messages"
            onScroll={layout === "panel" ? undefined : handleScrollContainer}
          >
          {messages.map((m, index) => {
            const isOwn = isOwnMessage(m);
            const isEditing = editingId === m.id;
            const layoutInfo = getMessageLayoutInfo(messages, index, resolvedUserId);
            const showOwnMessageHeader =
              isOwn &&
              (layoutInfo.groupPosition === "first" ||
                layoutInfo.groupPosition === "single" ||
                layoutInfo.clusterTimestamp ||
                Boolean(m.editedAt));
            const hasVisibleTimestamp =
              showOwnMessageHeader || (!isOwn && layoutInfo.showAuthorName);

            return (
            <Fragment key={m.id}>
              {firstUnreadMessageId === m.id && (
                <li className="messages-unread-divider-wrap" aria-hidden={false}>
                  <div ref={unreadDividerRef} className="messages-unread-divider" role="separator">
                    <span>New messages</span>
                  </div>
                </li>
              )}
            <li
              data-message-id={m.id}
              className={[
                "message-item",
                isOwn ? "message-item--own" : "message-item--other",
                `message-item--spacing-${layoutInfo.spacing}`,
                `message-item--group-${layoutInfo.groupPosition}`,
                hasVisibleTimestamp ? "message-item--has-timestamp" : "",
                showOwnMessageHeader ? "message-item--show-time" : "",
                layoutInfo.showTimestamp ? "message-item--timestamp-start" : "",
                layoutInfo.nextHasGapBreak ? "message-item--timestamp-gap" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {!isOwn &&
                (layoutInfo.showAvatar ? (
                  <UserAvatar
                    displayName={m.authorName}
                    avatarUrl={m.authorAvatarUrl}
                    className="message-avatar"
                  />
                ) : (
                  <span className="message-avatar-spacer" aria-hidden="true" />
                ))}
              <div
                className={[
                  "message-content",
                  hasVisibleTimestamp ? "message-content--has-timestamp" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                    {!isOwn && layoutInfo.showAuthorName && (
                      <div className="message-meta">
                        <strong>{m.authorName}</strong>
                        {m.editedAt ? <span className="message-edited">edited · </span> : null}
                        <time dateTime={m.createdAt}>{formatMessageTime(m.createdAt)}</time>
                      </div>
                    )}
                    {!isOwn && m.editedAt && !layoutInfo.showAuthorName && (
                      <div className="message-header">
                        <span className="message-edited">edited</span>
                      </div>
                    )}

                {isEditing ? (
                  <form
                    className="edit-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(m.id);
                    }}
                  >
                    <input
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={sending}
                      aria-label="Edit message"
                    />
                    <button type="submit" className="btn-send" disabled={sending}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditBody("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    {showOwnMessageHeader && (
                      <div className="message-header">
                        <time dateTime={m.createdAt}>
                          {m.editedAt ? "edited · " : ""}
                          {formatMessageTime(m.createdAt)}
                        </time>
                      </div>
                    )}
                    <MessageBubbleStack
                      messageId={m.id}
                      reactions={m.reactions ?? []}
                      currentUserId={resolvedUserId}
                      onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
                    >
                    <div
                      className={[
                        "message-bubble",
                        isOwn ? "message-bubble--own" : "message-bubble--other",
                        `message-bubble--group-${layoutInfo.groupPosition}`,
                        messageActions.isRevealed(m.id) ? "message-bubble--actions-visible" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      {...messageActions.getBubbleHandlers(m.id)}
                    >
                      <span className="message-actions">
                        <MessageEmojiActions
                          messageId={m.id}
                          onToggleReaction={(messageId, emoji) => void toggleReaction(messageId, emoji)}
                        />
                        {(canEditMessage(m) || canDeleteMessage(m)) && (
                          <span className="message-actions-divider" aria-hidden />
                        )}
                        {canEditMessage(m) && (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditBody(m.body);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {canDeleteMessage(m) && (
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => setDeleteTarget(m.id)}
                          >
                            Delete
                          </button>
                        )}
                      </span>
                      {m.attachmentUrl && m.messageType === "image" && (
                        <img
                          src={resolveAttachmentDisplayUrl(m.attachmentUrl)}
                          alt={m.body || "Shared image"}
                          className="attachment"
                        />
                      )}
                      {m.body ? <MessageBody body={m.body} /> : null}
                    </div>
                    </MessageBubbleStack>
                  </>
                )}
              </div>
            </li>
            </Fragment>
            );
          })}
          <li className="messages-scroll-anchor" ref={messagesEndRef} aria-hidden />
        </ul>
      )}

        {mentionCandidates.length > 0 && (
          <ul className="mention-suggestions" role="listbox" aria-label="Mention suggestions">
            {mentionCandidates.slice(0, 5).map((m) => (
              <li key={m.id}>
                <button type="button" role="option" onClick={() => insertMention(m)}>
                  @{m.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}
    </>
  );

  return (
    <div className={`chat-thread ${layout === "panel" ? "chat-thread-panel" : ""}`}>
      {layout === "panel" ? (
        <div
          ref={panelBodyRef}
          className="chat-panel-body"
          onScroll={handleScrollContainer}
        >
          <div className="chat-panel-messages-inner">{messageScrollContent}</div>
        </div>
      ) : (
        <div>{messageScrollContent}</div>
      )}

      <div className="chat-composer-stack">
        {showScrollToBottom && (
          <button
            type="button"
            className="chat-scroll-to-bottom"
            aria-label="Scroll to latest messages"
            onClick={handleJumpToBottom}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="chat-scroll-to-bottom-icon">
              <path
                d="M12 5v14M6 13l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

      {canPost ? (
        <form
          onSubmit={handleSend}
          className={`composer${composerDisabled ? " composer--locked" : ""}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImage(file);
              e.target.value = "";
            }}
          />
          <ComposerAttachMenu
            disabled={composerDisabled}
            onPickImage={() => fileRef.current?.click()}
          />
          <textarea
            ref={composerRef}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={placeholder}
            enterKeyHint="send"
            disabled={composerDisabled}
            rows={1}
            aria-label="Message"
          />
          <button
            type="submit"
            className="composer-send"
            disabled={composerDisabled || !body.trim()}
            aria-label="Send message"
            onMouseDown={(e) => e.preventDefault()}
          >
            <svg
              className="composer-send-icon"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      ) : (
        <div className="composer-readonly" role="status">
          {readOnlyReason ?? "You cannot post in this conversation."}
        </div>
      )}
      </div>

      {deleteTarget && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="dialog">
            <h3 id="delete-title">Delete message?</h3>
            <p>This cannot be undone.</p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
