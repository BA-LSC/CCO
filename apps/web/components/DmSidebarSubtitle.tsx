"use client";

import { usePresence } from "@/components/PresenceProvider";

type Props = {
  userId: string;
  preview?: string | null;
  className?: string;
};

/** Discord-style "You:" / "Name:" prefix before the message snippet. */
function renderMessagePreview(text: string, className: string) {
  const match = text.match(/^(You|[^:]+):\s([\s\S]+)$/);
  if (!match) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      <span className="sidebar-dm-preview-prefix">{match[1]}: </span>
      {match[2]}
    </span>
  );
}

export function DmSidebarSubtitle({ userId, preview, className = "sidebar-dm-status" }: Props) {
  const { getUserStatus } = usePresence();
  const statusMessage = getUserStatus(userId)?.message?.trim();
  if (statusMessage) {
    return <span className={className}>{statusMessage}</span>;
  }

  const text = preview?.trim();
  if (!text) return null;
  return renderMessagePreview(text, className);
}
