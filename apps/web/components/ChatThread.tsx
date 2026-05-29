"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatComposer, useComposerDragHandlers, type PendingComposerMedia } from "@/components/ChatComposer";
import { ChatHomeBanner, CHAT_PANEL_BANNER_AUTO_DISMISS_MS } from "@/components/ChatHomeBanner";
import { ChatMessageList } from "@/components/ChatMessageList";
import {
  apiFetch,
  importGiphyGif,
  uploadImage,
  uploadVideo,
  type Message,
  type MemberReadReceipt,
  type PeerUser,
  type Reaction,
} from "@/lib/api";
import { useConversationPollFallback } from "@/hooks/useConversationPollFallback";
import { useAppUpdateGuard } from "@/hooks/useAppUpdateGuard";
import { useMessageActionsReveal } from "@/hooks/useMessageActionsReveal";
import { useMessageEnterDelays } from "@/hooks/useMessageEnterDelays";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { dispatchConversationUpdated, dispatchUnreadChanged } from "@/lib/sidebar-events";
import { AttachmentLightbox, type AttachmentLightboxImage } from "@/components/AttachmentLightbox";
import { AttachmentVideoLightbox } from "@/components/AttachmentVideoLightbox";
import { TypingIndicator } from "@/components/TypingIndicator";
import { applyReactionChange, mergeConversationMessages } from "@/lib/message-reactions";
import { invalidateConversation } from "@/lib/message-cache";
import { sortMessagesByCreatedAt } from "@/lib/message-order";
import {
  maxScrollTop,
  observePinnedScrollContent,
  scheduleScrollMessagesToBottom,
  scrollContainerToElement,
  scrollMessagesToBottom,
} from "@/lib/chat-scroll";
import { conversationMessagesPath, MESSAGE_PAGE_SIZE } from "@/lib/messages";
import {
  saveComposerDraft,
  setSendInFlight,
} from "@/lib/app-update-composer";
import { isAppUpdateInProgress } from "@/lib/app-update";
import { revokePendingComposerMedia } from "@/lib/composer-media";
import {
  createPendingUploadMessage,
  removePendingUploadByClientMessageId,
  replacePendingUploadMessage,
} from "@/lib/optimistic-media-message";
import {
  createPendingSendMessage,
  removePendingSendByClientMessageId,
} from "@/lib/optimistic-text-message";
import {
  mergeCallTimelineEvents,
  normalizeCallTimelineEvents,
  applyCallEndedToTimelineEvents,
  upsertCallTimelineEvent,
  type CallTimelineEventDto,
} from "@/lib/call-timeline";

/** Stable scroll/list key while an optimistic send is confirmed (id changes, clientMessageId does not). */
function messageListTailKey(message: Message | undefined): string {
  if (!message) return "";
  return message.clientMessageId ?? message.id;
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

type Member = { id?: string; displayName: string; onCco?: boolean };

type Props = {
  conversationId: string | null;
  initialMessages: Message[];
  initialCallEvents?: CallTimelineEventDto[];
  hasMore?: boolean;
  firstUnreadMessageId?: string | null;
  members?: Member[];
  currentUserId?: string;
  /** Group/team leader — may delete other members' messages (not your own-only case). */
  isGroupLeader?: boolean;
  canPost?: boolean;
  readOnlyReason?: string;
  onConversationSettingsChange?: (settings: { leaderOnly?: boolean; title?: string }) => void;
  layout?: "card" | "panel";
  composerPlaceholder?: string;
  messagesLoading?: boolean;
  composerDisabled?: boolean;
  isDirectMessage?: boolean;
  initialPeerLastReadAt?: string | null;
  peerUser?: PeerUser | null;
  initialMemberReadReceipts?: MemberReadReceipt[];
};

const RECENT_MESSAGE_MS = 15_000;
const TYPING_TTL_MS = 5_000;

type ActiveTyper = {
  displayName: string;
  expiresAt: number;
};

export function ChatThread({
  conversationId,
  initialMessages,
  initialCallEvents = [],
  hasMore: initialHasMore = false,
  firstUnreadMessageId: initialFirstUnreadMessageId = null,
  members = [],
  currentUserId,
  isGroupLeader = false,
  canPost = true,
  readOnlyReason,
  onConversationSettingsChange,
  layout = "card",
  composerPlaceholder = "Message your group… (@ to mention)",
  messagesLoading = false,
  composerDisabled = false,
  isDirectMessage = false,
  initialPeerLastReadAt = null,
  peerUser = null,
  initialMemberReadReceipts = [],
}: Props) {
  const coarsePointer = useCoarsePointer();
  const appUpdateBlocked = useAppUpdateGuard();
  const composerLocked = composerDisabled || appUpdateBlocked;
  const placeholder = composerPlaceholderForDevice(composerPlaceholder, coarsePointer);
  const { subscribeRealtime, session, realtimeConnected, activeConversationId } = useChatLayout();
  const messageActions = useMessageActionsReveal();
  const resolvedUserId = currentUserId ?? session?.userId;
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [callEvents, setCallEvents] = useState<CallTimelineEventDto[]>(initialCallEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(
    initialFirstUnreadMessageId,
  );
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(initialPeerLastReadAt);
  const [memberReadReceipts, setMemberReadReceipts] = useState<MemberReadReceipt[]>(
    initialMemberReadReceipts,
  );
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const hasMarkedReadRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sendInFlightRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<AttachmentLightboxImage | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<AttachmentLightboxImage | null>(null);
  const [activeTypers, setActiveTypers] = useState<Map<string, ActiveTyper>>(() => new Map());
  const stageComposerMediaRef = useRef<(files: File | File[]) => void>(() => {});
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
  const autoScrollToBottomRef = useRef(initialFirstUnreadMessageId == null);
  const pinnedToBottomRef = useRef(initialFirstUnreadMessageId == null);
  const initialScrollDoneRef = useRef(false);
  const messageSnapshotRef = useRef("");
  const bottomSeenMessageIdRef = useRef<string | null>(null);
  const deletedMessageIdsRef = useRef(new Set<string>());
  const recentMessageIdsRef = useRef(new Map<string, number>());
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [scrollReady, setScrollReady] = useState(false);
  const messageEnterDelays = useMessageEnterDelays(messages, scrollReady, conversationId);

  const {
    composerDragOver,
    resetComposerDragState,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
  } = useComposerDragHandlers({
    canPost,
    composerLocked,
    onDropFiles: (files) => stageComposerMediaRef.current(files),
  });

  function getScrollContainer(): HTMLElement | null {
    if (layout === "panel") return panelBodyRef.current;
    return messagesListRef.current;
  }

  const handleComposerLayout = useCallback(() => {
    if (!initialScrollDoneRef.current) return;
    if (firstUnreadMessageId) return;
    if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;
    const container = getScrollContainer();
    if (container) scrollMessagesToBottom(container);
  }, [firstUnreadMessageId, layout, messages.length]);

  const scrollBottomThresholdPx = 72;

  const markBottomSeen = useCallback(() => {
    bottomSeenMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
    setHasNewMessagesBelow(false);
  }, []);

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

  const markMessageDeleted = useCallback(
    (messageId: string) => {
      deletedMessageIdsRef.current.add(messageId);
      recentMessageIdsRef.current.delete(messageId);
      if (conversationId) invalidateConversation(conversationId);
    },
    [conversationId],
  );

  const markMessageLive = useCallback((messageId: string) => {
    recentMessageIdsRef.current.set(messageId, Date.now());
  }, []);

  const getPollMergeOptions = useCallback(() => {
    const now = Date.now();
    for (const [id, timestamp] of recentMessageIdsRef.current) {
      if (now - timestamp > RECENT_MESSAGE_MS) {
        recentMessageIdsRef.current.delete(id);
      }
    }
    return {
      excludeIds: deletedMessageIdsRef.current,
      recentIds: new Set(recentMessageIdsRef.current.keys()),
    };
  }, []);

  useEffect(() => {
    deletedMessageIdsRef.current.clear();
    recentMessageIdsRef.current.clear();
  }, [conversationId]);

  function isAtScrollBottom(container: HTMLElement): boolean {
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      scrollBottomThresholdPx
    );
  }

  useLayoutEffect(() => {
    handleComposerLayout();
  }, [handleComposerLayout]);

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
      markBottomSeen();
      return;
    }
    const wasPinned = pinnedToBottomRef.current;
    const atBottom = isAtScrollBottom(container);
    pinnedToBottomRef.current = atBottom;
    if (atBottom) {
      autoScrollToBottomRef.current = true;
      markBottomSeen();
      markConversationRead();
    } else {
      autoScrollToBottomRef.current = false;
      if (wasPinned) {
        bottomSeenMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
        setHasNewMessagesBelow(false);
      } else if (bottomSeenMessageIdRef.current === null) {
        bottomSeenMessageIdRef.current = messagesRef.current.at(-1)?.id ?? null;
      }
    }
    setShowScrollToBottom(!atBottom && messages.length > 0);
  }, [layout, messages.length, markBottomSeen, markConversationRead]);

  const handleScrollContainer = useCallback(() => {
    updateScrollPinned();
  }, [updateScrollPinned]);

  function handleJumpToBottom() {
    autoScrollToBottomRef.current = true;
    pinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    markBottomSeen();
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

  const lastMessageTailKey = messageListTailKey(messages[messages.length - 1]);

  useLayoutEffect(() => {
    if (messagesLoading || messages.length === 0) return;
    if (pendingScrollRestoreRef.current) return;
    if (loadingMoreRef.current) return;

    const lastKey = messageListTailKey(messages.at(-1));
    const snapshot = `${messages.length}:${messages[0]?.id ?? ""}:${lastKey}`;
    if (snapshot === messageSnapshotRef.current && initialScrollDoneRef.current) return;

    const prevLastKey = messageSnapshotRef.current.split(":")[2] ?? "";
    const latestChanged = lastKey !== prevLastKey;
    const firstPaint = !initialScrollDoneRef.current;

    if (
      !firstPaint &&
      !latestChanged &&
      (!pinnedToBottomRef.current || !autoScrollToBottomRef.current)
    ) {
      messageSnapshotRef.current = snapshot;
      return;
    }

    const container = getScrollContainer();
    if (!container) return;

    messageSnapshotRef.current = snapshot;

    let pinToBottomAfterPaint = true;

    if (firstPaint) {
      const unreadAnchorId = firstUnreadMessageId ?? initialFirstUnreadMessageId;
      const unreadDivider = unreadDividerRef.current;
      const unreadMessage =
        unreadAnchorId &&
        messages.some((message) => message.id === unreadAnchorId)
          ? container.querySelector<HTMLElement>(`[data-message-id="${unreadAnchorId}"]`)
          : null;
      const unreadTarget = unreadDivider ?? unreadMessage;

      if (unreadTarget) {
        scrollContainerToElement(container, unreadTarget);
        autoScrollToBottomRef.current = false;
        pinnedToBottomRef.current = false;
        bottomSeenMessageIdRef.current = messages.at(-1)?.id ?? null;
        setHasNewMessagesBelow(false);
        setShowScrollToBottom(true);
        pinToBottomAfterPaint = false;
      } else {
        scrollMessagesToBottom(container);
        pinnedToBottomRef.current = true;
        autoScrollToBottomRef.current = true;
        setShowScrollToBottom(false);
        markBottomSeen();
      }
    } else {
      scrollMessagesToBottom(container);
      pinnedToBottomRef.current = true;
      autoScrollToBottomRef.current = true;
      setShowScrollToBottom(false);
      markBottomSeen();
    }

    initialScrollDoneRef.current = true;
    setScrollReady(true);

    const cancelScheduled = pinToBottomAfterPaint
      ? scheduleScrollMessagesToBottom(container)
      : () => {};
    return () => cancelScheduled();
  }, [
    firstUnreadMessageId,
    initialFirstUnreadMessageId,
    layout,
    markBottomSeen,
    messages,
    messages.length,
    messagesLoading,
  ]);

  useLayoutEffect(() => {
    if (messagesLoading || messages.length === 0) return;
    if (!initialScrollDoneRef.current) return;
    if (pendingScrollRestoreRef.current) return;
    if (firstUnreadMessageId) return;
    if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;

    const container = getScrollContainer();
    if (!container) return;

    const followLatest = () => {
      if (pendingScrollRestoreRef.current) return;
      if (firstUnreadMessageId) return;
      if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;

      scrollMessagesToBottom(container);
      pinnedToBottomRef.current = true;
      autoScrollToBottomRef.current = true;
      setShowScrollToBottom(false);
      markBottomSeen();
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
  }, [firstUnreadMessageId, lastMessageTailKey, messages.length, messagesLoading, layout, markBottomSeen]);

  useEffect(() => {
    const latestId = messages.at(-1)?.id;
    if (!latestId || pinnedToBottomRef.current) return;

    const seenId = bottomSeenMessageIdRef.current;
    if (seenId && latestId !== seenId) {
      setHasNewMessagesBelow(true);
    }
  }, [lastMessageTailKey, messages]);

  const prevConversationIdRef = useRef(conversationId);

  useEffect(() => {
    const switchedConversation = prevConversationIdRef.current !== conversationId;
    prevConversationIdRef.current = conversationId;

    if (switchedConversation) {
      autoScrollToBottomRef.current = !initialFirstUnreadMessageId;
      pinnedToBottomRef.current = !initialFirstUnreadMessageId;
      initialScrollDoneRef.current = false;
      messageSnapshotRef.current = "";
      setScrollReady(false);
      setShowScrollToBottom(false);
      setHasNewMessagesBelow(false);
      bottomSeenMessageIdRef.current = null;
      setSendError(null);
      setEditingId(null);
      setEditBody("");
      setFirstUnreadMessageId(initialFirstUnreadMessageId);
      setPeerLastReadAt(initialPeerLastReadAt);
      setMemberReadReceipts(initialMemberReadReceipts);
      hasMarkedReadRef.current = false;
      setMessages(sortMessagesByCreatedAt(initialMessages));
      setCallEvents(initialCallEvents);
      setHasMore(initialHasMore);
      return;
    }

    if (messagesLoading) return;

    setMessages((prev) => mergeConversationMessages(prev, initialMessages));
    setCallEvents((prev) =>
      normalizeCallTimelineEvents(mergeCallTimelineEvents(prev, initialCallEvents)),
    );
    setHasMore((prev) =>
      messagesRef.current.length > initialMessages.length ? prev : initialHasMore,
    );
    setFirstUnreadMessageId((prev) => prev ?? initialFirstUnreadMessageId);
  }, [
    conversationId,
    initialMessages,
    initialCallEvents,
    initialHasMore,
    initialFirstUnreadMessageId,
    initialPeerLastReadAt,
    initialMemberReadReceipts,
    messagesLoading,
  ]);

  useEffect(() => {
    if (isDirectMessage) {
      setMemberReadReceipts([]);
      setPeerLastReadAt(initialPeerLastReadAt);
      return;
    }
    setPeerLastReadAt(null);
    setMemberReadReceipts(initialMemberReadReceipts);
  }, [initialMemberReadReceipts, initialPeerLastReadAt, isDirectMessage]);

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
    const container = getScrollContainer();
    if (!container) return;

    const shouldPin = () => {
      if (pendingScrollRestoreRef.current) return false;
      if (loadingMoreRef.current) return false;
      return pinnedToBottomRef.current || autoScrollToBottomRef.current;
    };

    const onResize = () => {
      if (shouldPin()) {
        scrollMessagesToBottom(container);
        return;
      }
      updateScrollPinned();
    };

    updateScrollPinned();
    const stopWatchingContent = observePinnedScrollContent(container, shouldPin);
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    const inner = container.querySelector<HTMLElement>(".chat-panel-messages-inner");
    if (inner) observer.observe(inner);
    const list = messagesListRef.current;
    if (list) observer.observe(list);
    return () => {
      stopWatchingContent();
      observer.disconnect();
    };
  }, [layout, messages.length, updateScrollPinned]);

  useEffect(() => {
    setActiveTypers(new Map());
  }, [conversationId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveTypers((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [userId, typer] of prev) {
          if (typer.expiresAt <= now) {
            next.delete(userId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const onEvent = useCallback(
    (event: {
      type: string;
      message?: Message;
      messageId?: string;
      reaction?: Reaction;
      action?: string;
      leaderOnly?: boolean;
      title?: string;
      imageUrl?: string | null;
      userId?: string;
      readAt?: string;
      displayName?: string;
      isTyping?: boolean;
      call?: import("@cco/shared/calls").CallSummaryDto;
      callId?: string;
      timelineEvent?: CallTimelineEventDto | null;
    }) => {
      if (event.type === "message.created" && event.message) {
        markMessageLive(event.message.id);
        if (event.message.authorId !== resolvedUserId) {
          const authorId = event.message.authorId;
          if (authorId) {
            setActiveTypers((prev) => {
              if (!prev.has(authorId)) return prev;
              const next = new Map(prev);
              next.delete(authorId);
              return next;
            });
          }
        }
        setMessages((prev) => {
          const incoming = event.message!;
          let next = removePendingSendByClientMessageId(prev, incoming.clientMessageId);
          next = removePendingUploadByClientMessageId(next, incoming.clientMessageId);
          if (next.some((m) => m.id === incoming.id)) return next;
          const shouldFollow =
            pinnedToBottomRef.current || incoming.authorId === resolvedUserId;
          if (shouldFollow) {
            autoScrollToBottomRef.current = true;
          }
          return sortMessagesByCreatedAt([...next, incoming]);
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
        markMessageDeleted(event.messageId);
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
      if (
        event.type === "conversation.read" &&
        event.readAt &&
        event.userId &&
        event.userId !== resolvedUserId
      ) {
        if (isDirectMessage) {
          setPeerLastReadAt(event.readAt);
        } else {
          const readerUserId = event.userId;
          const readerReadAt = event.readAt;
          setMemberReadReceipts((prev) => {
            const existingIndex = prev.findIndex((member) => member.userId === readerUserId);
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = { ...next[existingIndex]!, lastReadAt: readerReadAt };
              return next;
            }
            const rosterMember = members.find((member) => member.id === readerUserId);
            if (!rosterMember) return prev;
            return [
              ...prev,
              {
                userId: readerUserId,
                displayName: rosterMember.displayName,
                avatarUrl: null,
                lastReadAt: readerReadAt,
              },
            ];
          });
        }
      }
      if (
        event.type === "call.started" &&
        event.conversationId === conversationId &&
        event.timelineEvent
      ) {
        setCallEvents((prev) =>
          normalizeCallTimelineEvents(upsertCallTimelineEvent(prev, event.timelineEvent!)),
        );
        if (pinnedToBottomRef.current) {
          autoScrollToBottomRef.current = true;
        }
      }
      if (event.type === "call.ended" && event.conversationId === conversationId) {
        setCallEvents((prev) =>
          applyCallEndedToTimelineEvents(prev, {
            callId: event.callId,
            timelineEvent: event.timelineEvent,
          }),
        );
        if (pinnedToBottomRef.current) {
          autoScrollToBottomRef.current = true;
        }
      }
      if (event.type === "conversation.updated" && conversationId) {
        dispatchConversationUpdated({
          conversationId,
          leaderOnly: event.leaderOnly,
          title: event.title,
          imageUrl: event.imageUrl,
        });
        onConversationSettingsChange?.({
          leaderOnly: event.leaderOnly,
          title: event.title,
        });
      }
      if (
        event.type === "typing" &&
        event.userId &&
        event.userId !== resolvedUserId &&
        (!isDirectMessage || !peerUser || event.userId === peerUser.id)
      ) {
        if (event.isTyping) {
          setActiveTypers((prev) => {
            const next = new Map(prev);
            next.set(event.userId!, {
              displayName: event.displayName?.trim() || "Someone",
              expiresAt: Date.now() + TYPING_TTL_MS,
            });
            return next;
          });
        } else {
          setActiveTypers((prev) => {
            if (!prev.has(event.userId!)) return prev;
            const next = new Map(prev);
            next.delete(event.userId!);
            return next;
          });
        }
      }
    },
    [conversationId, isDirectMessage, markConversationRead, markMessageDeleted, markMessageLive, members, onConversationSettingsChange, peerUser, resolvedUserId],
  );

  useEffect(() => subscribeRealtime(onEvent), [onEvent, subscribeRealtime]);
  useConversationPollFallback(
    conversationId,
    realtimeConnected && activeConversationId === conversationId,
    messagesLoading,
    setMessages,
    { getMergeOptions: getPollMergeOptions },
    setCallEvents,
  );

  async function postMessage(payload: {
    body: string;
    clientMessageId: string;
    attachmentUrl?: string;
    messageType?: string;
  }) {
    if (!conversationId) return;
    if (isAppUpdateInProgress()) {
      throw new Error("App is updating. Try again in a moment.");
    }
    const { message } = await apiFetch<{ message: Message }>(
      `/api/v1/messages?conversationId=${conversationId}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    setMessages((prev) => {
      let next = removePendingSendByClientMessageId(prev, payload.clientMessageId);
      next = removePendingUploadByClientMessageId(next, payload.clientMessageId);
      if (next.some((m) => m.id === message.id)) return next;
      autoScrollToBottomRef.current = true;
      return sortMessagesByCreatedAt([...next, message]);
    });
    markMessageLive(message.id);
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
      const data = await apiFetch<{ messages: Message[]; hasMore: boolean; callEvents?: CallTimelineEventDto[] }>(
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
      if (data.callEvents?.length) {
        setCallEvents((prev) =>
          normalizeCallTimelineEvents(mergeCallTimelineEvents(prev, data.callEvents ?? [])),
        );
      }
      setHasMore(data.hasMore);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [conversationId, layout]);

  useEffect(() => {
    const root = getScrollContainer();
    const sentinel = topSentinelRef.current;
    if (!scrollReady || !root || !sentinel || !hasMore || messages.length === 0 || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!initialScrollDoneRef.current) return;
        if (loadingMoreRef.current || !hasMoreRef.current) return;
        // Still pinning to latest on open/reload — don't prefetch history until the user scrolls up.
        if (autoScrollToBottomRef.current) return;
        if (isAtScrollBottom(root)) return;
        void loadOlder();
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadOlder, layout, messages.length, loadingMore, scrollReady]);

  const handleComposerSend = useCallback(
    async ({ text, media }: { text: string; media: PendingComposerMedia[] }) => {
      if (!conversationId || !resolvedUserId) return;

      const uploadJobs = media.map((item) => ({
        item,
        clientMessageId: crypto.randomUUID(),
      }));

      if (uploadJobs.length > 0) {
        setMessages((prev) => {
          autoScrollToBottomRef.current = true;
          const optimistic = uploadJobs.map(({ item, clientMessageId }) =>
            createPendingUploadMessage({
              clientMessageId,
              authorId: resolvedUserId,
              authorName: session?.displayName ?? "You",
              authorAvatarUrl: session?.avatarUrl,
              item,
            }),
          );
          return sortMessagesByCreatedAt([...prev, ...optimistic]);
        });
      }

      let attachmentsSent = 0;
      let uploadError: Error | null = null;

      for (const { item, clientMessageId } of uploadJobs) {
        try {
          const attachmentUrl =
            item.kind === "video" ? await uploadVideo(item.file) : await uploadImage(item.file);
          const { message } = await apiFetch<{ message: Message }>(
            `/api/v1/messages?conversationId=${conversationId}`,
            {
              method: "POST",
              body: JSON.stringify({
                body: "",
                clientMessageId,
                attachmentUrl,
                messageType: item.kind,
              }),
            },
          );
          setMessages((prev) => replacePendingUploadMessage(prev, clientMessageId, message));
          markMessageLive(message.id);
          revokePendingComposerMedia(item);
          attachmentsSent += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          setMessages((prev) =>
            prev.map((entry) =>
              entry.clientMessageId === clientMessageId
                ? { ...entry, pendingUpload: false, uploadFailed: true }
                : entry,
            ),
          );
          uploadError ??= err instanceof Error ? err : new Error(message);
        }
      }

      if (text) {
        const clientMessageId = crypto.randomUUID();
        setMessages((prev) => {
          autoScrollToBottomRef.current = true;
          return sortMessagesByCreatedAt([
            ...prev,
            createPendingSendMessage({
              clientMessageId,
              authorId: resolvedUserId,
              authorName: session?.displayName ?? "You",
              authorAvatarUrl: session?.avatarUrl,
              body: text,
            }),
          ]);
        });
        try {
          await postMessage({
            body: text,
            clientMessageId,
          });
        } catch (err) {
          setMessages((prev) => removePendingSendByClientMessageId(prev, clientMessageId));
          if (media.length > 0 && attachmentsSent === 0 && !uploadError) {
            // Text failed before any attachment was sent; composer already cleared media.
          }
          saveComposerDraft(conversationId, text);
          throw err;
        }
      }

      if (uploadError) {
        throw uploadError;
      }
    },
    [conversationId, resolvedUserId, session?.avatarUrl, session?.displayName],
  );

  const handleComposerGiphy = useCallback(
    async (importUrl: string) => {
      if (!conversationId || !canPost || composerLocked || isAppUpdateInProgress()) return;

      setSendError(null);
      sendInFlightRef.current = true;
      setSendInFlight(true);

      try {
        const attachmentUrl = await importGiphyGif(importUrl);
        await postMessage({
          body: "",
          clientMessageId: crypto.randomUUID(),
          attachmentUrl,
          messageType: "image",
        });
        resetComposerDragState();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send GIF";
        setSendError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        sendInFlightRef.current = false;
        setSendInFlight(false);
      }
    },
    [canPost, composerLocked, conversationId, resetComposerDragState],
  );

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!resolvedUserId) return;

    const optimisticReaction: Reaction = {
      messageId,
      userId: resolvedUserId,
      userName: session?.displayName ?? "You",
      emoji,
    };

    let removing = false;
    setMessages((prev) => {
      const message = prev.find((m) => m.id === messageId);
      removing = Boolean(
        message?.reactions?.some(
          (r) => r.userId === resolvedUserId && r.emoji === emoji,
        ),
      );
      return applyReactionChange(
        prev,
        messageId,
        optimisticReaction,
        removing ? "removed" : "added",
      );
    });

    try {
      if (removing) {
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
          removing ? "added" : "removed",
        ),
      );
    }
  }, [resolvedUserId, session?.displayName]);

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
      markMessageDeleted(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete message");
    }
  }

  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      void toggleReaction(messageId, emoji);
    },
    [toggleReaction],
  );

  const messageScrollContent = (
    <>
      {layout !== "panel" && sendError && (
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
      ) : messages.length === 0 && callEvents.length === 0 ? (
        <div className="empty-state">
          <h3>No messages yet</h3>
          <p>{canPost ? "Be the first to say hello." : "Messages from leaders will appear here."}</p>
        </div>
      ) : (
        <ChatMessageList
          conversationId={conversationId ?? ""}
          messages={messages}
          callEvents={callEvents}
          messageEnterDelays={messageEnterDelays}
          firstUnreadMessageId={firstUnreadMessageId}
          resolvedUserId={resolvedUserId}
          isGroupLeader={isGroupLeader}
          editingId={editingId}
          editBody={editBody}
          sending={sending}
          layout={layout}
          messageActions={messageActions}
          unreadDividerRef={unreadDividerRef}
          messagesListRef={messagesListRef}
          messagesEndRef={messagesEndRef}
          onScrollContainer={handleScrollContainer}
          onToggleReaction={handleToggleReaction}
          onStartEdit={(messageId, body) => {
            setEditingId(messageId);
            setEditBody(body);
          }}
          onEditBodyChange={setEditBody}
          onSaveEdit={(messageId) => void saveEdit(messageId)}
          onCancelEdit={() => {
            setEditingId(null);
            setEditBody("");
          }}
          onDeleteTarget={setDeleteTarget}
          onOpenImage={setLightboxImage}
          onOpenVideo={setLightboxVideo}
          isDirectMessage={isDirectMessage}
          peerLastReadAt={peerLastReadAt}
          peerUser={peerUser}
          memberReadReceipts={memberReadReceipts}
        />
      )}
    </>
  );

  const typingDisplayNames = useMemo(
    () => [...activeTypers.values()].map((typer) => typer.displayName),
    [activeTypers],
  );

  return (
    <div
      className={[
        "chat-thread",
        layout === "panel" ? "chat-thread-panel" : "",
        messages.length > 0 && !scrollReady ? "chat-thread--scroll-init" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {layout === "panel" ? (
        <div className="chat-panel-messages-wrap">
          {sendError ? (
            <div className="chat-panel-banner-slot">
              <ChatHomeBanner
                key={sendError}
                variant="error"
                placement="panel"
                autoDismissMs={CHAT_PANEL_BANNER_AUTO_DISMISS_MS}
                onDismiss={() => setSendError(null)}
              >
                {sendError}
              </ChatHomeBanner>
            </div>
          ) : null}
          <div
            ref={panelBodyRef}
            className={[
              "chat-panel-body",
              scrollReady ? "chat-panel-body--scroll-ready" : "chat-panel-body--scroll-init",
            ].join(" ")}
            onScroll={handleScrollContainer}
          >
            <div className="chat-panel-messages-inner">{messageScrollContent}</div>
          </div>
        </div>
      ) : (
        <div>{messageScrollContent}</div>
      )}

      <div
        className={[
          "chat-composer-stack",
          composerDragOver ? "chat-composer-stack--drag-over" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        {composerDragOver && canPost && !composerLocked ? (
          <div className="composer-drop-overlay" aria-hidden="true">
            <span className="composer-drop-overlay-label">Drop media to attach</span>
          </div>
        ) : null}
        {showScrollToBottom && (
          <button
            type="button"
            className={[
              "chat-scroll-to-bottom",
              hasNewMessagesBelow ? "chat-scroll-to-bottom--has-new" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={
              hasNewMessagesBelow
                ? "New messages — scroll to latest"
                : "Scroll to latest messages"
            }
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
            {hasNewMessagesBelow ? (
              <span className="chat-scroll-to-bottom-badge" aria-hidden />
            ) : null}
          </button>
        )}

        <TypingIndicator displayNames={typingDisplayNames} />

        <ChatComposer
          conversationId={conversationId}
          canPost={canPost}
          composerLocked={composerLocked}
          readOnlyReason={readOnlyReason}
          coarsePointer={coarsePointer}
          composerPlaceholder={placeholder}
          members={members}
          resolvedUserId={resolvedUserId}
          sendError={sendError}
          hideSendErrorBanner={layout === "panel"}
          onSendError={setSendError}
          onSend={handleComposerSend}
          onSendGiphy={handleComposerGiphy}
          onComposerLayout={handleComposerLayout}
          onMountStageMedia={(stageMedia) => {
            stageComposerMediaRef.current = stageMedia;
          }}
          appUpdateBlocked={appUpdateBlocked}
        />
      </div>

      {lightboxVideo && (
        <AttachmentVideoLightbox
          src={lightboxVideo.src}
          alt={lightboxVideo.alt}
          onClose={() => setLightboxVideo(null)}
        />
      )}

      {lightboxImage && (
        <AttachmentLightbox
          src={lightboxImage.src}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}

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
