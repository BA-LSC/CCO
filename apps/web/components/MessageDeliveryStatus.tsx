"use client";

import { UserAvatar } from "@/components/UserAvatar";
import type { Message, PeerUser } from "@/lib/api";

type Props = {
  message: Message;
  peerLastReadAt: string | null;
  peerUser: PeerUser | null;
  showPeerReadReceipt: boolean;
};

function isMessageReadByPeer(message: Message, peerLastReadAt: string | null): boolean {
  if (!peerLastReadAt) return false;
  const readMs = new Date(peerLastReadAt).getTime();
  const sentMs = new Date(message.createdAt).getTime();
  return !Number.isNaN(readMs) && !Number.isNaN(sentMs) && sentMs <= readMs;
}

function isMessageSending(message: Message): boolean {
  return Boolean(message.pendingSend || message.pendingUpload);
}

function isMessageDelivered(message: Message): boolean {
  return !isMessageSending(message) && !message.uploadFailed;
}

export function MessageDeliveryStatus({
  message,
  peerLastReadAt,
  peerUser,
  showPeerReadReceipt,
}: Props) {
  const sending = isMessageSending(message);
  const delivered = isMessageDelivered(message);
  const readByPeer =
    showPeerReadReceipt && delivered && isMessageReadByPeer(message, peerLastReadAt);

  let label = "Sending";
  if (delivered && readByPeer) label = "Read";
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
          {readByPeer && peerUser ? (
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
