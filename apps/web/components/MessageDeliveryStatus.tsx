"use client";

import { UserAvatar } from "@/components/UserAvatar";
import type { MemberReadReceipt, Message, PeerUser } from "@/lib/api";

type Props = {
  message: Message;
  peerUser: PeerUser | null;
  /** Peer read receipt on the last-read own message (1:1 DMs only). */
  showPeerAvatar: boolean;
  /** Delivery check only on the newest own message. */
  showDeliveryCheck: boolean;
  /** Group/team readers for the latest own message. */
  readByMembers?: MemberReadReceipt[];
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

export function getMessageReaders(
  message: Message,
  resolvedUserId: string | undefined,
  memberReadReceipts: MemberReadReceipt[],
): MemberReadReceipt[] {
  if (!resolvedUserId || message.authorId !== resolvedUserId) return [];
  if (!isMessageDelivered(message)) return [];

  const sentMs = new Date(message.createdAt).getTime();
  if (Number.isNaN(sentMs)) return [];

  return memberReadReceipts
    .filter((member) => {
      if (!member.lastReadAt) return false;
      const readMs = new Date(member.lastReadAt).getTime();
      if (Number.isNaN(readMs)) return false;
      return readMs >= sentMs;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function MessageDeliveryStatus({
  message,
  peerUser,
  showPeerAvatar,
  showDeliveryCheck,
  readByMembers = [],
}: Props) {
  const sending = isMessageSending(message);
  const delivered = isMessageDelivered(message);
  const showReaders = readByMembers.length > 0;

  let label = "Sending";
  if (delivered && (showPeerAvatar || showReaders)) label = "Read";
  else if (delivered && showDeliveryCheck) label = "Delivered";

  return (
    <div className="message-delivery-status" aria-label={label}>
      {sending ? (
        <span className="spinner message-delivery-spinner" aria-hidden />
      ) : delivered && (showDeliveryCheck || showPeerAvatar || showReaders) ? (
        <>
          {showReaders ? (
            <div className="message-delivery-readers" aria-hidden>
              {readByMembers.map((member) => (
                <UserAvatar
                  key={member.userId}
                  displayName={member.displayName}
                  avatarUrl={member.avatarUrl}
                  className="message-delivery-peer-avatar user-avatar"
                />
              ))}
            </div>
          ) : null}
          {showPeerAvatar && peerUser ? (
            <UserAvatar
              displayName={peerUser.displayName}
              avatarUrl={peerUser.avatarUrl}
              className="message-delivery-peer-avatar user-avatar"
            />
          ) : null}
          {showDeliveryCheck ? (
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
          ) : null}
        </>
      ) : null}
    </div>
  );
}
