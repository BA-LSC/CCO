"use client";

import { usePresence } from "@/components/PresenceProvider";

type Props = {
  userId: string;
  preview?: string | null;
  className?: string;
};

export function DmSidebarSubtitle({ userId, preview, className = "sidebar-dm-status" }: Props) {
  const { getUserStatus } = usePresence();
  const statusMessage = getUserStatus(userId)?.message?.trim();
  if (statusMessage) {
    return <span className={className}>{statusMessage}</span>;
  }

  const text = preview?.trim();
  if (!text) return null;
  return <span className={className}>{text}</span>;
}
