"use client";

import { Fragment, memo, useMemo } from "react";
import {
  MessageBubbleStack,
  MessageEmojiActions,
} from "@/components/MessageReactionToolbar";
import { MessageBody } from "@/components/MessageBody";
import { UserAvatar } from "@/components/UserAvatar";
import { AttachmentVideoLightbox } from "@/components/AttachmentVideoLightbox";
import { VideoAttachmentPreview } from "@/components/VideoAttachmentPreview";
import { resolveAttachmentDisplayUrl } from "@/lib/attachment-url";
import { buildMessageLayoutInfos } from "@/lib/message-grouping";
import type { Message } from "@/lib/api";
import type { AttachmentLightboxImage } from "@/components/AttachmentLightbox";
import type { useMessageActionsReveal } from "@/hooks/useMessageActionsReveal";

type MessageActionsReveal = ReturnType<typeof useMessageActionsReveal>;

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

type Member = { id?: string; displayName: string; onCco?: boolean };

type Props = {
  messages: Message[];
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
};

function ChatMessageListInner({
  messages,
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
}: Props) {
  const layoutInfos = useMemo(
    () => buildMessageLayoutInfos(messages, resolvedUserId),
    [messages, resolvedUserId],
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

  return (
    <ul
      className="messages"
      ref={messagesListRef}
      aria-label="Messages"
      onScroll={layout === "panel" ? undefined : onScrollContainer}
    >
      {messages.map((m, index) => {
        const isOwn = isOwnMessage(m);
        const isEditing = editingId === m.id;
        const layoutInfo = layoutInfos[index]!;
        const showOwnMessageHeader =
          isOwn &&
          (layoutInfo.groupPosition === "first" ||
            layoutInfo.groupPosition === "single" ||
            layoutInfo.clusterTimestamp ||
            Boolean(m.editedAt));
        const hasVisibleTimestamp = showOwnMessageHeader || (!isOwn && layoutInfo.showAuthorName);

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
                        {m.attachmentUrl && m.messageType === "image" && (
                          <button
                            type="button"
                            className="attachment-open"
                            aria-label="View full image"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (messageActions.isRevealed(m.id)) return;
                              onOpenImage({
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
                            src={resolveAttachmentDisplayUrl(m.attachmentUrl!)}
                            onPlay={() => {
                              if (messageActions.isRevealed(m.id)) return;
                              onOpenVideo({
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
  );
}

export const ChatMessageList = memo(ChatMessageListInner);
