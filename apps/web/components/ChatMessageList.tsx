"use client";

import { Fragment, memo, useMemo } from "react";
import {
  MessageBubbleStack,
  MessageEmojiActions,
} from "@/components/MessageReactionToolbar";
import { MessageBody } from "@/components/MessageBody";
import { MessageDeliveryStatus, findLastPeerReadMessageId, getMessageReaders } from "@/components/MessageDeliveryStatus";
import { UserAvatar } from "@/components/UserAvatar";
import { AttachmentVideoLightbox } from "@/components/AttachmentVideoLightbox";
import { VideoAttachmentPreview } from "@/components/VideoAttachmentPreview";
import {
  attachmentCacheKey,
  buildAttachmentDisplaySrcMap,
  resolveAttachmentDisplayUrl,
} from "@/lib/attachment-url";
import { buildMessageLayoutInfos, type MessageGroupPosition } from "@/lib/message-grouping";
import {
  formatMessageDayDivider,
  formatMessageTime,
} from "@/lib/message-time";
import { CallTimelineDivider } from "@/components/calls/CallTimelineDivider";
import {
  buildThreadTimeline,
  threadItemStartsNewDay,
  type CallTimelineEventDto,
} from "@/lib/call-timeline";
import type { MemberReadReceipt, Message, PeerUser } from "@/lib/api";
import type { AttachmentLightboxImage } from "@/components/AttachmentLightbox";
import type { useMessageActionsReveal } from "@/hooks/useMessageActionsReveal";

type MessageActionsReveal = ReturnType<typeof useMessageActionsReveal>;

type Member = { id?: string; displayName: string; onCco?: boolean };

function splitAttachmentBubbleGroupPosition(
  groupPosition: MessageGroupPosition,
): MessageGroupPosition {
  if (groupPosition === "single" || groupPosition === "first") return "first";
  return "middle";
}

function splitTextBubbleGroupPosition(groupPosition: MessageGroupPosition): MessageGroupPosition {
  if (groupPosition === "single") return "last";
  return groupPosition;
}

type Props = {
  conversationId: string;
  messages: Message[];
  callEvents?: CallTimelineEventDto[];
  messageEnterDelays?: ReadonlyMap<string, number>;
  firstUnreadMessageId: string | null;
  resolvedUserId?: string;
  isGroupLeader: boolean;
  editingId: string | null;
  editBody: string;
  sending: boolean;
  layout: "card" | "panel";
  messageActions: MessageActionsReveal;
  unreadDividerRef: React.RefObject<HTMLDivElement | null>;
  messagesListRef: React.RefObject<HTMLUListElement | null>;
  messagesEndRef: React.RefObject<HTMLLIElement | null>;
  onScrollContainer?: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onStartEdit: (messageId: string, body: string) => void;
  onEditBodyChange: (body: string) => void;
  onSaveEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onDeleteTarget: (messageId: string) => void;
  onOpenImage: (image: AttachmentLightboxImage) => void;
  onOpenVideo: (video: AttachmentLightboxImage) => void;
  isDirectMessage?: boolean;
  peerLastReadAt?: string | null;
  peerUser?: PeerUser | null;
  memberReadReceipts?: MemberReadReceipt[];
};

function ChatMessageListInner({
  conversationId,
  messages,
  callEvents = [],
  messageEnterDelays,
  firstUnreadMessageId,
  resolvedUserId,
  isGroupLeader,
  editingId,
  editBody,
  sending,
  layout,
  messageActions,
  unreadDividerRef,
  messagesListRef,
  messagesEndRef,
  onScrollContainer,
  onToggleReaction,
  onStartEdit,
  onEditBodyChange,
  onSaveEdit,
  onCancelEdit,
  onDeleteTarget,
  onOpenImage,
  onOpenVideo,
  isDirectMessage = false,
  peerLastReadAt = null,
  peerUser = null,
  memberReadReceipts = [],
}: Props) {
  const layoutInfos = useMemo(
    () => buildMessageLayoutInfos(messages, resolvedUserId),
    [messages, resolvedUserId],
  );

  const timeline = useMemo(
    () => buildThreadTimeline(messages, callEvents),
    [messages, callEvents],
  );

  const messageIndexById = useMemo(() => {
    const map = new Map<string, number>();
    messages.forEach((message, index) => map.set(message.id, index));
    return map;
  }, [messages]);

  const lastOwnMessageId = useMemo(() => {
    if (!resolvedUserId) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      if (message.authorId === resolvedUserId) return message.id;
    }
    return null;
  }, [messages, resolvedUserId]);

  const lastPeerReadMessageId = useMemo(
    () =>
      isDirectMessage
        ? findLastPeerReadMessageId(messages, resolvedUserId, peerLastReadAt)
        : null,
    [isDirectMessage, messages, peerLastReadAt, resolvedUserId],
  );

  function isOwnMessage(message: Message): boolean {
    return Boolean(resolvedUserId && message.authorId === resolvedUserId);
  }

  function canEditMessage(message: Message): boolean {
    return Boolean(
      resolvedUserId &&
        message.authorId === resolvedUserId &&
        !message.pendingUpload &&
        !message.uploadFailed,
    );
  }

  function canDeleteMessage(message: Message): boolean {
    if (message.pendingUpload || message.uploadFailed) return false;
    if (isOwnMessage(message)) return true;
    return isGroupLeader;
  }

  const attachmentDisplaySrcMap = useMemo(
    () => buildAttachmentDisplaySrcMap(messages.map((message) => message.attachmentUrl)),
    [messages],
  );

  function messageAttachmentSrc(message: Message): string | null {
    if (message.pendingUpload && message.localPreviewUrl) return message.localPreviewUrl;
    if (!message.attachmentUrl) return null;
    const key = attachmentCacheKey(message.attachmentUrl);
    return attachmentDisplaySrcMap.get(key) ?? resolveAttachmentDisplayUrl(message.attachmentUrl);
  }

  function messageAttachmentDisplaySrc(attachmentUrl: string): string {
    const key = attachmentCacheKey(attachmentUrl);
    return attachmentDisplaySrcMap.get(key) ?? resolveAttachmentDisplayUrl(attachmentUrl);
  }

  return (
    <ul
      className="messages"
      ref={messagesListRef}
      aria-label="Messages"
      onScroll={layout === "panel" ? undefined : onScrollContainer}
    >
      {timeline.map((item, index) => {
        if (item.kind === "call") {
          return (
            <Fragment key={item.call.id}>
              {threadItemStartsNewDay(timeline, index) && (
                <li className="messages-day-divider-wrap" aria-hidden={false}>
                  <div className="messages-day-divider" role="separator">
                    <time dateTime={item.at}>{formatMessageDayDivider(item.at)}</time>
                  </div>
                </li>
              )}
              <li className="messages-call-divider-wrap" aria-hidden={false}>
                <CallTimelineDivider event={item.call} conversationId={conversationId} />
              </li>
            </Fragment>
          );
        }

        const m = item.message;
        const messageIndex = messageIndexById.get(m.id) ?? 0;
        const isOwn = isOwnMessage(m);
        const isEditing = editingId === m.id;
        const layoutInfo = layoutInfos[messageIndex]!;
        const showOwnMessageHeader =
          isOwn &&
          (layoutInfo.groupPosition === "first" ||
            layoutInfo.groupPosition === "single" ||
            layoutInfo.clusterTimestamp ||
            Boolean(m.editedAt));
        const hasVisibleTimestamp = showOwnMessageHeader || (!isOwn && layoutInfo.showAuthorName);
        const isSending = Boolean(m.pendingSend || m.pendingUpload);
        const bodyText = m.body.trim();
        const hasMediaAttachment = Boolean(
          messageAttachmentSrc(m) && (m.messageType === "image" || m.messageType === "video"),
        );
        const splitMediaAndText = hasMediaAttachment && bodyText.length > 0;
        const actionsOnTextBubble = Boolean(bodyText) || !hasMediaAttachment;
        const isLatestOwn = isOwn && m.id === lastOwnMessageId;
        const isLastPeerRead = isDirectMessage && m.id === lastPeerReadMessageId;
        const messageReaders =
          !isDirectMessage && isLatestOwn
            ? getMessageReaders(m, resolvedUserId, memberReadReceipts)
            : [];
        const showDeliveryFooter =
          isOwn &&
          !isEditing &&
          (isLatestOwn || isLastPeerRead || isSending);
        const showPeerAvatar = isLastPeerRead;
        const showDeliveryCheck = isLatestOwn;
        const enterDelayMs = messageEnterDelays?.get(m.id);

        return (
          <Fragment key={m.clientMessageId ?? m.id}>
            {threadItemStartsNewDay(timeline, index) && (
              <li className="messages-day-divider-wrap" aria-hidden={false}>
                <div className="messages-day-divider" role="separator">
                  <time dateTime={m.createdAt}>{formatMessageDayDivider(m.createdAt)}</time>
                </div>
              </li>
            )}
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
                enterDelayMs !== undefined ? "message-item--enter" : "",
                hasVisibleTimestamp ? "message-item--has-timestamp" : "",
                showOwnMessageHeader ? "message-item--show-time" : "",
                layoutInfo.showTimestamp ? "message-item--timestamp-start" : "",
                layoutInfo.nextHasGapBreak ? "message-item--timestamp-gap" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                enterDelayMs !== undefined
                  ? ({ "--message-enter-delay": `${enterDelayMs}ms` } as React.CSSProperties)
                  : undefined
              }
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
                    <time dateTime={m.createdAt}>{formatMessageTime(m.createdAt)}</time>
                    {m.editedAt ? <span className="message-edited"> · edited</span> : null}
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
                      void onSaveEdit(m.id);
                    }}
                  >
                    <input
                      value={editBody}
                      onChange={(e) => onEditBodyChange(e.target.value)}
                      disabled={sending}
                      aria-label="Edit message"
                    />
                    <button type="submit" className="btn-send" disabled={sending}>
                      Save
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={onCancelEdit}>
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
                      onToggleReaction={onToggleReaction}
                      reactionAlign={isOwn ? "own" : "other"}
                    >
                      {hasMediaAttachment ? (
                        <div
                          className={[
                            "message-bubble",
                            isOwn ? "message-bubble--own" : "message-bubble--other",
                            `message-bubble--group-${
                              splitMediaAndText
                                ? splitAttachmentBubbleGroupPosition(layoutInfo.groupPosition)
                                : layoutInfo.groupPosition
                            }`,
                            "message-bubble--media-only",
                            !actionsOnTextBubble && messageActions.isRevealed(m.id)
                              ? "message-bubble--actions-visible"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...(!actionsOnTextBubble ? messageActions.getBubbleHandlers(m.id) : {})}
                        >
                          {!actionsOnTextBubble && !m.pendingUpload && !m.uploadFailed ? (
                            <span className="message-actions">
                              <MessageEmojiActions
                                messageId={m.id}
                                reactions={m.reactions ?? []}
                                currentUserId={resolvedUserId}
                                onToggleReaction={onToggleReaction}
                              />
                              {(canEditMessage(m) || canDeleteMessage(m)) && (
                                <span className="message-actions-divider" aria-hidden />
                              )}
                              {canEditMessage(m) && (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => onStartEdit(m.id, m.body)}
                                >
                                  Edit
                                </button>
                              )}
                              {canDeleteMessage(m) && (
                                <button
                                  type="button"
                                  className="link-btn danger"
                                  onClick={() => onDeleteTarget(m.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </span>
                          ) : null}
                          {messageAttachmentSrc(m) && m.messageType === "image" && (
                            <button
                              type="button"
                              className={[
                                "attachment-open",
                                m.pendingUpload ? "attachment-open--uploading" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-label={m.pendingUpload ? "Uploading image" : "View full image"}
                              aria-busy={m.pendingUpload || undefined}
                              disabled={m.pendingUpload}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (
                                  messageActions.isRevealed(m.id) ||
                                  m.pendingUpload ||
                                  !m.attachmentUrl
                                ) {
                                  return;
                                }
                                onOpenImage({
                                  src: messageAttachmentDisplaySrc(m.attachmentUrl),
                                  alt: "Shared image",
                                });
                              }}
                            >
                              <img
                                src={messageAttachmentSrc(m)!}
                                alt="Shared image"
                                className="attachment"
                                draggable={false}
                              />
                              {m.pendingUpload ? (
                                <span className="attachment-upload-overlay" aria-hidden="true">
                                  <span className="spinner" />
                                </span>
                              ) : null}
                            </button>
                          )}
                          {messageAttachmentSrc(m) && m.messageType === "video" && !m.pendingUpload && (
                            <VideoAttachmentPreview
                              label="Shared video"
                              src={messageAttachmentSrc(m)!}
                              onPlay={() => {
                                if (messageActions.isRevealed(m.id) || !m.attachmentUrl) return;
                                onOpenVideo({
                                  src: messageAttachmentDisplaySrc(m.attachmentUrl),
                                  alt: "Shared video",
                                });
                              }}
                            />
                          )}
                          {m.pendingUpload && m.localPreviewUrl && m.messageType === "video" && (
                            <button
                              type="button"
                              className="attachment-open attachment-open--uploading attachment-video-preview"
                              aria-label="Uploading video"
                              aria-busy
                              disabled
                            >
                              <video
                                className="attachment attachment-video-preview-video attachment-video-preview-video--ready"
                                src={m.localPreviewUrl}
                                muted
                                playsInline
                                preload="metadata"
                                aria-hidden="true"
                              />
                              <span className="attachment-upload-overlay" aria-hidden="true">
                                <span className="spinner" />
                              </span>
                            </button>
                          )}
                        </div>
                      ) : null}
                      {bodyText ? (
                        <div
                          className={[
                            "message-bubble",
                            isOwn ? "message-bubble--own" : "message-bubble--other",
                            `message-bubble--group-${
                              splitMediaAndText
                                ? splitTextBubbleGroupPosition(layoutInfo.groupPosition)
                                : layoutInfo.groupPosition
                            }`,
                            actionsOnTextBubble && messageActions.isRevealed(m.id)
                              ? "message-bubble--actions-visible"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          {...(actionsOnTextBubble ? messageActions.getBubbleHandlers(m.id) : {})}
                        >
                          {actionsOnTextBubble && !m.pendingUpload && !m.uploadFailed ? (
                            <span className="message-actions">
                              <MessageEmojiActions
                                messageId={m.id}
                                reactions={m.reactions ?? []}
                                currentUserId={resolvedUserId}
                                onToggleReaction={onToggleReaction}
                              />
                              {(canEditMessage(m) || canDeleteMessage(m)) && (
                                <span className="message-actions-divider" aria-hidden />
                              )}
                              {canEditMessage(m) && (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => onStartEdit(m.id, m.body)}
                                >
                                  Edit
                                </button>
                              )}
                              {canDeleteMessage(m) && (
                                <button
                                  type="button"
                                  className="link-btn danger"
                                  onClick={() => onDeleteTarget(m.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </span>
                          ) : null}
                          <MessageBody body={bodyText} currentUserId={resolvedUserId} />
                        </div>
                      ) : null}
                    </MessageBubbleStack>
                    {showDeliveryFooter ? (
                      <div className="message-footer">
                        <MessageDeliveryStatus
                          message={m}
                          peerUser={peerUser}
                          showPeerAvatar={showPeerAvatar}
                          showDeliveryCheck={showDeliveryCheck}
                          readByMembers={messageReaders}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </li>
          </Fragment>
        );
      })}
      <li className="messages-scroll-anchor" ref={messagesEndRef} aria-hidden />
    </ul>
  );
}

export const ChatMessageList = memo(ChatMessageListInner);
