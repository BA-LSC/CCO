"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, Fragment } from "react";
import { syncComposerTextareaHeight } from "@/lib/composer-textarea";
import {
  MessageBubbleStack,
  MessageEmojiActions,
} from "@/components/MessageReactionToolbar";
import { ComposerAttachMenu } from "@/components/ComposerAttachMenu";
import { ComposerPendingMedia } from "@/components/ComposerPendingMedia";
import { MessageBody } from "@/components/MessageBody";
import { UserAvatar } from "@/components/UserAvatar";
import {
  apiFetch,
  formatMention,
  uploadImage,
  uploadVideo,
  type Message,
  type Reaction,
} from "@/lib/api";
import { useConversationPollFallback } from "@/hooks/useConversationPollFallback";
import { useAppUpdateGuard } from "@/hooks/useAppUpdateGuard";
import { useMessageActionsReveal } from "@/hooks/useMessageActionsReveal";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { dispatchUnreadChanged } from "@/lib/sidebar-events";
import { getMessageLayoutInfo } from "@/lib/message-grouping";
import { resolveAttachmentDisplayUrl } from "@/lib/attachment-url";
import { AttachmentLightbox, type AttachmentLightboxImage } from "@/components/AttachmentLightbox";
import { AttachmentVideoLightbox } from "@/components/AttachmentVideoLightbox";
import { VideoAttachmentPreview } from "@/components/VideoAttachmentPreview";
import { applyReactionChange, mergeConversationMessages } from "@/lib/message-reactions";
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
  clearComposerDraft,
  readComposerDraft,
  saveComposerDraft,
  setSendInFlight,
} from "@/lib/app-update-composer";
import { isAppUpdateInProgress } from "@/lib/app-update";
import {
  createPendingComposerMedia,
  dragEventHasMediaFiles,
  firstMediaFileFromDataTransfer,
  revokePendingComposerMedia,
  validateComposerMediaFile,
  type PendingComposerMedia,
} from "@/lib/composer-media";

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

function getActiveMentionQuery(value: string): string | null {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    if (value[i] !== "@") continue;
    const segment = value.slice(i);
    if (segment.includes(" ")) return null;
    const query = segment.slice(1);
    if (query.startsWith("[")) return null;
    return query.toLowerCase();
  }
  return null;
}

function memberCanMention(member: Member): boolean {
  return Boolean(member.id && member.onCco !== false);
}

type Member = { id?: string; displayName: string; onCco?: boolean };

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
  const appUpdateBlocked = useAppUpdateGuard();
  const composerLocked = composerDisabled || appUpdateBlocked;
  const placeholder = composerPlaceholderForDevice(composerPlaceholder, coarsePointer);
  const { subscribeRealtime, session, realtimeConnected, activeConversationId } = useChatLayout();
  const messageActions = useMessageActionsReveal();
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
  const [lightboxImage, setLightboxImage] = useState<AttachmentLightboxImage | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<AttachmentLightboxImage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PendingComposerMedia | null>(null);
  const [composerDragOver, setComposerDragOver] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const composerDragDepthRef = useRef(0);
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
  const autoScrollToBottomRef = useRef(initialFirstUnreadMessageId == null);
  const pinnedToBottomRef = useRef(initialFirstUnreadMessageId == null);
  const initialScrollDoneRef = useRef(false);
  const messageSnapshotRef = useRef("");
  const bottomSeenMessageIdRef = useRef<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [scrollReady, setScrollReady] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    const draft = readComposerDraft(conversationId);
    if (draft) setBody(draft);
  }, [conversationId]);

  useEffect(() => {
    if (!appUpdateBlocked || !conversationId) return;
    saveComposerDraft(conversationId, body);
  }, [appUpdateBlocked, body, conversationId]);

  useEffect(() => {
    return () => revokePendingComposerMedia(pendingMedia);
  }, [pendingMedia]);

  const resetComposerDragState = useCallback(() => {
    composerDragDepthRef.current = 0;
    setComposerDragOver(false);
  }, []);

  useEffect(() => {
    setPendingMedia((current) => {
      revokePendingComposerMedia(current);
      return null;
    });
    resetComposerDragState();
  }, [conversationId, resetComposerDragState]);

  useEffect(() => {
    if (!canPost) return;

    const resetDrag = () => resetComposerDragState();
    window.addEventListener("dragend", resetDrag);
    return () => window.removeEventListener("dragend", resetDrag);
  }, [canPost, resetComposerDragState]);

  const canSendMessage = Boolean(body.trim() || pendingMedia) && !composerLocked && !isSending;

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
    if (!initialScrollDoneRef.current) return;
    if (firstUnreadMessageId) return;
    if (!pinnedToBottomRef.current && !autoScrollToBottomRef.current) return;
    const container = getScrollContainer();
    if (container) scrollMessagesToBottom(container);
  }, [body, composerLocked, conversationId, firstUnreadMessageId, layout, messages.length]);

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

  const lastMessageId = messages[messages.length - 1]?.id;

  useLayoutEffect(() => {
    if (messagesLoading || messages.length === 0) return;
    if (pendingScrollRestoreRef.current) return;
    if (loadingMoreRef.current) return;

    const lastId = messages.at(-1)?.id ?? "";
    const snapshot = `${messages.length}:${messages[0]?.id ?? ""}:${lastId}`;
    if (snapshot === messageSnapshotRef.current && initialScrollDoneRef.current) return;

    const prevLastId = messageSnapshotRef.current.split(":")[2] ?? "";
    const latestChanged = lastId !== prevLastId;
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
      const unreadTarget =
        unreadAnchorId &&
        messages.some((message) => message.id === unreadAnchorId)
          ? container.querySelector<HTMLElement>(`[data-message-id="${unreadAnchorId}"]`)
          : null;

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
  }, [firstUnreadMessageId, lastMessageId, messages.length, messagesLoading, layout, markBottomSeen]);

  useEffect(() => {
    const latestId = messages.at(-1)?.id;
    if (!latestId || pinnedToBottomRef.current) return;

    const seenId = bottomSeenMessageIdRef.current;
    if (seenId && latestId !== seenId) {
      setHasNewMessagesBelow(true);
    }
  }, [lastMessageId, messages]);

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
      setBody("");
      setMentionQuery(null);
      setSendError(null);
      setEditingId(null);
      setEditBody("");
      setFirstUnreadMessageId(initialFirstUnreadMessageId);
      hasMarkedReadRef.current = false;
      setMessages(sortMessagesByCreatedAt(initialMessages));
      setHasMore(initialHasMore);
      return;
    }

    if (messagesLoading) return;

    setMessages((prev) => mergeConversationMessages(prev, initialMessages));
    setHasMore((prev) =>
      messagesRef.current.length > initialMessages.length ? prev : initialHasMore,
    );
    setFirstUnreadMessageId((prev) => prev ?? initialFirstUnreadMessageId);
  }, [
    conversationId,
    initialMessages,
    initialHasMore,
    initialFirstUnreadMessageId,
    messagesLoading,
  ]);

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

  useEffect(() => subscribeRealtime(onEvent), [onEvent, subscribeRealtime]);
  useConversationPollFallback(
    conversationId,
    realtimeConnected && activeConversationId === conversationId,
    messagesLoading,
    setMessages,
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

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    const media = pendingMedia;
    if (
      !conversationId ||
      (!text && !media) ||
      sendInFlightRef.current ||
      !canPost ||
      composerLocked ||
      isAppUpdateInProgress()
    ) {
      return;
    }

    setMentionQuery(null);
    setSendError(null);
    sendInFlightRef.current = true;
    setSendInFlight(true);
    setIsSending(true);

    try {
      let attachmentUrl: string | undefined;
      let messageType: "image" | "video" | undefined;

      if (media) {
        attachmentUrl =
          media.kind === "video" ? await uploadVideo(media.file) : await uploadImage(media.file);
        messageType = media.kind;
      }

      await postMessage({
        body: text,
        clientMessageId: crypto.randomUUID(),
        ...(attachmentUrl ? { attachmentUrl, messageType } : {}),
      });

      if (media) {
        revokePendingComposerMedia(media);
        setPendingMedia(null);
      }
      setBody("");
      clearComposerDraft(conversationId);
      resetComposerDragState();
    } catch (err) {
      if (media) {
        revokePendingComposerMedia(media);
        const restored = createPendingComposerMedia(media.file);
        setPendingMedia(restored);
      }
      if (text) {
        setBody(text);
        saveComposerDraft(conversationId, text);
      }
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      sendInFlightRef.current = false;
      setSendInFlight(false);
      setIsSending(false);
      focusComposer();
    }
  }

  function clearPendingMedia() {
    setPendingMedia((current) => {
      revokePendingComposerMedia(current);
      return null;
    });
  }

  function stageComposerMedia(file: File) {
    if (!canPost || composerLocked || sendInFlightRef.current || isAppUpdateInProgress()) return;

    const validationError = validateComposerMediaFile(file);
    if (validationError) {
      setSendError(validationError);
      return;
    }

    const next = createPendingComposerMedia(file);
    if (!next) {
      setSendError("Unsupported file type. Use an image or video.");
      return;
    }

    setSendError(null);
    setPendingMedia((current) => {
      revokePendingComposerMedia(current);
      return next;
    });
    resetComposerDragState();
    focusComposer();
  }

  function handleComposerDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!canPost || composerLocked) return;
    if (!dragEventHasMediaFiles(e.dataTransfer)) return;

    e.preventDefault();
    composerDragDepthRef.current += 1;
    setComposerDragOver(true);
  }

  function handleComposerDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!canPost || composerLocked) return;
    if (!dragEventHasMediaFiles(e.dataTransfer)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setComposerDragOver(true);
  }

  function handleComposerDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
    if (composerDragDepthRef.current === 0) {
      setComposerDragOver(false);
    }
  }

  function handleComposerDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    resetComposerDragState();

    if (!canPost || composerLocked || sendInFlightRef.current || isAppUpdateInProgress()) return;

    const file = firstMediaFileFromDataTransfer(e.dataTransfer);
    if (file) stageComposerMedia(file);
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
    if (!memberCanMention(member) || !member.id) return;
    const token = formatMention(member.displayName, member.id);
    setBody((prev) => {
      const at = prev.lastIndexOf("@");
      if (at >= 0) return `${prev.slice(0, at)}${token} `;
      return `${prev}${token} `;
    });
    setMentionQuery(null);
    composerRef.current?.focus();
  }

  function handleBodyChange(value: string) {
    setBody(value);
    setMentionQuery(getActiveMentionQuery(value));
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (mentionQuery !== null) {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
      if (pendingMedia) {
        e.preventDefault();
        clearPendingMedia();
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      if (mentionQuery !== null) {
        const firstMentionable = mentionCandidates.find(memberCanMention);
        if (firstMentionable) {
          e.preventDefault();
          insertMention(firstMentionable);
          return;
        }
      }
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
                        <button
                          type="button"
                          className="attachment-open"
                          aria-label="View full image"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (messageActions.isRevealed(m.id)) return;
                            setLightboxImage({
                              src: resolveAttachmentDisplayUrl(m.attachmentUrl!),
                              alt: m.body || "Shared image",
                            });
                          }}
                        >
                          <img
                            src={resolveAttachmentDisplayUrl(m.attachmentUrl)}
                            alt={m.body || "Shared image"}
                            className="attachment"
                            draggable={false}
                          />
                        </button>
                      )}
                      {m.attachmentUrl && m.messageType === "video" && (
                        <VideoAttachmentPreview
                          label={m.body || "Shared video"}
                          onPlay={() => {
                            if (messageActions.isRevealed(m.id)) return;
                            setLightboxVideo({
                              src: resolveAttachmentDisplayUrl(m.attachmentUrl!),
                              alt: m.body || "Shared video",
                            });
                          }}
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

    </>
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

      {mentionQuery !== null && mentionCandidates.length > 0 && (
        <ul className="mention-suggestions" role="listbox" aria-label="Mention suggestions">
          {mentionCandidates.slice(0, 8).map((m) => {
            const canMention = memberCanMention(m);
            return (
              <li key={m.id ?? m.displayName}>
                <button
                  type="button"
                  role="option"
                  className={canMention ? undefined : "mention-suggestion--pending"}
                  disabled={!canMention}
                  aria-disabled={!canMention}
                  onClick={() => insertMention(m)}
                >
                  <span className="mention-suggestion-name">@{m.displayName}</span>
                  {!canMention ? (
                    <span className="mention-suggestion-hint">Not on CCO yet</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pendingMedia ? (
        <ComposerPendingMedia
          previewUrl={pendingMedia.previewUrl}
          kind={pendingMedia.kind}
          fileName={pendingMedia.file.name}
          onRemove={clearPendingMedia}
        />
      ) : null}

      {sendError ? (
        <p className="composer-send-error" role="alert">
          {sendError}
        </p>
      ) : null}

      {canPost ? (
        <form
          onSubmit={handleSend}
          className={[
            "composer",
            composerLocked ? "composer--locked" : "",
            pendingMedia ? "composer--has-pending-media" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.mp4,.webm,.mov"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) stageComposerMedia(file);
              e.target.value = "";
            }}
          />
          <ComposerAttachMenu
            disabled={composerLocked}
            onPickMedia={() => fileRef.current?.click()}
          />
          <textarea
            ref={composerRef}
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={placeholder}
            enterKeyHint="send"
            disabled={composerLocked}
            rows={1}
            aria-label="Message"
          />
          <button
            type="submit"
            className="composer-send"
            disabled={!canSendMessage}
            aria-label={isSending ? "Sending message" : "Send message"}
            aria-busy={isSending}
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
