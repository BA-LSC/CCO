"use client";

import { UserAvatar } from "@/components/UserAvatar";
import type { Message, PeerUser } from "@/lib/api";

type Props = {
  message: Message;
  peerUser: PeerUser | null;
  showPeerAvatar: boolean;
};

function isMessageSending(message: Message): boolean {
  return Boolean(message.pendingSend || message.pendingUpload);
}

function isMessageDelivered(message: Message): boolean {
  return !isMessageSending(message) && !message.uploadFailed;
}

export function findLastPeerReadMessageId(
  messages: Message[],
  resolvedUserId: string | undefined,
  peerLastReadAt: string | null,
): string | null {
  if (!peerLastReadAt || !resolvedUserId) return null;

  const readMs = new Date(peerLastReadAt).getTime();
  if (Number.isNaN(readMs)) return null;

  let lastId: string | null = null;

  for (const message of messages) {
    if (message.authorId !== resolvedUserId) continue;
    if (!isMessageDelivered(message)) continue;

    const sentMs = new Date(message.createdAt).getTime();
    if (Number.isNaN(sentMs) || sentMs > readMs) continue;

    lastId = message.id;
  }

  return lastId;
}

export function MessageDeliveryStatus({
  message,
  peerUser,
  showPeerAvatar,
}: Props) {
  const sending = isMessageSending(message);
  const delivered = isMessageDelivered(message);

  let label = "Sending";
  if (delivered && showPeerAvatar) label = "Read";
  else if (delivered) label = "Delivered";

  return (
    <div className="message-delivery-status" aria-label={label}>
      {sending ? (
        <span className="spinner message-delivery-spinner" aria-hidden />
      ) : delivered ? (
        <>
          <svg
            className="message-delivery-check"
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {showPeerAvatar && peerUser ? (
            <UserAvatar
              displayName={peerUser.displayName}
              avatarUrl={peerUser.avatarUrl}
              className="message-delivery-peer-avatar user-avatar"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
